from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, datetime
import csv
import io

from app.database import get_db
from app.services.auth_service import get_current_user
from app.models.models import PunchRecord, User, UserRole
from app.schemas.schemas import PunchRecordOut

router = APIRouter()


def admin_only(user: User = Depends(get_current_user)):
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/", response_model=List[PunchRecordOut])
def list_attendance(
    start: Optional[date] = None,
    end: Optional[date] = None,
    agent_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    q = db.query(PunchRecord)
    if agent_id:
        q = q.filter(PunchRecord.agent_id == agent_id)
    if start:
        q = q.filter(PunchRecord.work_date >= start)
    if end:
        q = q.filter(PunchRecord.work_date <= end)
    results = q.order_by(PunchRecord.work_date.desc()).all()
    return results


@router.put("/{record_id}", response_model=PunchRecordOut)
def adjust_attendance(record_id: int, updates: dict, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    rec = db.query(PunchRecord).filter(PunchRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    # allow adjusting in/out times, notes, total_hours
    for k in ("punch_in_time", "punch_out_time", "punch_in_lat", "punch_in_lng", "punch_out_lat", "punch_out_lng", "notes", "total_hours"):
        if k in updates:
            val = updates[k]
            # parse datetimes if strings
            if k in ("punch_in_time", "punch_out_time") and isinstance(val, str):
                val = datetime.fromisoformat(val)
            setattr(rec, k, val)
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/export")
def export_attendance(start: Optional[date] = None, end: Optional[date] = None, agent_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    q = db.query(PunchRecord)
    if agent_id:
        q = q.filter(PunchRecord.agent_id == agent_id)
    if start:
        q = q.filter(PunchRecord.work_date >= start)
    if end:
        q = q.filter(PunchRecord.work_date <= end)
    rows = q.order_by(PunchRecord.work_date).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id","agent_id","work_date","punch_in_time","punch_out_time","total_hours","notes"])
    for r in rows:
        writer.writerow([
            r.id, r.agent_id, r.work_date.isoformat() if r.work_date else "",
            r.punch_in_time.isoformat() if r.punch_in_time else "",
            r.punch_out_time.isoformat() if r.punch_out_time else "",
            r.total_hours if r.total_hours is not None else "",
            r.notes or "",
        ])
    output.seek(0)
    return StreamingResponse(output, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=attendance.csv"})
