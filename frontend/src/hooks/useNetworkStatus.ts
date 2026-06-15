import { useEffect, useState } from 'react'
import networkManager from '../services/networkManager'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(networkManager.isOnline)
  const [syncStatus, setSyncStatus] = useState(networkManager.syncStatus)
  const [pendingCount, setPendingCount] = useState(networkManager.pendingCount)

  useEffect(() => {
    const unsub = networkManager.subscribe((status, pending) => {
      setIsOnline(networkManager.isOnline)
      setSyncStatus(status)
      setPendingCount(pending)
    })
    return unsub
  }, [])

  return { isOnline, syncStatus, pendingCount, syncNow: () => networkManager.syncNow() }
}
