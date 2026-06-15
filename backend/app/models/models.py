from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, Date, JSON, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


# ─────────────────────────── Enums ───────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    FIELD_AGENT = "field_agent"
    DRIVER = "driver"


class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_LEAVE = "on_leave"


class OnlineStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DISPATCHED = "dispatched"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    RETURNED = "returned"


class ExpenseStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ExpenseCategory(str, enum.Enum):
    FUEL = "fuel"
    FOOD = "food"
    ACCOMMODATION = "accommodation"
    TOLL = "toll"
    PARKING = "parking"
    MAINTENANCE = "maintenance"
    MISC = "misc"


class VisitStatus(str, enum.Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    MISSED = "missed"


# ─────────────────────────── Models ───────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    phone = Column(String(20), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.FIELD_AGENT)
    status = Column(SAEnum(AgentStatus), default=AgentStatus.ACTIVE)
    online_status = Column(SAEnum(OnlineStatus), default=OnlineStatus.OFFLINE)
    profile_photo = Column(String(255), nullable=True)
    vehicle_number = Column(String(30), nullable=True)
    assigned_zone = Column(String(100), nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)

    # Relationships
    manager = relationship("User", remote_side=[id], backref="team_members")
    locations = relationship("LocationLog", back_populates="agent", cascade="all, delete-orphan")
    punch_records = relationship("PunchRecord", back_populates="agent", cascade="all, delete-orphan")
    visits = relationship("Visit", back_populates="agent", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="agent", cascade="all, delete-orphan")
    expenses = relationship("Expense", foreign_keys="[Expense.agent_id]", back_populates="agent", cascade="all, delete-orphan")
    odometer_logs = relationship("OdometerLog", back_populates="agent", cascade="all, delete-orphan")
    inventory_assignments = relationship("InventoryAssignment", back_populates="agent")


class LocationLog(Base):
    __tablename__ = "location_logs"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)       # km/h
    heading = Column(Float, nullable=True)     # degrees
    altitude = Column(Float, nullable=True)
    address = Column(String(500), nullable=True)
    is_offline_sync = Column(Boolean, default=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("User", back_populates="locations")

    # ── Performance indexes for the hot query patterns ────────────────────────
    __table_args__ = (
        # Most common query: latest locations for a specific agent
        Index("ix_location_agent_time", "agent_id", "recorded_at"),
        # Batch sync query: unsynced records by agent
        Index("ix_location_offline", "agent_id", "is_offline_sync"),
    )


class PunchRecord(Base):
    __tablename__ = "punch_records"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    punch_in_time = Column(DateTime(timezone=True), nullable=True)
    punch_in_lat = Column(Float, nullable=True)
    punch_in_lng = Column(Float, nullable=True)
    punch_in_address = Column(String(500), nullable=True)
    punch_out_time = Column(DateTime(timezone=True), nullable=True)
    punch_out_lat = Column(Float, nullable=True)
    punch_out_lng = Column(Float, nullable=True)
    punch_out_address = Column(String(500), nullable=True)
    work_date = Column(Date, nullable=False)
    total_hours = Column(Float, nullable=True)
    distance_covered = Column(Float, nullable=True)  # km
    notes = Column(Text, nullable=True)

    agent = relationship("User", back_populates="punch_records")

    __table_args__ = (
        Index("ix_punch_agent_date", "agent_id", "work_date"),
    )


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    contact_person = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=False)
    email = Column(String(100), nullable=True)
    address = Column(Text, nullable=False)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(10), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    customer_type = Column(String(50), default="retail")  # retail, wholesale, distributor
    credit_limit = Column(Float, default=0.0)
    outstanding_amount = Column(Float, default=0.0)
    assigned_agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    assigned_agent = relationship("User", foreign_keys=[assigned_agent_id])
    visits = relationship("Visit", back_populates="customer", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="customer", cascade="all, delete-orphan")


