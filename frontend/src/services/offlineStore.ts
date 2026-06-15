/**
 * offlineStore.ts
 *
 * Persistent IndexedDB store for all events captured while the device
 * has no internet connection.  Each store maps 1-to-1 with a sync endpoint.
 *
 * Stores
 * ──────
 *  locations   – GPS points buffered during offline period
 *  punches     – Punch-in / punch-out events
 *  visits      – Visit check-in / check-out events
 *  orders      – Orders created offline
 *  expenses    – Expense records (without file — file sync is online-only)
 */

const DB_NAME = 'fieldtracking_offline'
const DB_VERSION = 2

export type PendingLocation = {
  id?: number
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
  altitude?: number
  address?: string
  recorded_at: string   // ISO string
}

export type PendingPunch = {
  id?: number
  type: 'punch_in' | 'punch_out'
  latitude: number
  longitude: number
  address?: string
  notes?: string
  timestamp: string     // ISO string
}

export type PendingVisitEvent = {
  id?: number
  visit_id: number
  event_type: 'check_in' | 'check_out'
  latitude: number
  longitude: number
  notes?: string
  outcome?: string
  timestamp: string
}

export type PendingOrder = {
  id?: number
  payload: object        // full OrderCreate payload
  timestamp: string
}

class OfflineStoreClass {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const stores = ['locations', 'punches', 'visits', 'orders', 'expenses']
        stores.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id', autoIncrement: true })
          }
        })
      }

      req.onsuccess = () => {
        this.db = req.result
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }

  // ─── Generic CRUD ─────────────────────────────────────────────────────────

  async add<T>(storeName: string, data: T): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialised'))
      const tx = this.db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).add(data)
      req.onsuccess = () => resolve(req.result as number)
      req.onerror = () => reject(req.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([])
      const tx = this.db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  }

  async delete(storeName: string, id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve()
      const tx = this.db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve()
      const tx = this.db.transaction(storeName, 'readwrite')
      const req = tx.objectStore(storeName).clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(0)
      const tx = this.db.transaction(storeName, 'readonly')
      const req = tx.objectStore(storeName).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  // ─── Typed helpers ────────────────────────────────────────────────────────

  addLocation = (loc: Omit<PendingLocation, 'id'>) => this.add<PendingLocation>('locations', loc)
  getLocations = () => this.getAll<PendingLocation>('locations')
  clearLocations = () => this.clear('locations')

  addPunch = (p: Omit<PendingPunch, 'id'>) => this.add<PendingPunch>('punches', p)
  getPunches = () => this.getAll<PendingPunch>('punches')
  deletePunch = (id: number) => this.delete('punches', id)

  addVisitEvent = (v: Omit<PendingVisitEvent, 'id'>) => this.add<PendingVisitEvent>('visits', v)
  getVisitEvents = () => this.getAll<PendingVisitEvent>('visits')
  deleteVisitEvent = (id: number) => this.delete('visits', id)

  addOrder = (o: Omit<PendingOrder, 'id'>) => this.add<PendingOrder>('orders', o)
  getOrders = () => this.getAll<PendingOrder>('orders')
  deleteOrder = (id: number) => this.delete('orders', id)

  async pendingCount(): Promise<number> {
    const counts = await Promise.all([
      this.count('locations'),
      this.count('punches'),
      this.count('visits'),
      this.count('orders'),
    ])
    return counts.reduce((a, b) => a + b, 0)
  }
}

const offlineStore = new OfflineStoreClass()
export default offlineStore
