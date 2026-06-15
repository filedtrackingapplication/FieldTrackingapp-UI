import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { WifiOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

export default function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, syncNow } = useNetworkStatus()

  // Always visible when offline; show sync feedback when online + syncing/pending
  if (isOnline && pendingCount === 0 && syncStatus === 'idle') return null

  return (
    <div
      className={clsx(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all',
        !isOnline
          ? 'bg-red-600 text-white'
          : syncStatus === 'syncing'
          ? 'bg-blue-600 text-white'
          : syncStatus === 'success'
          ? 'bg-green-600 text-white'
          : syncStatus === 'error'
          ? 'bg-orange-600 text-white'
          : 'bg-yellow-500 text-white'   // pending > 0, idle
      )}
    >
      {!isOnline && <WifiOff className="w-4 h-4 shrink-0" />}
      {isOnline && syncStatus === 'syncing' && (
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
      )}
      {isOnline && syncStatus === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
      {isOnline && syncStatus === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
      {isOnline && syncStatus === 'idle' && pendingCount > 0 && (
        <RefreshCw className="w-4 h-4 shrink-0" />
      )}

      <span>
        {!isOnline
          ? `Offline — ${pendingCount} events queued`
          : syncStatus === 'syncing'
          ? 'Syncing offline data…'
          : syncStatus === 'success'
          ? 'All data synced!'
          : syncStatus === 'error'
          ? 'Sync failed — will retry'
          : `${pendingCount} events pending sync`}
      </span>

      {/* Manual sync button when online and pending */}
      {isOnline && pendingCount > 0 && syncStatus === 'idle' && (
        <button
          onClick={syncNow}
          className="ml-1 underline text-xs opacity-90 hover:opacity-100"
        >
          Sync now
        </button>
      )}
    </div>
  )
}
