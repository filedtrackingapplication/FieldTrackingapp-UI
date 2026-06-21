from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
from app.models.models import (
    UserRole, AgentStatus, OnlineStatus, OrderStatus,
    ExpenseStatus, ExpenseCategory, VisitStatus
)


# ─────────────────────── Auth ───────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
    user: "UserOut"


class TokenData(BaseModel):
    user_id: Optional[int] = None


# ─────────────────────── User ───────────────────────

class UserCreate(BaseModel):
    employee_id: str
    full_name: str
    email: EmailStr
    phone: str
    password: str
    role: UserRole = UserRole.FIELD_AGENT
    vehicle_number: Optional[str] = None
    assigned_zone: Optional[str] = None
    manager_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    vehicle_number: Optional[str] = None
    assigned_zone: Optional[str] = None
    manager_id: Optional[int] = None
    status: Optional[AgentStatus] = None


class UserOut(BaseModel):
    id: int
    employee_id: str
    full_name: str
    email: str
    phone: str
    role: UserRole
    status: AgentStatus
    online_status: OnlineStatus
    profile_photo: Optional[str] = None
    vehicle_number: Optional[str] = None
    assigned_zone: Optional[str] = None
    manager_id: Optional[int] = None
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserWithLocation(UserOut):
    last_location: Optional["LocationLogOut"] = None


# ─────────────────────── Location ───────────────────────

class LocationLogCreate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    altitude: Optional[float] = None
    address: Optional[str] = None
    is_offline_sync: bool = False
    recorded_at: datetime


class LocationLogOut(BaseModel):
    id: int
    agent_id: int
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    address: Optional[str] = None
    is_offline_sync: bool
    recorded_at: datetime
    synced_at: datetime

    class Config:
        from_attributes = True


class BulkLocationSync(BaseModel):
    locations: List[LocationLogCreate]


# ─────────────────────── Punch ───────────────────────

