from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone

from app.database import get_db
from app.models.models import Visit, User, Customer, VisitStatus
from app.schemas.schemas import VisitCreate, VisitCheckIn, VisitCheckOut, VisitOut
from app.services.auth_service import get_current_user

router = APIRouter()


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

    return query.order_by(Visit.visit_date.desc()).offset(skip).limit(limit).all()


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
