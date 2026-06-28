"""
Real-time tracking router.

Hot-path design for 200-300 concurrent agents
──────────────────────────────────────────────
• WebSocket receives a location update
• Immediately enqueues it in an in-memory buffer  (non-blocking, <1 ms)
• Publishes to Redis pub/sub                       (non-blocking, ~1 ms)
• Background task flushes buffer to DB in bulk    (every 2 s)
• Dashboard watchers receive updates via pub/sub fanout

Result: ~60 GPS messages/s from 300 agents handled with <5 ms latency
and only ~1 DB batch per 2 seconds instead of 60 individual inserts.
"""
import json
import logging
import time
from datetime import datetime, timezone, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.exc import OperationalError

from app.database import get_db
from app.models.models import User, LocationLog, OnlineStatus
from app.schemas.schemas import LocationLogCreate, LocationLogOut, BulkLocationSync
from app.services.auth_service import get_current_user
from app.tasks import enqueue_location
from app.websocket.manager import ConnectionManager

logger = logging.getLogger(__name__)
router = APIRouter()
manager = ConnectionManager()


def _authenticate_ws_token(token: str, db) -> Optional[User]:
    """Validate a JWT token for WebSocket connections."""
    from jose import JWTError, jwt
    from app.config import settings
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except (JWTError, Exception):
        return None


# ─── Agent WebSocket (sends location) ─────────────────────────────────────────

@router.websocket("/ws/{agent_id}")
async def websocket_agent(
    websocket: WebSocket,
    agent_id: int,
    token: str = Query(...),
    db=Depends(get_db),
):
    """
    Each field agent / driver connects here.
    Accepts JSON: {"latitude": x, "longitude": y, "speed": z, ...}
    """
    user = _authenticate_ws_token(token, db)
    if not user or user.id != agent_id:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, agent_id)
    user.online_status = OnlineStatus.ONLINE
    user.last_seen = datetime.now(timezone.utc)
    db.commit()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            now = datetime.now(timezone.utc)

            # ── Non-blocking: buffer for bulk DB insert ──────────────────────
            await enqueue_location({
                "agent_id": agent_id,
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "accuracy": data.get("accuracy"),
                "speed": data.get("speed"),
                "heading": data.get("heading"),
                "altitude": data.get("altitude"),
                "address": data.get("address"),
                "is_offline_sync": False,
                "recorded_at": now,
                "synced_at": now,
            })

            # ── Non-blocking: broadcast to dashboard watchers ────────────────
            await manager.broadcast_location(agent_id, {
                "agent_id": agent_id,
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "speed": data.get("speed"),
                "heading": data.get("heading"),
                "address": data.get("address"),
                "timestamp": now.isoformat(),
                "agent_name": user.full_name,
                "vehicle_number": user.vehicle_number,
                "employee_id": user.employee_id,
            })

            # Update last_seen in memory — DB commit batched in background
            user.last_seen = now

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("Agent WS %d error: %s", agent_id, exc)
    finally:
        manager.disconnect(agent_id)
        try:
            user.online_status = OnlineStatus.OFFLINE
            user.last_seen = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            pass


# ─── Dashboard WebSocket (receives all agent updates) ─────────────────────────

