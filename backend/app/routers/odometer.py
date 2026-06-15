from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.models import OdometerLog, User
from app.schemas.schemas import OdometerCreate, OdometerClose, OdometerOut
from app.services.auth_service import get_current_user

router = APIRouter()


@router.post("/start", response_model=OdometerOut, status_code=201)
def start_odometer(
    data: OdometerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(OdometerLog).filter(
        OdometerLog.agent_id == current_user.id,
        OdometerLog.log_date == data.log_date,
        OdometerLog.end_reading == None
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="An open odometer log already exists for today")

    log = OdometerLog(
        agent_id=current_user.id,
        log_date=data.log_date,
        start_reading=data.start_reading,
        vehicle_number=data.vehicle_number or current_user.vehicle_number,
        notes=data.notes,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.put("/{log_id}/close", response_model=OdometerOut)
def close_odometer(
    log_id: int,
    data: OdometerClose,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    log = db.query(OdometerLog).filter(
        OdometerLog.id == log_id,
        OdometerLog.agent_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Odometer log not found")
    if log.end_reading is not None:
        raise HTTPException(status_code=400, detail="Log already closed")
    if data.end_reading <= log.start_reading:
        raise HTTPException(status_code=400, detail="End reading must be greater than start reading")

    log.end_reading = data.end_reading
    log.distance_travelled = round(data.end_reading - log.start_reading, 2)
    log.fuel_added = data.fuel_added
    log.fuel_cost = data.fuel_cost
    log.notes = data.notes or log.notes
    db.commit()
    db.refresh(log)
    return log


@router.get("/", response_model=List[OdometerOut])
def list_odometer_logs(
    agent_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import UserRole
    query = db.query(OdometerLog)
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(OdometerLog.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(OdometerLog.agent_id == agent_id)
    if from_date:
        query = query.filter(OdometerLog.log_date >= from_date)
    if to_date:
        query = query.filter(OdometerLog.log_date <= to_date)
    return query.order_by(OdometerLog.log_date.desc()).offset(skip).limit(limit).all()


@router.get("/summary")
def odometer_summary(
    agent_id: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func, extract
    from app.models.models import UserRole

    query = db.query(
        func.sum(OdometerLog.distance_travelled).label("total_km"),
        func.sum(OdometerLog.fuel_added).label("total_fuel"),
        func.sum(OdometerLog.fuel_cost).label("total_fuel_cost"),
        func.count(OdometerLog.id).label("trips"),
    )
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(OdometerLog.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(OdometerLog.agent_id == agent_id)
    if month:
        query = query.filter(extract("month", OdometerLog.log_date) == month)
    if year:
        query = query.filter(extract("year", OdometerLog.log_date) == year)

    row = query.first()
    return {
        "total_km": row.total_km or 0,
        "total_fuel_litres": row.total_fuel or 0,
        "total_fuel_cost": row.total_fuel_cost or 0,
        "trips": row.trips or 0,
    }