class Visit(Base):
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    visit_date = Column(Date, nullable=False)
    check_in_time = Column(DateTime(timezone=True), nullable=True)
    check_in_lat = Column(Float, nullable=True)
    check_in_lng = Column(Float, nullable=True)
    check_out_time = Column(DateTime(timezone=True), nullable=True)
    check_out_lat = Column(Float, nullable=True)
    check_out_lng = Column(Float, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(SAEnum(VisitStatus), default=VisitStatus.PLANNED)
    purpose = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    outcome = Column(String(200), nullable=True)
    next_follow_up = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("User", back_populates="visits")
    customer = relationship("Customer", back_populates="visits")

    __table_args__ = (
        Index("ix_visit_agent_date", "agent_id", "visit_date"),
        Index("ix_visit_customer", "customer_id"),
    )


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    unit = Column(String(20), default="pcs")  # pcs, kg, ltr, box
    price = Column(Float, nullable=False)
    weight = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory_items = relationship("Inventory", back_populates="product")
    order_items = relationship("OrderItem", back_populates="product")


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_stock = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    product = relationship("Product", back_populates="inventory_items")
    transactions = relationship("InventoryTransaction", back_populates="inventory")


class InventoryAssignment(Base):
    """Stock loaded onto a truck / assigned to an agent"""
    __tablename__ = "inventory_assignments"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity_loaded = Column(Integer, default=0)
    quantity_sold = Column(Integer, default=0)
    quantity_returned = Column(Integer, default=0)
    assignment_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("User", back_populates="inventory_assignments")
    product = relationship("Product")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    inventory_id = Column(Integer, ForeignKey("inventory.id"), nullable=False)
    transaction_type = Column(String(20), nullable=False)  # in, out, return, adjustment
    quantity = Column(Integer, nullable=False)
    reference_id = Column(Integer, nullable=True)      # order_id or assignment_id
    reference_type = Column(String(50), nullable=True)  # order, assignment
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory = relationship("Inventory", back_populates="transactions")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, index=True, nullable=False)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    visit_id = Column(Integer, ForeignKey("visits.id"), nullable=True)
    status = Column(SAEnum(OrderStatus), default=OrderStatus.PENDING)
    order_date = Column(DateTime(timezone=True), server_default=func.now())
    delivery_date = Column(Date, nullable=True)
    subtotal = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    payment_mode = Column(String(30), default="cash")  # cash, credit, upi, cheque
    payment_status = Column(String(20), default="pending")  # pending, paid, partial
    delivery_address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    agent = relationship("User", back_populates="orders")
    customer = relationship("Customer", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_order_agent_date", "agent_id", "order_date"),
        Index("ix_order_customer", "customer_id"),
        Index("ix_order_status", "status"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    discount = Column(Float, default=0.0)
    total_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(SAEnum(ExpenseCategory), nullable=False)
    amount = Column(Float, nullable=False)
    expense_date = Column(Date, nullable=False)
    description = Column(String(500), nullable=True)
    receipt_photo = Column(String(255), nullable=True)
    status = Column(SAEnum(ExpenseStatus), default=ExpenseStatus.PENDING)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("User", back_populates="expenses", foreign_keys=[agent_id])
    approver = relationship("User", foreign_keys=[approved_by])


class OdometerLog(Base):
    __tablename__ = "odometer_logs"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    log_date = Column(Date, nullable=False)
    start_reading = Column(Float, nullable=False)   # km
    end_reading = Column(Float, nullable=True)       # km
    distance_travelled = Column(Float, nullable=True)  # km
    start_photo = Column(String(255), nullable=True)
    end_photo = Column(String(255), nullable=True)
    fuel_added = Column(Float, nullable=True)         # litres
    fuel_cost = Column(Float, nullable=True)
    vehicle_number = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agent = relationship("User", back_populates="odometer_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50), default="info")  # info, warning, alert, success
    is_read = Column(Boolean, default=False)
    reference_type = Column(String(50), nullable=True)  # order, expense, visit
    reference_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
