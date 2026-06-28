import time
import threading

from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session as SQLAlchemySession, sessionmaker
from sqlalchemy.pool import NullPool
from app.config import settings

_is_sqlite = "sqlite" in settings.DATABASE_URL
# Process-wide write serializer for SQLite — prevents concurrent commits from
# multiple threads (threadpool HTTP handlers vs asyncio flush task) hitting the
# same SQLite file at the same time.
_sqlite_write_lock = threading.Lock() if _is_sqlite else None


class RetrySession(SQLAlchemySession):
    """SQLAlchemy session that serializes and retries SQLite locked commits."""

    def commit(self, max_retries: int = 5, base_delay: float = 0.05) -> None:
        for attempt in range(max_retries):
            try:
                if _sqlite_write_lock is not None:
                    with _sqlite_write_lock:
                        return super().commit()
                return super().commit()
            except OperationalError as exc:
                pending = list(self.new)
                dirty = list(self.dirty)
                self.rollback()
                for obj in pending:
                    self.add(obj)
                for obj in dirty:
                    self.merge(obj)
                message = str(exc).lower()
                if "database is locked" in message and attempt < max_retries - 1:
                    time.sleep(base_delay * (2 ** attempt))
                    continue
                raise

# ─── Engine with connection pooling ───────────────────────────────────────────
engine_kwargs: dict = {}
if _is_sqlite:
    # SQLite: single-writer, file-based DB; avoid pool contention and enable busy timeout.
    engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    engine_kwargs["poolclass"] = NullPool
else:
    # PostgreSQL: full connection pooling
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT
    engine_kwargs["pool_recycle"] = settings.DB_POOL_RECYCLE
    engine_kwargs["pool_pre_ping"] = True  # validates connections before use

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# Enable WAL mode for SQLite (much better concurrent read/write performance)
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _conn_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")  # 64 MB cache
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA busy_timeout = 30000")
        cursor.close()

SessionLocal = sessionmaker(class_=RetrySession, autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def commit_with_retry(db, max_retries: int = 3, base_delay: float = 0.1) -> None:
    """Retry commits on SQLite locked errors before raising."""
    for attempt in range(max_retries):
        try:
            db.commit()
            return
        except OperationalError as exc:
            pending = list(db.new)
            db.rollback()
            # Keep pending INSERT objects in session across retry attempts.
            for obj in pending:
                db.add(obj)
            message = str(exc).lower()
            if "database is locked" in message and attempt < max_retries - 1:
                time.sleep(base_delay * (attempt + 1))
                continue
            raise


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

