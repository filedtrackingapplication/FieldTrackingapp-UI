from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone

from app.database import get_db
from app.models.models import Visit, User, Customer, VisitStatus, UserRole
from app.schemas.schemas import VisitCreate, VisitCheckIn, VisitCheckOut, VisitOut
from app.services.auth_service import get_current_user
from app.services.auth_service import require_roles
from fastapi import UploadFile, File
import csv
from io import StringIO

router = APIRouter()


@router.get('/meta/statuses')
def visit_statuses():
    """Return available visit statuses"""
    return [{"value": s.value, "label": s.name.replace('_', ' ').title()} for s in VisitStatus]


@router.get('/meta/types')
def visit_types():
    """Return available visit types (static list for now)"""
    types = [
        {"value": "customer_followup", "label": "Customer Followup"},
        {"value": "order_taking", "label": "Order Taking"},
        {"value": "payment_collection", "label": "Payment Collection"},
    ]
    return types


@router.post("/", response_model=VisitOut, status_code=201)
def create_visit(
    visit_data: VisitCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(Customer.id == visit_data.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    visit = Visit(
        agent_id=current_user.id,
        customer_id=visit_data.customer_id,
        visit_date=visit_data.visit_date,
        purpose=visit_data.purpose,
        notes=visit_data.notes,
        status=VisitStatus.PLANNED,
        check_in_time=visit_data.start_datetime,
        check_out_time=visit_data.end_datetime,
        duration_minutes=visit_data.duration_minutes,
    )
    
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit


@router.get("/", response_model=List[VisitOut])
def list_visits(
    agent_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    visit_date: Optional[date] = None,
    status: Optional[VisitStatus] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import UserRole
    query = db.query(Visit)

    if current_user.role == UserRole.FIELD_AGENT or current_user.role == UserRole.DRIVER:
        query = query.filter(Visit.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(Visit.agent_id == agent_id)

    if customer_id:
        query = query.filter(Visit.customer_id == customer_id)
    if visit_date:
        query = query.filter(Visit.visit_date == visit_date)
    if status:
        query = query.filter(Visit.status == status)

    results = query.order_by(Visit.visit_date.desc()).offset(skip).limit(limit).all()
    # Normalize duration_minutes which may have been stored incorrectly as a datetime
    from datetime import datetime as _dt, timedelta as _td
    from typing import Any
    for v in results:
        dm: Any = getattr(v, 'duration_minutes', None)
        if dm is None:
            continue
        try:
            # timedelta -> minutes
            if isinstance(dm, _td):
                v.duration_minutes = int(dm.total_seconds() / 60)
                continue
            # datetime -> treat as epoch+seconds encoding
            if isinstance(dm, _dt):
                epoch = _dt(1970, 1, 1, tzinfo=dm.tzinfo)
                v.duration_minutes = int((dm - epoch).total_seconds() / 60)
                continue
            # string -> try parse as ISO datetime, or numeric string
            if isinstance(dm, str):
                try:
                    parsed = _dt.fromisoformat(dm)
                    epoch = _dt(1970, 1, 1, tzinfo=parsed.tzinfo)
                    v.duration_minutes = int((parsed - epoch).total_seconds() / 60)
                    continue
                except Exception:
                    try:
                        v.duration_minutes = int(float(dm))
                        continue
                    except Exception:
                        v.duration_minutes = None
                        continue
            # numeric types
            try:
                v.duration_minutes = int(dm)
            except Exception:
                v.duration_minutes = None
        except Exception:
            v.duration_minutes = None
    return results


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(
    visit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    return visit


@router.post("/{visit_id}/check-in", response_model=VisitOut) 
def check_in(
    visit_id: int,
    data: VisitCheckIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(
        Visit.id == visit_id, Visit.agent_id == current_user.id
    ).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    if visit.check_in_time:
        raise HTTPException(status_code=400, detail="Already checked in")

    visit.check_in_time = datetime.now(timezone.utc)
    visit.check_in_lat = data.latitude
    visit.check_in_lng = data.longitude
    visit.status = VisitStatus.IN_PROGRESS
    db.commit()
    db.refresh(visit)
    return visit


@router.post("/{visit_id}/check-out", response_model=VisitOut)
def check_out(
    visit_id: int,
    data: VisitCheckOut,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(
        Visit.id == visit_id, Visit.agent_id == current_user.id
    ).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    if not visit.check_in_time:
        raise HTTPException(status_code=400, detail="Not checked in yet")

    now = datetime.now(timezone.utc)
    visit.check_out_time = now
    visit.check_out_lat = data.latitude
    visit.check_out_lng = data.longitude
    visit.notes = data.notes or visit.notes
    visit.outcome = data.outcome
    visit.next_follow_up = data.next_follow_up
    visit.status = VisitStatus.COMPLETED
    delta = now - visit.check_in_time
    visit.duration_minutes = int(delta.total_seconds() / 60)
    db.commit()
    db.refresh(visit)
    return visit


@router.get("/summary/today")
def visits_today_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    today = date.today()
    query = db.query(Visit).filter(Visit.visit_date == today)
    from app.models.models import UserRole
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Visit.agent_id == current_user.id)

    total = query.count()
    completed = query.filter(Visit.status == VisitStatus.COMPLETED).count()
    in_progress = query.filter(Visit.status == VisitStatus.IN_PROGRESS).count()
    planned = query.filter(Visit.status == VisitStatus.PLANNED).count()

    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "planned": planned,
        "date": today.isoformat(),
    }



@router.post('/onboard', response_model=VisitOut, status_code=201)
def onboard_visit(
    visit_data: VisitCreate,
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
    db: Session = Depends(get_db)
):
    # Allow admin/manager to create visits with explicit agent_id
    v = Visit(
        agent_id=visit_data.agent_id,
        customer_id=visit_data.customer_id,
        visit_date=visit_data.visit_date,
        purpose=visit_data.purpose,
        notes=visit_data.notes,
        status=visit_data.status if hasattr(visit_data, 'status') else VisitStatus.PLANNED,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.put("/{visit_id}", response_model=VisitOut)
def update_visit(
    visit_id: int,
    visit_data: VisitCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")

    # allow owner or admin/manager to update
    if visit.agent_id != current_user.id and current_user.role not in [UserRole.MANAGER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to update this visit")

    # update allowed fields
    visit.customer_id = visit_data.customer_id
    if hasattr(visit_data, 'agent_id') and visit_data.agent_id:
        visit.agent_id = visit_data.agent_id
    visit.visit_date = visit_data.visit_date
    visit.purpose = visit_data.purpose
    visit.notes = visit_data.notes
    if hasattr(visit_data, 'status') and visit_data.status:
        try:
            visit.status = VisitStatus(visit_data.status)
        except Exception:
            pass
    if hasattr(visit_data, 'duration_minutes'):
        visit.duration_minutes = getattr(visit_data, 'duration_minutes')

    db.commit()
    db.refresh(visit)
    return visit


@router.post('/import')
def import_visits(file: UploadFile = File(...), current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)), db: Session = Depends(get_db)):
    raw = file.file.read()
    try:
        content = raw.decode('utf-8')
    except Exception:
        content = raw.decode('latin-1')
    sample = content[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample)
        delim = dialect.delimiter
    except Exception:
        delim = ','
    if content.startswith('\ufeff'):
        content = content.lstrip('\ufeff')
    reader = csv.DictReader(StringIO(content), delimiter=delim)
    results = []
    created = 0
    rows = list(reader)
    if not rows:
        return {'imported': 0, 'results': [{'row': 0, 'status': 'error', 'reason': 'no rows parsed - check CSV headers/delimiter'}]}
    for idx, row in enumerate(rows, start=1):
        agent_id = row.get('agent_id')
        customer_id = row.get('customer_id')
        visit_date = row.get('visit_date')
        # Parse date string to Python date object
        from datetime import date as _date
        try:
            if visit_date:
                visit_date = _date.fromisoformat(visit_date)
        except Exception:
            results.append({'row': idx, 'status': 'error', 'reason': f'invalid visit_date format: {visit_date}'})
            continue
        if not (agent_id and customer_id and visit_date):
            results.append({'row': idx, 'status': 'skipped', 'reason': 'missing agent_id/customer_id/visit_date'})
            continue
        # dedupe by agent+customer+date
        existing = db.query(Visit).filter(Visit.agent_id == int(agent_id), Visit.customer_id == int(customer_id), Visit.visit_date == visit_date).first()
        if existing:
            results.append({'row': idx, 'status': 'skipped', 'reason': 'duplicate visit'})
            continue
        try:
            v = Visit(agent_id=int(agent_id), customer_id=int(customer_id), visit_date=visit_date, purpose=row.get('purpose'), notes=row.get('notes'))
            db.add(v)
            db.commit()
            db.refresh(v)
            created += 1
            results.append({'row': idx, 'status': 'created', 'id': v.id})
        except Exception as e:
            db.rollback()
            results.append({'row': idx, 'status': 'error', 'reason': str(e)})
    return {'imported': created, 'results': results, 'parsed_rows': len(rows), 'fieldnames': reader.fieldnames or []}
