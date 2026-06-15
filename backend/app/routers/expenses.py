from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone
import os, uuid, shutil

from app.database import get_db
from app.models.models import Expense, User, UserRole, ExpenseStatus
from app.schemas.schemas import ExpenseCreate, ExpenseReview, ExpenseOut
from app.services.auth_service import get_current_user, require_roles
from app.config import settings

router = APIRouter()


@router.post("/", response_model=ExpenseOut, status_code=201)
async def create_expense(
    category: str = Form(...),
    amount: float = Form(...),
    expense_date: date = Form(...),
    description: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    receipt: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.models import ExpenseCategory

    receipt_path = None
    if receipt:
        ext = os.path.splitext(receipt.filename)[1]
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(settings.UPLOAD_DIR, "expenses", filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(receipt.file, f)
        receipt_path = f"/uploads/expenses/{filename}"

    expense = Expense(
        agent_id=current_user.id,
        category=category,
        amount=amount,
        expense_date=expense_date,
        description=description,
        receipt_photo=receipt_path,
        latitude=latitude,
        longitude=longitude,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/", response_model=List[ExpenseOut])
def list_expenses(
    agent_id: Optional[int] = None,
    status: Optional[ExpenseStatus] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Expense)
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Expense.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(Expense.agent_id == agent_id)

    if status:
        query = query.filter(Expense.status == status)
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)

    return query.order_by(Expense.expense_date.desc()).offset(skip).limit(limit).all()


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.put("/{expense_id}/review", response_model=ExpenseOut)
def review_expense(
    expense_id: int,
    review: ExpenseReview,
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.status != ExpenseStatus.PENDING:
        raise HTTPException(status_code=400, detail="Expense already reviewed")

    expense.status = review.status
    expense.approved_by = current_user.id
    expense.approved_at = datetime.now(timezone.utc)
    expense.rejection_reason = review.rejection_reason
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/summary/by-category")
def expense_summary(
    agent_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    query = db.query(Expense.category, func.sum(Expense.amount).label("total"))
    if current_user.role in [UserRole.FIELD_AGENT, UserRole.DRIVER]:
        query = query.filter(Expense.agent_id == current_user.id)
    elif agent_id:
        query = query.filter(Expense.agent_id == agent_id)
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)

    results = query.group_by(Expense.category).all()
    return [{"category": r[0].value, "total": r[1]} for r in results]
