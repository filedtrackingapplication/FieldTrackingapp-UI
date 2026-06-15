import asyncio
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import create_tables
from app.tasks import periodic_location_flush, flush_all_pending
from app.routers import auth, agents, tracking, visits, orders, inventory, expenses, customers, dashboard, odometer

logger = logging.getLogger(__name__)

# ─── Rate limiter (shared across routers) ─────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_DEFAULT])


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    create_tables()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(f"{settings.UPLOAD_DIR}/expenses", exist_ok=True)
    os.makedirs(f"{settings.UPLOAD_DIR}/profiles", exist_ok=True)

    # Init Redis for WebSocket pub/sub (graceful degradation if unavailable)
    if settings.REDIS_ENABLED and settings.REDIS_URL:
        from app.routers.tracking import manager as ws_manager
        await ws_manager.init_redis(settings.REDIS_URL)

    # Start location buffer flush background task
    flush_task = asyncio.create_task(periodic_location_flush())
    logger.info("TrackForce backend started (workers share Redis: %s)", settings.REDIS_ENABLED)

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    flush_task.cancel()
    await flush_all_pending()   # drain any remaining buffered locations

    if settings.REDIS_ENABLED:
        from app.routers.tracking import manager as ws_manager
        await ws_manager.close_redis()
    logger.info("TrackForce backend shutdown complete")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="TrackForce — Field Force & Delivery Management, scalable for 200–300 concurrent agents",
    lifespan=lifespan,
    # Disable docs in production for security
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file uploads
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/api/auth",      tags=["Authentication"])
app.include_router(agents.router,    prefix="/api/agents",    tags=["Agents"])
app.include_router(tracking.router,  prefix="/api/tracking",  tags=["Live Tracking"])
app.include_router(visits.router,    prefix="/api/visits",    tags=["Visits"])
app.include_router(orders.router,    prefix="/api/orders",    tags=["Orders"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(expenses.router,  prefix="/api/expenses",  tags=["Expenses"])
app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(odometer.router,  prefix="/api/odometer",  tags=["Odometer"])


# ─── Utility endpoints ────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    from app.routers.tracking import manager as ws_manager
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "websocket": ws_manager.stats,
    }


@app.get("/api/metrics/ws")
async def ws_metrics():
    """Live WebSocket connection stats."""
    from app.routers.tracking import manager as ws_manager
    return ws_manager.stats

