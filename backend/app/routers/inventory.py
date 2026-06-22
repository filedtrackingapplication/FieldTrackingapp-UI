from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.models import (
    Inventory, InventoryAssignment, InventoryTransaction,
    Product, User, UserRole
)
from app.schemas.schemas import (
    ProductCreate, ProductUpdate, ProductOut,
    InventoryOut, InventoryUpdate,
    InventoryAssignmentCreate, InventoryAssignmentUpdate, InventoryAssignmentOut,
)
from app.services.auth_service import get_current_user, get_optional_current_user, require_roles
from fastapi import UploadFile, File
import csv
from io import StringIO

router = APIRouter()


# ─── Products ───────────────────────────────────────────────

@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    data: ProductCreate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    # Debug log: capture incoming Authorization header and current_user info
    try:
        auth_header = (Request.scope.get('headers') if False else None)
    except Exception:
        auth_header = None
    # Best-effort: read Authorization from the Starlette Request if available via dependency injection
    # (we don't have the Request object here normally) — fallback: log current_user
    # Temporary debug print
    try:
        print(f"[DEBUG][create_product] current_user.id={getattr(current_user, 'id', None)} role={getattr(current_user, 'role', None)}")
    except Exception:
        print("[DEBUG][create_product] current_user not available")

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
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(Product)
        if not include_inactive:
            query = query.filter(Product.is_active == True)
        if category:
            query = query.filter(Product.category == category)
        if search:
            query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
        return query.order_by(Product.updated_at.desc()).offset(skip).limit(limit).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    db.commit()
    return None


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


@router.post('/products/onboard', response_model=ProductOut, status_code=201)
def onboard_product(data: ProductCreate, current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)), db: Session = Depends(get_db)):
    return create_product(data, current_user, db)


@router.post('/products/import')
def import_products(file: UploadFile = File(...), current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)), db: Session = Depends(get_db)):
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
        sku = (row.get('sku') or '').strip()
        name = (row.get('name') or '').strip()
        if not sku and not name:
            results.append({'row': idx, 'status': 'skipped', 'reason': 'missing sku and name'})
            continue
        if sku and db.query(Product).filter(Product.sku == sku).first():
            results.append({'row': idx, 'status': 'skipped', 'reason': 'duplicate sku'})
            continue
        try:
            price_val = row.get('price')
            try:
                price = float(price_val) if price_val not in (None, '') else 0.0
            except Exception:
                price = 0.0
            p = Product(sku=sku or None, name=name or None, category=row.get('category') or None, price=price)
            db.add(p)
            db.flush()
            inv = Inventory(product_id=p.id, warehouse_stock=int(row.get('warehouse_stock') or 0))
            db.add(inv)
            db.commit()
            db.refresh(p)
            created += 1
            results.append({'row': idx, 'status': 'created', 'id': p.id})
        except Exception as e:
            db.rollback()
            results.append({'row': idx, 'status': 'error', 'reason': str(e)})
    return {'imported': created, 'results': results, 'parsed_rows': len(rows), 'fieldnames': reader.fieldnames or []}
