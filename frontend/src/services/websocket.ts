/**
 * WebSocket client with:
 *  - Auto-reconnect on disconnect (exponential back-off)
 *  - Offline buffering: GPS points are stored in IndexedDB when WS is down
 *  - Reconnection flushes buffered points via the bulk /tracking/sync REST API
 */
import networkManager from './networkManager'

type LocationCallback = (data: object) => void

// Back-off: 1s → 2s → 4s → 8s → max 30s
const BACKOFF_BASE = 1000
const BACKOFF_MAX = 30_000

class TrackingWebSocket {
  private ws: WebSocket | null = null
  private agentId: number | null = null
  private token: string | null = null
  private onLocationUpdate: LocationCallback | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private isWatcher = false
  private _stopped = false

  // ─── Agent GPS sender ────────────────────────────────────────────────────

  connect(agentId: number, token: string, onUpdate: LocationCallback) {
    this._stopped = false
    this.agentId = agentId
    this.token = token
    this.onLocationUpdate = onUpdate
    this.isWatcher = false
    this._open(`ws://localhost:8000/api/tracking/ws/${agentId}?token=${token}`)
  }

  // ─── Dashboard watcher ───────────────────────────────────────────────────

  connectDashboard(userId: number, token: string, onUpdate: LocationCallback) {
    this._stopped = false
    this.agentId = userId
    this.token = token
    this.onLocationUpdate = onUpdate
    this.isWatcher = true
    this._open(`ws://localhost:8000/api/tracking/ws/dashboard/${userId}?token=${token}`)
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  private _open(url: string) {
    if (this.ws) {
      this.ws.onclose = null  // prevent re-trigger reconnect from old socket
      this.ws.close()
    }
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.retryCount = 0
      // Flush any buffered offline locations now that we're back online
      networkManager.syncNow()
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.onLocationUpdate?.(data)
      } catch {
        // ignore malformed frames
      }
    }

    this.ws.onclose = () => {
      if (this._stopped) return
      const delay = Math.min(BACKOFF_BASE * 2 ** this.retryCount, BACKOFF_MAX)
      this.retryCount++
      console.log(`[WS] Disconnected — reconnecting in ${delay}ms (attempt ${this.retryCount})`)
      this.reconnectTimer = setTimeout(() => {
        if (!this._stopped && this.agentId && this.token) {
          if (this.isWatcher) {
            this._open(`ws://localhost:8000/api/tracking/ws/dashboard/${this.agentId}?token=${this.token}`)
          } else {
            this._open(`ws://localhost:8000/api/tracking/ws/${this.agentId}?token=${this.token}`)
          }
        }
      }, delay)
    }

    this.ws.onerror = () => {
      // errors are followed by close — handled there
    }
  }

  // ─── Send a GPS point ────────────────────────────────────────────────────

  async sendLocation(lat: number, lng: number, extras?: object) {
    const payload = { latitude: lat, longitude: lng, ...extras }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    } else {
      // WebSocket not open — buffer offline and sync later
      await networkManager.bufferLocation({
        latitude: lat,
        longitude: lng,
        recorded_at: new Date().toISOString(),
        ...extras,
      } as any)
    }
  }

  disconnect() {
    this._stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const trackingWS = new TrackingWebSocket()
export default TrackingWebSocket

