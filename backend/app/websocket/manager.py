"""
WebSocket connection manager with Redis pub/sub for multi-worker scalability.

Architecture
──────────────────────────────────────────────────────────────────────────────
  Agent app  ──WS──► Worker-A  ──publish──► Redis channel "loc:updates"
                                                       │
  Dashboard  ──WS──► Worker-B ◄──subscribe────────────┘
  Dashboard  ──WS──► Worker-A ◄──subscribe (same channel, every worker listens)

This allows N uvicorn/gunicorn workers to share real-time location events
without any agent/watcher needing to land on the same OS process.

Graceful degradation: if Redis is unavailable the manager falls back to
in-process broadcasting (suitable for single-worker / development).
"""
import asyncio
import json
import logging
from typing import Dict, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "trackforce:loc:updates"


class ConnectionManager:
    def __init__(self) -> None:
        # agent_id  → WebSocket  (agents sending their GPS)
        self.agent_connections: Dict[int, WebSocket] = {}
        # user_id   → WebSocket  (admins/managers watching the map)
        self.watcher_connections: Dict[int, WebSocket] = {}

        # Redis handles
        self._redis: Optional[object] = None          # redis.asyncio.Redis
        self._pubsub_task: Optional[asyncio.Task] = None
        self._redis_available = False

    # ─── Redis lifecycle ───────────────────────────────────────────────────────

    async def init_redis(self, redis_url: str) -> None:
        try:
            import redis.asyncio as aioredis  # type: ignore
            client = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=2)
            await client.ping()
            self._redis = client
            self._redis_available = True
            self._pubsub_task = asyncio.create_task(self._pubsub_listener())
            logger.info("Redis pub/sub connected (%s)", redis_url)
        except Exception as exc:
            logger.warning(
                "Redis unavailable (%s) — falling back to in-process broadcast. "
                "Multi-worker location fanout will NOT work in this mode.",
                exc,
            )
            self._redis_available = False

    async def close_redis(self) -> None:
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            try:
                await self._redis.aclose()
            except Exception:
                pass

    # ─── WebSocket lifecycle ───────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, agent_id: int) -> None:
        await websocket.accept()
        self.agent_connections[agent_id] = websocket
        logger.debug("Agent %d connected (total=%d)", agent_id, len(self.agent_connections))

    def disconnect(self, agent_id: int) -> None:
        self.agent_connections.pop(agent_id, None)
        logger.debug("Agent %d disconnected (total=%d)", agent_id, len(self.agent_connections))

    async def connect_watcher(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self.watcher_connections[user_id] = websocket
        logger.debug("Watcher %d connected (total=%d)", user_id, len(self.watcher_connections))

    def disconnect_watcher(self, user_id: int) -> None:
        self.watcher_connections.pop(user_id, None)

    # ─── Broadcast ─────────────────────────────────────────────────────────────

    async def broadcast_location(self, agent_id: int, data: dict) -> None:
        """Called when an agent sends a location update."""
        if self._redis_available:
            # Publish to Redis → all workers (including this one) receive via pubsub
            payload = json.dumps({"type": "location_update", "data": data})
            try:
                await self._redis.publish(REDIS_CHANNEL, payload)  # type: ignore[union-attr]
            except Exception as exc:
                logger.warning("Redis publish failed: %s — falling back", exc)
                await self._fanout_local(data)
        else:
            await self._fanout_local(data)

    async def _fanout_local(self, data: dict) -> None:
        """Deliver a location update to all locally-connected watchers."""
        message = json.dumps({"type": "location_update", "data": data})
        dead: list = []
        for uid, ws in list(self.watcher_connections.items()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.watcher_connections.pop(uid, None)

    # ─── Redis subscriber ──────────────────────────────────────────────────────

    async def _pubsub_listener(self) -> None:
        """Subscribe to the Redis channel and deliver to local watchers."""
        while True:
            try:
                import redis.asyncio as aioredis  # type: ignore
                pubsub = self._redis.pubsub()  # type: ignore[union-attr]
                await pubsub.subscribe(REDIS_CHANNEL)
                logger.info("Subscribed to Redis channel '%s'", REDIS_CHANNEL)

                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        payload = json.loads(message["data"])
                        if payload.get("type") == "location_update":
                            await self._fanout_local(payload["data"])
                    except Exception as exc:
                        logger.error("Error processing pub/sub message: %s", exc)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Redis pub/sub disconnected: %s — reconnecting in 3s", exc)
                await asyncio.sleep(3)

    # ─── Utilities ─────────────────────────────────────────────────────────────

    async def send_to_agent(self, agent_id: int, message: dict) -> None:
        ws = self.agent_connections.get(agent_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.agent_connections.pop(agent_id, None)

    def get_online_agent_ids(self) -> list:
        return list(self.agent_connections.keys())

    @property
    def stats(self) -> dict:
        return {
            "agents_connected": len(self.agent_connections),
            "watchers_connected": len(self.watcher_connections),
            "redis_available": self._redis_available,
        }