class PunchInRequest(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None
    notes: Optional[str] = None


class PunchOutRequest(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None
    notes: Optional[str] = None


class PunchRecordOut(BaseModel):
    id: int
    agent_id: int
    punch_in_time: Optional[datetime] = None
    punch_in_lat: Optional[float] = None
    punch_in_lng: Optional[float] = None
    punch_in_address: Optional[str] = None
    punch_out_time: Optional[datetime] = None
    punch_out_lat: Optional[float] = None
    punch_out_lng: Optional[float] = None
    punch_out_address: Optional[str] = None
    work_date: date
    total_hours: Optional[float] = None
    distance_covered: Optional[float] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ─────────────────────── Customer ───────────────────────

class CustomerCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    customer_type: str = "retail"
    credit_limit: float = 0.0
    assigned_agent_id: Optional[int] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    customer_type: Optional[str] = None
    credit_limit: Optional[float] = None
    assigned_agent_id: Optional[int] = None
    is_active: Optional[bool] = None


class CustomerOut(BaseModel):
    id: int
    name: str
    contact_person: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: str
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    customer_type: str
    credit_limit: float
    outstanding_amount: float
    assigned_agent_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────── Visit ───────────────────────

class VisitCreate(BaseModel):
    customer_id: int
    visit_date: date
    purpose: Optional[str] = None
    notes: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    duration_minutes: datetime


class VisitCheckIn(BaseModel):
    latitude: float
    longitude: float


class VisitCheckOut(BaseModel):
    latitude: float
    longitude: float
    notes: Optional[str] = None
    outcome: Optional[str] = None
    next_follow_up: Optional[date] = None


class VisitOut(BaseModel):
    id: int
    agent_id: int
    customer_id: int
    visit_date: date
    check_in_time: datetime
    check_in_lat: Optional[float] = None
    check_in_lng: Optional[float] = None
    check_out_time: datetime
    check_out_lat: Optional[float] = None
    check_out_lng: Optional[float] = None
    duration_minutes: int
    status: VisitStatus
    purpose: Optional[str] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    next_follow_up: Optional[date] = None
    created_at: datetime
    customer: Optional[CustomerOut] = None

    class Config:
        from_attributes = True


# ─────────────────────── Product ───────────────────────

class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = "pcs"
    price: float
    weight: Optional[float] = None


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str
    price: float
    weight: Optional[float] = None
    is_active: bool

    class Config:
        from_attributes = True


# ─────────────────────── Inventory ───────────────────────

class InventoryOut(BaseModel):
    id: int
    product_id: int
    warehouse_stock: int
    reorder_level: int
    product: Optional[ProductOut] = None

    class Config:
        from_attributes = True


class InventoryUpdate(BaseModel):
    warehouse_stock: Optional[int] = None
    reorder_level: Optional[int] = None


class InventoryAssignmentCreate(BaseModel):
    agent_id: int
    product_id: int
    quantity_loaded: int
    assignment_date: date
    notes: Optional[str] = None


class InventoryAssignmentUpdate(BaseModel):
    quantity_sold: Optional[int] = None
    quantity_returned: Optional[int] = None
    notes: Optional[str] = None


class InventoryAssignmentOut(BaseModel):
    id: int
    agent_id: int
    product_id: int
    quantity_loaded: int
    quantity_sold: int
    quantity_returned: int
    assignment_date: date
    notes: Optional[str] = None
    created_at: datetime
    product: Optional[ProductOut] = None

    class Config:
        from_attributes = True


# ─────────────────────── Order ───────────────────────

class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_price: float
    discount: float = 0.0


class OrderCreate(BaseModel):
    customer_id: int
    visit_id: Optional[int] = None
    delivery_date: Optional[date] = None
    discount: float = 0.0
    tax: float = 0.0
    payment_mode: str = "cash"
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemCreate]


class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    delivery_date: Optional[date] = None
    payment_mode: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: float
    discount: float
    total_price: float
    product: Optional[ProductOut] = None

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: int
    order_number: str
    agent_id: int
    customer_id: int
    visit_id: Optional[int] = None
    status: OrderStatus
    order_date: datetime
    delivery_date: Optional[date] = None
    subtotal: float
    discount: float
    tax: float
    total_amount: float
    payment_mode: str
    payment_status: str
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    items: List[OrderItemOut] = []
    customer: Optional[CustomerOut] = None

    class Config:
        from_attributes = True


# ─────────────────────── Expense ───────────────────────

class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: float
    expense_date: date
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ExpenseReview(BaseModel):
    status: ExpenseStatus
    rejection_reason: Optional[str] = None


class ExpenseOut(BaseModel):
    id: int
    agent_id: int
    category: ExpenseCategory
    amount: float
    expense_date: date
    description: Optional[str] = None
    receipt_photo: Optional[str] = None
    status: ExpenseStatus
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────── Odometer ───────────────────────

class OdometerCreate(BaseModel):
    log_date: date
    start_reading: float
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None


class OdometerClose(BaseModel):
    end_reading: float
    fuel_added: Optional[float] = None
    fuel_cost: Optional[float] = None
    notes: Optional[str] = None


class OdometerOut(BaseModel):
    id: int
    agent_id: int
    log_date: date
    start_reading: float
    end_reading: Optional[float] = None
    distance_travelled: Optional[float] = None
    start_photo: Optional[str] = None
    end_photo: Optional[str] = None
    fuel_added: Optional[float] = None
    fuel_cost: Optional[float] = None
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────── Dashboard ───────────────────────

class DashboardStats(BaseModel):
    total_agents: int
    active_agents: int
    online_agents: int
    total_visits_today: int
    total_orders_today: int
    pending_expenses: int
    total_customers: int
    revenue_today: float
    top_agents: List[dict] = []


class AgentStats(BaseModel):
    visits_today: int
    orders_today: int
    total_visits_month: int
    total_orders_month: int
    pending_expenses: float
    distance_today: float
    punch_in_time: Optional[datetime] = None
    is_punched_in: bool


# ─────────────────────── Notification ───────────────────────

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Fix forward references
UserWithLocation.model_rebuild()
Token.model_rebuild()
