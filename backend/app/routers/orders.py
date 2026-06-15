from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone
import random
import string

from app.database import get_db
from app.models.models import Order, OrderItem, Customer, Product, User, UserRole, OrderStatus
from app.schemas.schemas import OrderCreate, OrderUpdate, OrderOut
from app.services.auth_service import get_current_user

router = APIRouter()


def generate_order_number() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return f"ORD-{suffix}"


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(Customer.id == order_data.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    subtotal = 0.0
    items_to_create = []
    for item_data in order_data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id, Product.is_active == True).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item_data.product_id} not found")
        item_total = (item_data.unit_price * item_data.quantity) - item_data.discount
        subtotal += item_total
        items_to_create.append(OrderItem(
            product_id=item_data.product_id,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            discount=item_data.discount,
            total_price=item_total,
        ))

    total_amount = subtotal - order_data.discount + order_data.tax

    order = Order(
        order_number=generate_order_number(),
        agent_id=current_user.id,
        customer_id=order_data.customer_id,
        visit_id=order_data.visit_id,
        delivery_date=order_data.delivery_date,
        subtotal=subtotal,
        discount=order_data.discount,
        tax=order_data.tax,
        total_amount=total_amount,
        payment_mode=order_data.payment_mode,
        delivery_address=order_data.delivery_address or customer.address,
        notes=order_data.notes,
    )
    db.add(order)
    db.flush()

    for item in items_to_create:
        item.order_id = order.id
        db.add(item)

    db.commit()
    db.refresh(order)
    return order


@router.get("/", response_model=List[OrderOut])
def list_orders(
    agent_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    status: Optional[OrderStatus] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    query = db.query(Order)

    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Order.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(Order.agent_id == agent_id)

    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    if status:
        query = query.filter(Order.status == status)
    if from_date:
        query = query.filter(func.date(Order.order_date) >= from_date)
    if to_date:
        query = query.filter(func.date(Order.order_date) <= to_date)

    return query.order_by(Order.order_date.desc()).offset(skip).limit(limit).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.put("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    updates: OrderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    for key, value in updates.model_dump(exclude_none=True).items():
        setattr(order, key, value)
    db.commit()
    db.refresh(order)
    return order


@router.get("/analytics/summary")
def order_analytics(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    agent_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    query = db.query(Order)
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Order.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(Order.agent_id == agent_id)
    if from_date:
        query = query.filter(func.date(Order.order_date) >= from_date)
    if to_date:
        query = query.filter(func.date(Order.order_date) <= to_date)

    orders = query.all()
    total_revenue = sum(o.total_amount for o in orders)
    by_status = {}
    for o in orders:
        by_status[o.status.value] = by_status.get(o.status.value, 0) + 1

    return {
        "total_orders": len(orders),
        "total_revenue": total_revenue,
        "by_status": by_status,
        "avg_order_value": total_revenue / len(orders) if orders else 0,
    }
