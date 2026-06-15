from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.models import Customer, User, UserRole
from app.schemas.schemas import CustomerCreate, CustomerUpdate, CustomerOut
from app.services.auth_service import get_current_user

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
