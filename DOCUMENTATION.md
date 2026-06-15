# Field Tracking Application — Complete Documentation

## Table of Contents
1. [Application Overview](#1-application-overview)
2. [Architecture](#2-architecture)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Getting Started](#4-getting-started)
5. [Application Flow — Step by Step](#5-application-flow--step-by-step)
6. [Use Cases by Role](#6-use-cases-by-role)
7. [Feature Reference](#7-feature-reference)
8. [API Reference](#8-api-reference)

---

## 1. Application Overview

The Field Tracking Application is a full-stack operations management platform built for businesses that deploy field agents (sales reps, drivers, service engineers). It provides:

- **Real-time GPS tracking** of agents on a live map
- **Attendance management** — punch in/out with location
- **Customer visit management** — planned visits, check-in/out
- **Order management** — create, track, and fulfill sales orders
- **Expense management** — submit receipts, manager approval workflow
- **Inventory management** — warehouse stock and truck-level assignments
- **Odometer / vehicle tracking** — trip logs and fuel consumption
- **Dashboard & reports** — KPIs, charts, agent performance

**Tech Stack**
| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Leaflet maps |
| Backend | FastAPI (Python), SQLAlchemy ORM |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Real-time | WebSockets with Redis pub/sub (optional) |
| Auth | JWT Bearer tokens |

---

## 2. Architecture

```
Browser (React SPA)
    │
    ├── REST API calls ──────────────────► FastAPI Backend (:8000)
    │                                           │
    └── WebSocket (live tracking) ─────────────┤
                                               │
                                    ┌──────────┴──────────┐
                                 SQLite/PostgreSQL      Redis (optional)
                                 (all app data)         (WS pub/sub)
```

**Key URLs**
| URL | Purpose |
|---|---|
| `http://localhost:5173` | Frontend application |
| `http://localhost:8000/docs` | Interactive API documentation (Swagger UI) |
| `http://localhost:8000/api/health` | Health check endpoint |

---

## 3. User Roles & Permissions

The system has four roles with progressively restricted access:

### ADMIN
- Full access to everything
- Create, update, and deactivate any agent
- Approve or reject any expense
- Manage warehouse inventory and products
- View all agents' data, locations, orders, visits
- Access the live tracking dashboard

### MANAGER
- Manage agents in their own team
- Approve/reject expenses submitted by their team
- View all data for agents assigned to them
- Cannot manage warehouse inventory settings or products

### FIELD_AGENT
- Create and manage their own customers, visits, orders, expenses
- Submit expenses with receipt photos
- Punch in/out each workday
- Log odometer readings for their vehicle
- Only sees their own records — cannot view other agents

### DRIVER
- Same scope as FIELD_AGENT
- Primarily focused on punch in/out, odometer, and inventory assignments
- Can receive truck inventory assignments from managers

---

## 4. Getting Started

### Step 1 — Start the backend
```
cd backend
.\venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 2 — Start the frontend
```
cd frontend
npm run dev
```

### Step 3 — Create your first admin account

The database starts empty. Create the first admin user via the Swagger UI or using a direct API call:

**Option A — via Swagger UI**
1. Open `http://localhost:8000/docs`
2. Expand `POST /api/auth/register`
3. Click "Try it out" and submit:
```json
{
  "employee_id": "EMP001",
  "full_name": "Admin User",
  "email": "admin@example.com",
  "phone": "9999999999",
  "password": "Admin@123",
  "role": "admin"
}
```

**Option B — Default credentials (already seeded)**
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

### Step 4 — Log in
Open `http://localhost:5173` and sign in with the admin credentials.

---

## 5. Application Flow — Step by Step

### Day-in-the-life of a Field Agent

```
Morning
  └─► 1. Log in to the app
  └─► 2. Punch In (GPS location captured automatically)
         └─► Start odometer reading logged

During the day
  └─► 3. Drive to customer site
         └─► Live GPS transmitted via WebSocket to HQ dashboard
  └─► 4. Check In at customer (GPS + timestamp)
  └─► 5. Conduct visit — take order, notes, outcomes
  └─► 6. Create order for customer (products, quantities, payment mode)
  └─► 7. Check Out of visit (duration auto-calculated)
  └─► 8. Submit expense (e.g., fuel receipt photo uploaded)
  └─► Repeat steps 3–8 for next customer

Evening
  └─► 9. Close odometer (end KM reading, fuel added)
  └─► 10. Punch Out (total hours auto-calculated)
```

### Manager Workflow

```
1. View Dashboard — check KPIs, online agents, today's activity
2. Open Live Tracking — see all agents on map in real time
3. Review Expenses — approve or reject submitted receipts
4. Assign inventory to agent trucks
5. Review agent performance in Reports page
6. Create new agents/customers as needed
```

### Order Fulfillment Flow

```
PENDING → (confirm) → CONFIRMED → (dispatch) → DISPATCHED → (deliver) → DELIVERED
                                                              └──────────────────────→ RETURNED
                    └── at any stage ──────────────────────────────────────────────→ CANCELLED
```

### Expense Approval Flow

```
Agent submits expense (status: PENDING)
    └─► Manager/Admin reviews
            ├─► Approve → status: APPROVED
            └─► Reject  → status: REJECTED (rejection reason recorded)
```

### Offline Sync Flow

When an agent loses network connectivity:
```
Agent goes offline
    └─► GPS location updates buffered in browser IndexedDB
    └─► Punch in/out events buffered
    └─► Visit check-in/out buffered
    └─► Orders buffered

Agent comes back online
    └─► Sync runs automatically (or agent taps "Sync Now")
    └─► Data sent to backend in correct sequence:
        1. GPS locations (bulk)
        2. Punch records (sequential)
        3. Visit records (sequential)
        4. Orders (sequential)
```

---

## 6. Use Cases by Role

### Admin Use Cases

| # | Use Case | Where |
|---|---|---|
| 1 | View real-time KPIs (agents online, visits, revenue) | Dashboard |
| 2 | Watch all agents on live map | Live Tracking |
| 3 | Create new agent accounts | Agents page |
| 4 | Update agent's zone, vehicle, manager assignment | Agents page |
| 5 | Deactivate an agent | Agents page |
| 6 | Create and manage product catalogue | Inventory → Products tab |
| 7 | Update warehouse stock levels | Inventory → Warehouse tab |
| 8 | Assign inventory to agent trucks | Inventory → Assign to Truck |
| 9 | Approve or reject any expense | Expenses page |
| 10 | View all orders across all agents | Orders page |
| 11 | View performance reports and charts | Reports page |
| 12 | View visit history for any customer | Customers → history |

### Manager Use Cases

| # | Use Case | Where |
|---|---|---|
| 1 | View today's dashboard for their team | Dashboard |
| 2 | Track their team on the live map | Live Tracking |
| 3 | Create new agents under their supervision | Agents page |
| 4 | Approve or reject team expenses | Expenses → Approve/Reject |
| 5 | Assign truck inventory to their agents | Inventory → Assignments |
| 6 | View orders placed by their agents | Orders page |
| 7 | View visit completion rates | Visits page |
| 8 | Generate performance report | Reports page |

### Field Agent Use Cases

| # | Use Case | Where |
|---|---|---|
| 1 | Punch in at start of workday (GPS auto-captured) | Punch In/Out |
| 2 | Punch out at end of day | Punch In/Out |
| 3 | View attendance history for the month | Punch In/Out → history |
| 4 | Add a new customer | Customers → Add Customer |
| 5 | Plan a customer visit | Visits → New Visit |
| 6 | Check in at customer site (GPS verified) | Visits → Check In |
| 7 | Create a sales order during the visit | Orders → New Order |
| 8 | Check out with outcome notes and next follow-up date | Visits → Check Out |
| 9 | Submit a fuel/food/toll expense with photo | Expenses → Submit |
| 10 | Log start-of-trip odometer reading | Odometer → Start Trip |
| 11 | Close odometer at end of trip | Odometer → Close |
| 12 | Update sold/returned quantities from truck inventory | Inventory → Assignments |
| 13 | Works offline — all actions sync automatically on reconnect | Entire app |

### Driver Use Cases

| # | Use Case | Where |
|---|---|---|
| 1 | Punch in/out with GPS | Punch In/Out |
| 2 | Log odometer (start & end KM, fuel) | Odometer |
| 3 | View products assigned to their truck | Inventory → Assignments |
| 4 | Update delivered quantities | Inventory → Assignments |
| 5 | Submit vehicle-related expenses | Expenses |

---

## 7. Feature Reference

### Dashboard
Displays live KPIs refreshed on page load:
- **Total Agents** — how many users are registered
- **Online Agents** — agents with an active WebSocket session
- **Visits Today** — total visits for the current calendar day
- **Orders Today** — orders created today
- **Revenue Today** — sum of order totals today (₹)
- **Pending Expenses** — expenses awaiting manager approval
- **Total Customers** — all registered customers
- **7-Day Trend Charts** — area chart (orders) and bar chart (revenue)
- **Top Agents** — best performers this month by orders and revenue

---

### Live Tracking
- Connects to `ws://localhost:8000/api/tracking/ws/dashboard/{user_id}`
- Shows all online agents as truck markers on a Leaflet map
- Left panel lists agents with name, vehicle, speed, and current address
- Click an agent → map zooms to their position and shows their route history as a polyline
- Updates in real time as agents send location updates every few seconds

---

### Punch In/Out
- Punch In captures GPS coordinates and records `punch_in_time`
- Punch Out records `punch_out_time` and calculates `total_hours`
- One punch record per working day
- Monthly attendance history shown in a table

---

### Visits
Visit lifecycle: **Planned → In Progress → Completed** (or Missed)

1. Create a planned visit (agent + customer + date + purpose)
2. Agent arrives → **Check In** (GPS lat/lng + timestamp auto-set)
3. Agent leaves → **Check Out** (outcome, notes, next follow-up date recorded; duration in minutes auto-calculated)

---

### Orders
- An order belongs to an agent + customer, optionally linked to a visit
- Contains one or more **OrderItems** (product + quantity + unit price + discount)
- Backend auto-calculates subtotal, tax, and total
- **Payment modes**: cash, credit, UPI, cheque
- **Fulfillment statuses**: Pending → Confirmed → Dispatched → Delivered
- Analytics summary shows revenue breakdown and order count by status

---

### Expenses
- **Categories**: Fuel ⛽, Food 🍽️, Accommodation 🏨, Toll 🛣️, Parking, Maintenance, Misc
- Agent uploads a receipt photo (stored in `/uploads/expenses/`)
- GPS coordinates optionally attached
- Requires manager/admin approval before reimbursement
- Summary endpoint groups totals by category

---

### Inventory
**Three levels of tracking:**

| Level | Model | Description |
|---|---|---|
| Product catalogue | `Product` | SKU, name, price, unit |
| Warehouse stock | `Inventory` | Current stock, reorder level |
| Truck assignment | `InventoryAssignment` | Loaded → Sold → Returned |

Every stock movement creates an `InventoryTransaction` for audit.

---

### Odometer
- Log **start reading** when trip begins (with optional start photo)
- Log **end reading** when trip ends → `distance_travelled` auto-calculated
- Record fuel added (litres) and fuel cost (₹)
- Monthly summary available: total KM, trips, fuel consumed, fuel spend

---

### Reports
- Order analytics: total orders, revenue, average order value, orders by status (donut chart)
- Expense analytics: total spend by category (bar chart)
- Vehicle summary: monthly KM, trips, fuel consumed and cost

---

## 8. API Reference

Base URL: `http://localhost:8000/api`

### Authentication
All protected endpoints require: `Authorization: Bearer <token>`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login → returns JWT token |
| POST | `/auth/logout` | Logout (marks user offline) |
| GET | `/auth/me` | Get own profile |
| PUT | `/auth/me` | Update own profile |

### Agents
| Method | Endpoint | Description | Role |
|---|---|---|---|
| GET | `/agents` | List all agents | All |
| POST | `/agents` | Create agent | Admin, Manager |
| GET | `/agents/{id}` | Get agent | All |
| PUT | `/agents/{id}` | Update agent | Admin, Manager |
| DELETE | `/agents/{id}` | Deactivate agent | Admin |
| GET | `/agents/{id}/stats` | Agent today stats | All |

### Customers
| Method | Endpoint | Description |
|---|---|---|
| POST | `/customers` | Create customer |
| GET | `/customers` | List customers |
| GET | `/customers/{id}` | Get customer |
| PUT | `/customers/{id}` | Update customer |
| GET | `/customers/{id}/history` | Visit & order history |

### Visits
| Method | Endpoint | Description |
|---|---|---|
| POST | `/visits` | Plan a visit |
| GET | `/visits` | List visits |
| POST | `/visits/{id}/check-in` | Check in (GPS) |
| POST | `/visits/{id}/check-out` | Check out with outcome |
| GET | `/visits/summary/today` | Today's visit stats |

### Orders
| Method | Endpoint | Description |
|---|---|---|
| POST | `/orders` | Create order with items |
| GET | `/orders` | List orders |
| GET | `/orders/{id}` | Get order detail |
| PUT | `/orders/{id}` | Update status / payment |
| GET | `/orders/analytics/summary` | Revenue and count analytics |

### Expenses
| Method | Endpoint | Description | Role |
|---|---|---|---|
| POST | `/expenses` | Submit expense + receipt | All |
| GET | `/expenses` | List expenses | All |
| PUT | `/expenses/{id}/review` | Approve / Reject | Admin, Manager |
| GET | `/expenses/summary/by-category` | Category breakdown | All |

### Inventory
| Method | Endpoint | Description | Role |
|---|---|---|---|
| POST | `/inventory/products` | Create product | Admin, Manager |
| GET | `/inventory/products` | List products | All |
| GET | `/inventory/warehouse` | Warehouse stock | All |
| PUT | `/inventory/warehouse/{id}` | Update stock | Admin, Manager |
| POST | `/inventory/assignments` | Assign to truck | Admin, Manager |
| GET | `/inventory/assignments` | List assignments | All |
| PUT | `/inventory/assignments/{id}` | Update sold/returned | All |

### Odometer
| Method | Endpoint | Description |
|---|---|---|
| POST | `/odometer/start` | Start trip |
| PUT | `/odometer/{id}/close` | End trip |
| GET | `/odometer` | List logs |
| GET | `/odometer/summary` | Monthly summary |

### Tracking & Attendance
| Method | Endpoint | Description |
|---|---|---|
| WS | `/tracking/ws/{agent_id}?token=` | Agent live GPS stream |
| WS | `/tracking/ws/dashboard/{user_id}?token=` | Dashboard all-agents stream |
| POST | `/tracking/log` | Single location (REST fallback) |
| POST | `/tracking/sync` | Bulk offline GPS sync |
| GET | `/tracking/live` | All online agents + last location |
| GET | `/tracking/history/{agent_id}` | Location history |
| POST | `/tracking/punch-in` | Punch in with GPS |
| POST | `/tracking/punch-out` | Punch out |
| GET | `/tracking/attendance/{agent_id}` | Attendance records |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard/stats` | All KPIs |
| GET | `/dashboard/agent-summary/{id}` | Single agent snapshot |
