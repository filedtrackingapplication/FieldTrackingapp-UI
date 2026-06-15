from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, timezone

from app.database import get_db
from app.models.models import User, Visit, Order, Expense, Customer, OnlineStatus, UserRole, ExpenseStatus
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("/stats")
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()

    total_agents = db.query(func.count(User.id)).filter(
        User.is_active == True,
        User.role.in_([UserRole.FIELD_AGENT, UserRole.DRIVER])
    ).scalar()

    online_agents = db.query(func.count(User.id)).filter(
        User.is_active == True,
        User.online_status == OnlineStatus.ONLINE
    ).scalar()

    visits_today = db.query(func.count(Visit.id)).filter(
        Visit.visit_date == today
    ).scalar()

    orders_today = db.query(func.count(Order.id)).filter(
        func.date(Order.order_date) == today
    ).scalar()

    revenue_today = db.query(func.sum(Order.total_amount)).filter(
        func.date(Order.order_date) == today
    ).scalar() or 0.0

    pending_expenses = db.query(func.count(Expense.id)).filter(
        Expense.status == ExpenseStatus.PENDING
    ).scalar()

    total_customers = db.query(func.count(Customer.id)).filter(
        Customer.is_active == True
    ).scalar()

    # Top performing agents by orders this month
    month_start = today.replace(day=1)
    top_agents_raw = (
        db.query(User.id, User.full_name, func.count(Order.id).label("orders"), func.sum(Order.total_amount).label("revenue"))
        .join(Order, Order.agent_id == User.id)
        .filter(func.date(Order.order_date) >= month_start)
        .group_by(User.id)
        .order_by(func.count(Order.id).desc())
        .limit(5)
        .all()
    )
    top_agents = [
        {"id": r[0], "name": r[1], "orders": r[2], "revenue": round(r[3] or 0, 2)}
        for r in top_agents_raw
    ]

    # Orders trend last 7 days
    from sqlalchemy import text
    daily_trend = []
    for i in range(6, -1, -1):
        from datetime import timedelta
        day = today - timedelta(days=i)
        count = db.query(func.count(Order.id)).filter(func.date(Order.order_date) == day).scalar()
        rev = db.query(func.sum(Order.total_amount)).filter(func.date(Order.order_date) == day).scalar() or 0
        daily_trend.append({"date": day.isoformat(), "orders": count, "revenue": round(rev, 2)})

    return {
        "total_agents": total_agents,
        "online_agents": online_agents,
        "visits_today": visits_today,
        "orders_today": orders_today,
        "revenue_today": round(revenue_today, 2),
        "pending_expenses": pending_expenses,
        "total_customers": total_customers,
        "top_agents": top_agents,
        "daily_trend": daily_trend,
    }


@router.get("/agent-summary/{agent_id}")
def agent_summary(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    today = date.today()
    month_start = today.replace(day=1)

    visits_today = db.query(func.count(Visit.id)).filter(
        Visit.agent_id == agent_id, Visit.visit_date == today
    ).scalar()

    orders_today = db.query(func.count(Order.id)).filter(
        Order.agent_id == agent_id, func.date(Order.order_date) == today
    ).scalar()

    revenue_month = db.query(func.sum(Order.total_amount)).filter(
        Order.agent_id == agent_id, func.date(Order.order_date) >= month_start
    ).scalar() or 0

    from app.models.models import PunchRecord
    punch = db.query(PunchRecord).filter(
        PunchRecord.agent_id == agent_id,
        PunchRecord.work_date == today,
        PunchRecord.punch_out_time == None
    ).first()

    return {
        "visits_today": visits_today,
        "orders_today": orders_today,
        "revenue_month": round(revenue_month, 2),
        "is_punched_in": punch is not None,
        "punch_in_time": punch.punch_in_time.isoformat() if punch else None,
    }
