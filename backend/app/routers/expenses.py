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
from fastapi import UploadFile as FU, File as FF
import csv
from io import StringIO

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



@router.post('/onboard', response_model=ExpenseOut, status_code=201)
def onboard_expense(expense: ExpenseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Allow manager/admin to create on behalf
    return create_expense(category=expense.category, amount=expense.amount, expense_date=expense.expense_date, description=expense.description, latitude=expense.latitude, longitude=expense.longitude, receipt=None, current_user=current_user, db=db)


@router.post('/import')
def import_expenses(file: FU = FF(...), current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)), db: Session = Depends(get_db)):
    try:
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
            amount = row.get('amount')
            expense_date = row.get('expense_date')
            # parse expense_date to Python date
            from datetime import date as _date
            try:
                if expense_date:
                    expense_date = _date.fromisoformat(expense_date)
            except Exception:
                results.append({'row': idx, 'status': 'error', 'reason': f'invalid expense_date format: {expense_date}'})
                continue
            if not (agent_id and amount and expense_date):
                results.append({'row': idx, 'status': 'skipped', 'reason': 'missing agent_id/amount/expense_date'})
                continue
            # 'reference' field not present on Expense model in DB; skip dedupe
            ref = row.get('reference')
            try:
                exp = Expense(agent_id=int(agent_id), category=row.get('category') or 'misc', amount=float(amount), expense_date=expense_date, description=row.get('description'))
                db.add(exp)
                db.commit()
                db.refresh(exp)
                created += 1
                results.append({'row': idx, 'status': 'created', 'id': exp.id})
            except Exception as e:
                db.rollback()
                results.append({'row': idx, 'status': 'error', 'reason': str(e)})
        return {'imported': created, 'results': results, 'parsed_rows': len(rows), 'fieldnames': reader.fieldnames or []}
    except Exception as e:
        return {'imported': 0, 'results': [{'row': 0, 'status': 'error', 'reason': str(e)}], 'parsed_rows': 0, 'fieldnames': []}
