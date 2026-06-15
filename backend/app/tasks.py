"""
Background tasks for high-throughput, non-blocking operations.

Location updates from 200-300 agents arrive at ~60/s.  Rather than
hitting the DB on every WebSocket message, we buffer them in memory
and flush in bulk every LOCATION_FLUSH_INTERVAL seconds.
This reduces DB round-trips by ~10-20x while keeping latency <3s.
"""
import asyncio
import logging
from typing import List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ─── Per-worker in-memory location buffer ─────────────────────────────────────
_location_buffer: List[dict] = []
_buffer_lock = asyncio.Lock()


async def enqueue_location(data: dict) -> None:
    """Non-blocking — add a location record to the in-memory buffer."""
    from app.config import settings

    async with _buffer_lock:
        _location_buffer.append(data)
        # Safety valve: force-flush if buffer grows too large
        if len(_location_buffer) >= settings.LOCATION_BUFFER_MAX:
            await _flush_now()


async def _flush_now() -> int:
    """Flush the current buffer to the database. Must be called under _buffer_lock."""
    global _location_buffer
    if not _location_buffer:
        return 0

    batch = _location_buffer[:]
    _location_buffer = []

    try:
        from app.database import SessionLocal
        from app.models.models import LocationLog

        db = SessionLocal()
        try:
            db.bulk_insert_mappings(LocationLog, batch)
            db.commit()
            logger.debug("Flushed %d location records to DB", len(batch))
            return len(batch)
        except Exception as exc:
            db.rollback()
            logger.error("DB flush failed: %s — re-queuing %d records", exc, len(batch))
            # Re-queue so data is not lost
            _location_buffer = batch + _location_buffer
            return 0
        finally:
            db.close()
    except Exception as exc:
        logger.error("Session creation failed during flush: %s", exc)
        _location_buffer = batch + _location_buffer
        return 0


async def periodic_location_flush() -> None:
    """Long-running background task: flush buffer on a fixed interval."""
    from app.config import settings

    logger.info(
        "Location flush task started (interval=%.1fs, max_buffer=%d)",
        settings.LOCATION_FLUSH_INTERVAL,
        settings.LOCATION_BUFFER_MAX,
    )
    while True:
        await asyncio.sleep(settings.LOCATION_FLUSH_INTERVAL)
        async with _buffer_lock:
            flushed = await _flush_now()
            if flushed:
                logger.debug("Periodic flush: %d locations", flushed)


async def flush_all_pending() -> None:
    """Called at shutdown to drain remaining buffer."""
    async with _buffer_lock:
        n = await _flush_now()
        if n:
            logger.info("Shutdown flush: wrote %d buffered locations", n)
