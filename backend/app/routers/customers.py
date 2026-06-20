from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.models import Customer, User, UserRole
from app.schemas.schemas import CustomerCreate, CustomerUpdate, CustomerOut
from app.services.auth_service import get_current_user, require_roles
from app.models.models import UserRole

router = APIRouter()


@router.post("/", response_model=CustomerOut, status_code=201)
def create_customer(
    data: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customer = Customer(**data.model_dump())
    if not customer.assigned_agent_id:
        customer.assigned_agent_id = current_user.id
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/", response_model=List[CustomerOut])
def list_customers(
    assigned_agent_id: Optional[int] = None,
    city: Optional[str] = None,
    customer_type: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Customer).filter(Customer.is_active == is_active)

    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Customer.assigned_agent_id == current_user.id)
    elif assigned_agent_id:
        query = query.filter(Customer.assigned_agent_id == assigned_agent_id)

    if city:
        query = query.filter(Customer.city.ilike(f"%{city}%"))
    if customer_type:
        query = query.filter(Customer.customer_type == customer_type)
    if search:
        query = query.filter(
            Customer.name.ilike(f"%{search}%") |
            Customer.phone.ilike(f"%{search}%")
        )
    return query.offset(skip).limit(limit).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c



@router.post("/onboard", response_model=CustomerOut, status_code=201)
def onboard_customer(
    data: CustomerCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    # Admin/Manager can onboard customers and assign agent explicitly
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.post("/import", status_code=201)
def import_customers(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    import csv
    from io import StringIO

    if not file.filename.lower().endswith(('.csv', '.txt')):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    raw = file.file.read()
    # Try utf-8, fallback to latin-1
    try:
        content = raw.decode('utf-8')
    except Exception:
        content = raw.decode('latin-1')

    # Detect delimiter
    try:
        dialect = csv.Sniffer().sniff(content.splitlines()[0])
        delim = dialect.delimiter
    except Exception:
        delim = ','

    reader = csv.DictReader(StringIO(content), delimiter=delim)
    results = []
    created = 0
    parsed = 0

    for idx, row in enumerate(reader, start=1):
        parsed += 1
        name = (row.get('name') or row.get('customer_name') or '').strip()
        phone = (row.get('phone') or row.get('mobile') or '').strip()
        if not name and not phone:
            results.append({'row': idx, 'status': 'skipped', 'reason': 'missing name and phone'})
            continue

        # skip duplicates by phone
        if phone:
            existing = db.query(Customer).filter(Customer.phone == phone).first()
            if existing:
                results.append({'row': idx, 'status': 'skipped', 'reason': 'duplicate phone'})
                continue

        data = {
            'name': name or None,
            'phone': phone or None,
            'address': (row.get('address') or '').strip() or None,
            'city': (row.get('city') or '').strip() or None,
            'customer_type': (row.get('customer_type') or row.get('type') or '').strip() or None,
        }
        if row.get('assigned_agent_id'):
            try:
                data['assigned_agent_id'] = int(row.get('assigned_agent_id'))
            except ValueError:
                data['assigned_agent_id'] = None

        cust = Customer(**{k: v for k, v in data.items() if v is not None})
        db.add(cust)
        try:
            db.commit()
            db.refresh(cust)
            created += 1
            results.append({'row': idx, 'status': 'created', 'id': cust.id})
        except Exception as e:
            db.rollback()
            results.append({'row': idx, 'status': 'error', 'reason': str(e)})

    return {'imported': created, 'results': results, 'parsed_rows': parsed, 'fieldnames': reader.fieldnames or []}


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    updates: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in updates.model_dump(exclude_none=True).items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@router.get("/{customer_id}/history")
def customer_history(
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import Visit, Order
    visits = db.query(Visit).filter(Visit.customer_id == customer_id).order_by(Visit.visit_date.desc()).limit(10).all()
    orders = db.query(Order).filter(Order.customer_id == customer_id).order_by(Order.order_date.desc()).limit(10).all()
    return {
        "visits": [{"id": v.id, "date": v.visit_date.isoformat(), "status": v.status.value, "outcome": v.outcome} for v in visits],
        "orders": [{"id": o.id, "number": o.order_number, "amount": o.total_amount, "status": o.status.value} for o in orders],
    }
