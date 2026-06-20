from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.models import User, UserRole, AgentStatus
from app.schemas.schemas import UserCreate, UserOut, UserUpdate, UserWithLocation
from app.services.auth_service import get_current_user, require_roles, hash_password
from fastapi import UploadFile, File
import csv
from io import StringIO

router = APIRouter()


@router.get("/", response_model=List[UserOut])
def list_agents(
    role: Optional[UserRole] = None,
    status: Optional[AgentStatus] = None,
    zone: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.is_active == True)
    if role:
        query = query.filter(User.role == role)
    if status:
        query = query.filter(User.status == status)
    if zone:
        query = query.filter(User.assigned_zone.ilike(f"%{zone}%"))
    if search:
        query = query.filter(
            (User.full_name.ilike(f"%{search}%")) |
            (User.employee_id.ilike(f"%{search}%")) |
            (User.phone.ilike(f"%{search}%"))
        )
    # Managers see only their team; admins see all
    if current_user.role == UserRole.MANAGER:
        query = query.filter(User.manager_id == current_user.id)
    return query.offset(skip).limit(limit).all()


@router.get("/{agent_id}", response_model=UserOut)
def get_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    agent = db.query(User).filter(User.id == agent_id, User.is_active == True).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/", response_model=UserOut, status_code=201)
def create_agent(
    user_data: UserCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.employee_id == user_data.employee_id).first():
        raise HTTPException(status_code=400, detail="Employee ID already exists")

    user = User(
        **user_data.model_dump(exclude={"password"}),
        hashed_password=hash_password(user_data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{agent_id}", response_model=UserOut)
def update_agent(
    agent_id: int,
    updates: UserUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    agent = db.query(User).filter(User.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for key, value in updates.model_dump(exclude_none=True).items():
        setattr(agent, key, value)
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def deactivate_agent(
    agent_id: int,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    agent = db.query(User).filter(User.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_active = False
    db.commit()
    return {"message": "Agent deactivated"}



@router.post('/onboard', response_model=UserOut, status_code=201)
def onboard_agent(
    user_data: UserCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    return create_agent(user_data, current_user, db)


@router.post('/import')
def import_agents(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    raw = file.file.read()
    try:
        content = raw.decode('utf-8')
    except Exception:
        content = raw.decode('latin-1')
    # Robust delimiter detection using a content sample
    sample = content[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample)
        delim = dialect.delimiter
    except Exception:
        delim = ','
    # Strip BOM if present
    if content.startswith('\ufeff'):
        content = content.lstrip('\ufeff')
    reader = csv.DictReader(StringIO(content), delimiter=delim)
    results = []
    created = 0
    # normalize fieldnames to accept common aliases
    if reader.fieldnames:
        normalized = []
        for fn in reader.fieldnames:
            key = fn.strip().lower()
            if key in ('name', 'full_name'):
                normalized.append('full_name')
            elif key in ('mobile', 'phone_number'):
                normalized.append('phone')
            elif key == 'email_address':
                normalized.append('email')
            else:
                normalized.append(fn)
        reader.fieldnames = normalized

    rows = list(reader)
    if not rows:
        return {'imported': 0, 'parsed_rows': 0, 'fieldnames': reader.fieldnames or [], 'results': [{'row': 0, 'status': 'error', 'reason': 'no rows parsed - check CSV headers/delimiter'}]}
    for idx, row in enumerate(rows, start=1):
        email = (row.get('email') or '').strip()
        phone = (row.get('phone') or '').strip()
        if not email and not phone:
            results.append({'row': idx, 'status': 'skipped', 'reason': 'missing email and phone'})
            continue
        if email and db.query(User).filter(User.email == email).first():
            results.append({'row': idx, 'status': 'skipped', 'reason': 'duplicate email'})
            continue
        if phone and db.query(User).filter(User.phone == phone).first():
            results.append({'row': idx, 'status': 'skipped', 'reason': 'duplicate phone'})
            continue
        try:
            pwd = row.get('password') or 'TempPass123'
            user = User(
                full_name=row.get('full_name') or row.get('name') or 'Agent',
                email=email or None,
                phone=phone or None,
                employee_id=row.get('employee_id') or None,
                role=row.get('role') or None,
                hashed_password=hash_password(pwd)
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            created += 1
            results.append({'row': idx, 'status': 'created', 'id': user.id})
        except Exception as e:
            db.rollback()
            results.append({'row': idx, 'status': 'error', 'reason': str(e)})
    resp = {'imported': created, 'results': results, 'parsed_rows': len(rows), 'fieldnames': reader.fieldnames or []}
    return resp


@router.get("/{agent_id}/stats")
def get_agent_stats(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import Visit, Order, Expense, PunchRecord
    from datetime import date, datetime, timezone
    from sqlalchemy import func

    today = date.today()
    month_start = today.replace(day=1)

    agent = db.query(User).filter(User.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    visits_today = db.query(func.count(Visit.id)).filter(
        Visit.agent_id == agent_id, Visit.visit_date == today
    ).scalar()
    orders_today = db.query(func.count(Order.id)).filter(
        Order.agent_id == agent_id,
        func.date(Order.order_date) == today
    ).scalar()
    punch = db.query(PunchRecord).filter(
        PunchRecord.agent_id == agent_id,
        PunchRecord.work_date == today
    ).first()

    return {
        "visits_today": visits_today,
        "orders_today": orders_today,
        "is_punched_in": punch is not None and punch.punch_out_time is None,
        "punch_in_time": punch.punch_in_time if punch else None,
        "online_status": agent.online_status,
        "last_seen": agent.last_seen,
    }
