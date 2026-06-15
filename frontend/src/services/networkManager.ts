/**
 * networkManager.ts
 *
 * Detects online/offline transitions and automatically syncs all pending
 * IndexedDB records to the backend when connectivity is restored.
 *
 * Sync sequence (order matters):
 *   1. Buffered GPS locations  – bulk endpoint, fire-and-forget
 *   2. Punch in/out events     – sequential (must arrive in order)
 *   3. Visit check-in/out      – sequential per visit
 *   4. Offline orders          – sequential
 */
import api from './api'
import offlineStore from './offlineStore'

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'
type StatusListener = (status: SyncStatus, pending: number) => void

class NetworkManager {
  private _online = navigator.onLine
  private _listeners: StatusListener[] = []
  private _syncStatus: SyncStatus = 'idle'
  private _pendingCount = 0
  private _syncTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    window.addEventListener('online', this._handleOnline)
    window.addEventListener('offline', this._handleOffline)
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  get isOnline() { return this._online }
  get syncStatus() { return this._syncStatus }
  get pendingCount() { return this._pendingCount }

  subscribe(listener: StatusListener) {
    this._listeners.push(listener)
    return () => { this._listeners = this._listeners.filter((l) => l !== listener) }
  }

  /** Call on app boot to refresh pending count from IDB */
  async init() {
    await offlineStore.init()
    this._pendingCount = await offlineStore.pendingCount()
    this._notify()
    // If we're already online at boot, schedule a sync after a short delay
    if (this._online && this._pendingCount > 0) {
      this._scheduleSync(2000)
    }
  }

  /** Trigger a manual sync (e.g. after user taps "Sync now") */
  async syncNow() {
    if (!this._online) return
    await this._doSync()
  }

  // ─── Offline buffering helpers (used by other services) ────────────────────

  async bufferLocation(loc: Parameters<typeof offlineStore.addLocation>[0]) {
    await offlineStore.addLocation(loc)
    this._pendingCount++
    this._notify()
  }

  async bufferPunch(p: Parameters<typeof offlineStore.addPunch>[0]) {
    await offlineStore.addPunch(p)
    this._pendingCount++
    this._notify()
  }

  async bufferVisitEvent(v: Parameters<typeof offlineStore.addVisitEvent>[0]) {
    await offlineStore.addVisitEvent(v)
    this._pendingCount++
    this._notify()
  }

  async bufferOrder(o: Parameters<typeof offlineStore.addOrder>[0]) {
    await offlineStore.addOrder(o)
    this._pendingCount++
    this._notify()
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _handleOnline = () => {
    this._online = true
    console.log('[Network] Online — scheduling sync')
    this._scheduleSync(1500)
    this._notify()
  }

  private _handleOffline = () => {
    this._online = false
    console.log('[Network] Offline — buffering mode active')
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._notify()
  }

  private _scheduleSync(delayMs: number) {
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._syncTimer = setTimeout(() => this._doSync(), delayMs)
  }

  private async _doSync() {
    if (!this._online || this._syncStatus === 'syncing') return
    this._pendingCount = await offlineStore.pendingCount()
    if (this._pendingCount === 0) return

    this._syncStatus = 'syncing'
    this._notify()
    console.log('[Sync] Starting with %d pending records', this._pendingCount)

    try {
      await this._syncLocations()
      await this._syncPunches()
      await this._syncVisitEvents()
      await this._syncOrders()

      this._pendingCount = await offlineStore.pendingCount()
      this._syncStatus = 'success'
      console.log('[Sync] Complete')
    } catch (err) {
      console.error('[Sync] Failed:', err)
      this._syncStatus = 'error'
    } finally {
      this._notify()
      // Reset status after showing success/error for 3s
      setTimeout(() => {
        this._syncStatus = 'idle'
        this._notify()
      }, 3000)
    }
  }

  /** Bulk-upload all buffered GPS points */
  private async _syncLocations() {
    const locations = await offlineStore.getLocations()
    if (!locations.length) return

    // Strip local IDB ids before sending
    const payload = locations.map(({ id: _id, ...rest }) => rest)
    await api.post('/tracking/sync', { locations: payload })
    await offlineStore.clearLocations()
    console.log('[Sync] Locations: %d', payload.length)
  }

  /** Replay punch events in chronological order */
  private async _syncPunches() {
    const punches = await offlineStore.getPunches()
    if (!punches.length) return

    // Sort oldest-first so punch-in always precedes punch-out
    punches.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    for (const p of punches) {
      try {
        const endpoint = p.type === 'punch_in' ? '/tracking/punch-in' : '/tracking/punch-out'
        await api.post(endpoint, {
          latitude: p.latitude,
          longitude: p.longitude,
          address: p.address,
          notes: p.notes,
        })
        await offlineStore.deletePunch(p.id!)
        console.log('[Sync] Punch %s synced', p.type)
      } catch (err: any) {
        // 400 "already punched in" → stale record; drop it
        if (err?.response?.status === 400) {
          await offlineStore.deletePunch(p.id!)
        } else {
          throw err   // network error → abort, retry next time
        }
      }
    }
  }

  /** Replay visit check-in / check-out events */
  private async _syncVisitEvents() {
    const events = await offlineStore.getVisitEvents()
    if (!events.length) return

    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    for (const ev of events) {
      try {
        const endpoint =
          ev.event_type === 'check_in'
            ? `/visits/${ev.visit_id}/check-in`
            : `/visits/${ev.visit_id}/check-out`
        await api.post(endpoint, {
          latitude: ev.latitude,
          longitude: ev.longitude,
          notes: ev.notes,
          outcome: ev.outcome,
        })
        await offlineStore.deleteVisitEvent(ev.id!)
      } catch (err: any) {
        if (err?.response?.status === 400) {
          await offlineStore.deleteVisitEvent(ev.id!)
        } else {
          throw err
        }
      }
    }
    console.log('[Sync] Visit events: %d', events.length)
  }

  /** Replay offline orders */
  private async _syncOrders() {
    const orders = await offlineStore.getOrders()
    if (!orders.length) return

    for (const o of orders) {
      try {
        await api.post('/orders', o.payload)
        await offlineStore.deleteOrder(o.id!)
      } catch (err: any) {
        if (err?.response?.status === 400) {
          await offlineStore.deleteOrder(o.id!)
        } else {
          throw err
        }
      }
    }
    console.log('[Sync] Orders: %d', orders.length)
  }

  private _notify() {
    this._listeners.forEach((l) => l(this._syncStatus, this._pendingCount))
  }
}

const networkManager = new NetworkManager()
export default networkManager