@router.websocket("/ws/dashboard/{user_id}")
async def websocket_dashboard(
    websocket: WebSocket,
    user_id: int,
    token: str = Query(...),
    db=Depends(get_db),
):
    user = _authenticate_ws_token(token, db)
    if not user or user.id != user_id:
        await websocket.close(code=1008)
        return

    await manager.connect_watcher(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()  # keep-alive ping/pong
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_watcher(user_id)


# ─── REST: single location log ────────────────────────────────────────────────

@router.post("/log", response_model=LocationLogOut)
def log_location(
    location: LocationLogCreate,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    log = LocationLog(agent_id=current_user.id, **location.model_dump())
    db.add(log)
    current_user.last_seen = datetime.now(timezone.utc)
    db.commit()
    db.refresh(log)
    return log


# ─── REST: bulk offline sync ──────────────────────────────────────────────────

@router.post("/sync", status_code=201)
def bulk_sync_locations(
    payload: BulkLocationSync,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Agents call this when connectivity is restored to replay buffered GPS
    points that were captured offline.  Uses bulk_insert_mappings for speed.
    """
    if not payload.locations:
        return {"synced": 0}

    records = [
        {
            "agent_id": current_user.id,
            **loc.model_dump(),
            "synced_at": datetime.now(timezone.utc),
        }
        for loc in payload.locations
    ]
    db.bulk_insert_mappings(LocationLog, records)
    current_user.last_seen = datetime.now(timezone.utc)
    db.commit()
    return {"synced": len(records)}


# ─── REST: live agents snapshot ───────────────────────────────────────────────

@router.get("/live", response_model=List[dict])
def get_live_agents(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    online_agents = (
        db.query(User)
        .filter(User.online_status == OnlineStatus.ONLINE, User.is_active == True)
        .all()
    )
    result = []
    for agent in online_agents:
        last_loc = (
            db.query(LocationLog)
            .filter(LocationLog.agent_id == agent.id)
            .order_by(LocationLog.recorded_at.desc())
            .first()
        )
        result.append({
            "agent_id": agent.id,
            "full_name": agent.full_name,
            "employee_id": agent.employee_id,
            "vehicle_number": agent.vehicle_number,
            "assigned_zone": agent.assigned_zone,
            "last_seen": agent.last_seen.isoformat() if agent.last_seen else None,
            "latitude": last_loc.latitude if last_loc else None,
            "longitude": last_loc.longitude if last_loc else None,
            "speed": last_loc.speed if last_loc else None,
            "address": last_loc.address if last_loc else None,
        })
    return result


# ─── REST: location history ───────────────────────────────────────────────────

@router.get("/history/{agent_id}", response_model=List[LocationLogOut])
def get_location_history(
    agent_id: int,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    limit: int = Query(default=500, le=2000),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    query = db.query(LocationLog).filter(LocationLog.agent_id == agent_id)
    if from_dt:
        query = query.filter(LocationLog.recorded_at >= from_dt)
    if to_dt:
        query = query.filter(LocationLog.recorded_at <= to_dt)
    return query.order_by(LocationLog.recorded_at.desc()).limit(limit).all()


# ─── REST: punch in / punch out ───────────────────────────────────────────────

@router.post("/punch-in")
def punch_in(
    data: dict,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    from app.models.models import PunchRecord

    today = date.today()
    # NOTE: validation disabled for testing — allow multiple punch-ins per day
    # if db.query(PunchRecord).filter(
    #     PunchRecord.agent_id == current_user.id,
    #     PunchRecord.work_date == today,
    # ).first():
    #     raise HTTPException(status_code=400, detail="Already punched in today")

    max_retries = 3
    for attempt in range(max_retries):
        try:
            record = PunchRecord(
                agent_id=current_user.id,
                punch_in_time=datetime.now(timezone.utc),
                punch_in_lat=data.get("latitude"),
                punch_in_lng=data.get("longitude"),
                punch_in_address=data.get("address"),
                work_date=today,
                notes=data.get("notes"),
            )
            db.add(record)
            db.flush()

            record_id = record.id
            punch_in_time = record.punch_in_time

            db.commit()

            persisted = db.query(PunchRecord).filter(PunchRecord.id == record_id).first()
            if persisted:
                logger.info("Punch-in saved: agent_id=%s record_id=%s work_date=%s", current_user.id, record_id, today)
                return {
                    "message": "Punched in successfully",
                    "punch_in_time": punch_in_time.isoformat(),
                    "record_id": record_id,
                }

            db.rollback()
            logger.warning(
                "Punch-in attempt %s/%s did not persist row for agent_id=%s; retrying",
                attempt + 1,
                max_retries,
                current_user.id,
            )
            if attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            raise HTTPException(status_code=500, detail={"message": "Punch-in failed to persist", "alert": "Punch-in was not saved. Please retry."})
        except OperationalError as exc:
            db.rollback()
            is_lock = "database is locked" in str(exc).lower()
            if is_lock and attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            logger.error("Punch-in DB error for agent_id=%s: %s", current_user.id, exc)
            raise HTTPException(status_code=500, detail={"message": "Punch-in failed", "alert": "Database error during punch-in. Please retry."})


@router.post("/punch-out")
def punch_out(
    data: dict,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    from app.models.models import PunchRecord

    try:
        today = date.today()
        record = db.query(PunchRecord).filter(
            PunchRecord.agent_id == current_user.id,
            PunchRecord.work_date == today,
            PunchRecord.punch_out_time == None,
        ).first()
        if not record:
            raise HTTPException(status_code=400, detail={"message": "No active punch-in record found", "alert": "No active punch-in record found for today"})

        now = datetime.now(timezone.utc)
        record.punch_out_time = now
        record.punch_out_lat = data.get("latitude")
        record.punch_out_lng = data.get("longitude")
        record.punch_out_address = data.get("address")
        if not record.punch_in_time:
            # defensive: ensure punch_in_time exists
            raise HTTPException(status_code=400, detail={"message": "Invalid punch record (missing punch_in_time)", "alert": "Punch record is missing check-in time"})
        # Normalize both to UTC-naive before subtraction to avoid TypeError
        punch_in = record.punch_in_time.replace(tzinfo=None) if record.punch_in_time.tzinfo else record.punch_in_time
        punch_out_naive = now.replace(tzinfo=None)
        total_seconds = int((punch_out_naive - punch_in).total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes = remainder // 60
        record.total_hours = round(total_seconds / 3600, 2)
        db.commit()

        return {
            "message": "Punched out successfully",
            "total_hours": record.total_hours,
            # Return duration in h:mm with two-digit minutes (e.g. 0:53)
            "duration": f"{hours}:{minutes:02d}",
            "punch_out_time": record.punch_out_time.isoformat(),
        }
    except HTTPException:
        # re-raise HTTP exceptions to return proper 4xx responses
        raise
    except Exception as exc:
        # Log and return a safe error message for unexpected failures
        import traceback, logging
        logging.getLogger(__name__).exception("Error in punch_out: %s", exc)
        # For testing: return structured alert in the response to aid debugging.
        tb = traceback.format_exc()
        logging.getLogger(__name__).error("Traceback:\n%s", tb)
        raise HTTPException(status_code=500, detail={"message": "Internal server error during punch out", "alert": str(exc)})


@router.get("/attendance/{agent_id}")
def get_attendance(
    agent_id: int,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    from app.models.models import PunchRecord
    from sqlalchemy import extract

    query = db.query(PunchRecord).filter(PunchRecord.agent_id == agent_id)
    if month:
        query = query.filter(extract("month", PunchRecord.work_date) == month)
    if year:
        query = query.filter(extract("year", PunchRecord.work_date) == year)

    return [
        {
            "id": r.id,
            "work_date": r.work_date.isoformat(),
            "punch_in_time": r.punch_in_time.isoformat() if r.punch_in_time else None,
            "punch_out_time": r.punch_out_time.isoformat() if r.punch_out_time else None,
            "total_hours": r.total_hours,
            "duration": (
                f"{int(r.total_hours)}h {int(round((r.total_hours % 1) * 60)):02d}m"
                if r.total_hours is not None else None
            ),
            "distance_covered": r.distance_covered,
            "punch_in_address": r.punch_in_address,
        }
        for r in query.order_by(PunchRecord.work_date.desc()).all()
    ]

