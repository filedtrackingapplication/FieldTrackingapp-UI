from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.models import (
    Inventory, InventoryAssignment, InventoryTransaction,
    Product, User, UserRole
)
from app.schemas.schemas import (
    ProductCreate, ProductOut,
    InventoryOut, InventoryUpdate,
    InventoryAssignmentCreate, InventoryAssignmentUpdate, InventoryAssignmentOut,
)
from app.services.auth_service import get_current_user, require_roles

router = APIRouter()


# ─── Products ───────────────────────────────────────────────

@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    data: ProductCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    if db.query(Product).filter(Product.sku == data.sku).first():
        raise HTTPException(status_code=400, detail="SKU already exists")
    product = Product(**data.model_dump())
    db.add(product)
    db.flush()
    # Create inventory record
    inv = Inventory(product_id=product.id, warehouse_stock=0)
    db.add(inv)
    db.commit()
    db.refresh(product)
    return product


@router.get("/products", response_model=List[ProductOut])
def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Product).filter(Product.is_active == True)
    if category:
        query = query.filter(Product.category == category)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    return query.offset(skip).limit(limit).all()


# ─── Warehouse Inventory ─────────────────────────────────────

@router.get("/warehouse", response_model=List[InventoryOut])
def get_warehouse_inventory(
    low_stock: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Inventory)
    if low_stock:
        query = query.filter(Inventory.warehouse_stock <= Inventory.reorder_level)
    return query.all()


@router.put("/warehouse/{inventory_id}", response_model=InventoryOut)
def update_warehouse_stock(
    inventory_id: int,
    updates: InventoryUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    inv = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    for k, v in updates.model_dump(exclude_none=True).items():
        setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return inv


# ─── Truck/Agent Assignments ─────────────────────────────────

@router.post("/assignments", response_model=InventoryAssignmentOut, status_code=201)
def assign_inventory(
    data: InventoryAssignmentCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    inv = db.query(Inventory).filter(Inventory.product_id == data.product_id).first()
    if not inv or inv.warehouse_stock < data.quantity_loaded:
        raise HTTPException(status_code=400, detail="Insufficient warehouse stock")

    assignment = InventoryAssignment(**data.model_dump())
    inv.warehouse_stock -= data.quantity_loaded
    db.add(assignment)

    txn = InventoryTransaction(
        inventory_id=inv.id,
        transaction_type="out",
        quantity=data.quantity_loaded,
        reference_type="assignment",
        notes=f"Assigned to agent {data.agent_id}",
        created_by=current_user.id,
    )
    db.add(txn)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/assignments", response_model=List[InventoryAssignmentOut])
def list_assignments(
    agent_id: Optional[int] = None,
    assignment_date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(InventoryAssignment)
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(InventoryAssignment.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(InventoryAssignment.agent_id == agent_id)
    if assignment_date:
        query = query.filter(InventoryAssignment.assignment_date == assignment_date)
    return query.order_by(InventoryAssignment.created_at.desc()).all()


@router.put("/assignments/{assignment_id}", response_model=InventoryAssignmentOut)
def update_assignment(
    assignment_id: int,
    updates: InventoryAssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    a = db.query(InventoryAssignment).filter(InventoryAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    for k, v in updates.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a
