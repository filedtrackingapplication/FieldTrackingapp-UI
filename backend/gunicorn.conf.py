"""
Gunicorn production configuration for TrackForce.

Usage:
    gunicorn app.main:app -c gunicorn.conf.py

For 200-300 agents:
  - workers = (2 × CPU cores) + 1  →  typically 9 on a 4-core server
  - Each worker handles its own WebSocket connections
  - Redis pub/sub ensures all workers share live location updates
"""
import multiprocessing
import os

# ─── Workers ──────────────────────────────────────────────────────────────────
# Uvicorn worker class required for ASGI (FastAPI / WebSocket support)
worker_class = "uvicorn.workers.UvicornWorker"

# Recommended: (2 × cores) + 1
is_sqlite = "sqlite" in os.environ.get("DATABASE_URL", "sqlite:///./field_tracking.db").lower()
if is_sqlite:
    # SQLite is a file-based DB and does not support multiple writer processes well.
    workers = 1
else:
    workers = int(os.environ.get("WEB_CONCURRENCY", (multiprocessing.cpu_count() * 2) + 1))

# WebSocket connections are long-lived; each worker can sustain many with asyncio
worker_connections = 1000

# ─── Timeouts ─────────────────────────────────────────────────────────────────
timeout = 120            # worker restart if silent for >120s (long uploads)
keepalive = 5            # seconds to keep idle connections open
graceful_timeout = 30    # seconds to finish existing requests on SIGTERM

# ─── Binding ──────────────────────────────────────────────────────────────────
bind = os.environ.get("BIND", "0.0.0.0:8000")

# ─── Logging ──────────────────────────────────────────────────────────────────
loglevel = os.environ.get("LOG_LEVEL", "info")
accesslog = "-"   # stdout
errorlog  = "-"   # stderr
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ─── Process name ─────────────────────────────────────────────────────────────
proc_name = "trackforce-backend"

# ─── Preload (share model/DB setup across workers) ────────────────────────────
preload_app = False  # keep False when using per-worker async lifespan
