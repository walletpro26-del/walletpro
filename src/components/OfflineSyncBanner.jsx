import { useEffect, useState, useCallback } from 'react'
import { getPendingQueue, clearPending } from '../api/localCache'
import { addDoc, collection, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'

export default function OfflineSyncBanner({ onSyncComplete }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingQueue().length)
  }, [])

  useEffect(() => {
    refreshPendingCount()

    const onOnline = () => {
      setIsOnline(true)
      refreshPendingCount()
    }
    const onOffline = () => {
      setIsOnline(false)
      setSyncing(false)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Poll pending count every 5s to stay in sync
    const pollInterval = setInterval(refreshPendingCount, 5000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(pollInterval)
    }
  }, [refreshPendingCount])

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !syncing) {
      handleSync()
    }
  }, [isOnline, pendingCount])

  async function handleSync() {
    const queue = getPendingQueue()
    if (queue.length === 0) {
      setSyncing(false)
      return
    }
    if (!auth.currentUser) {
      setSyncing(false)
      return
    }

    setSyncing(true)
    const succeeded = []
    let networkFailed = false

    for (const op of queue) {
      if (networkFailed) break

      try {
        const col = op.collection

        if (op.type === 'add') {
          const data = { ...op.data }
          delete data._offline
          delete data._pending
          const ts = data.date ? new Date(data.date) : new Date()
          const fsData = {
            timestamp: Timestamp.fromDate(ts),
            userId: auth.currentUser.uid,
            ...Object.fromEntries(
              Object.entries(data).filter(([k]) =>
                !['id', 'date', 'dateObj', 'label', 'receipt', 'isLend', 'sheet', 'fileData', 'tempId'].includes(k)
              )
            ),
            fileData: null,
          }

          await Promise.race([
            addDoc(collection(db, col), fsData),
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 3000))
          ])
          succeeded.push(op.tempId)
        } else if (op.type === 'update' && op.id) {
          const ref = doc(db, op.collection, op.id)
          const data = { ...op.data }
          const ts = data.date ? new Date(data.date) : new Date()
          const fsData = {
            timestamp: Timestamp.fromDate(ts),
            userId: auth.currentUser.uid,
            ...Object.fromEntries(
              Object.entries(data).filter(([k]) =>
                !['id', 'date', 'dateObj', 'label', 'receipt', 'isLend', 'sheet', 'fileData'].includes(k)
              )
            ),
          }

          await Promise.race([
            updateDoc(ref, fsData),
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 3000))
          ])
          succeeded.push(op.tempId)
        } else if (op.type === 'delete' && op.id) {
          await Promise.race([
            deleteDoc(doc(db, op.collection, op.id)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 3000))
          ])
          succeeded.push(op.tempId)
        }
      } catch (err) {
        // Network unreachable or timeout -> mark as offline and stop sync loop for now
        networkFailed = true
        setIsOnline(false)
      }
    }

    if (succeeded.length > 0) {
      clearPending(succeeded)
      setPendingCount(getPendingQueue().length)
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 3000)
      onSyncComplete?.()
    }

    setSyncing(false)
  }

  // Don't show if online + nothing pending + not just synced
  if (isOnline && pendingCount === 0 && !justSynced) return null

  if (justSynced) {
    return (
      <div className="offline-sync-banner synced">
        <span>✅ All data synced!</span>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="offline-sync-banner offline">
        <span className="offline-icon">📴</span>
        <span>
          <strong>Offline mode</strong>
          {pendingCount > 0 && ` — ${pendingCount} item${pendingCount > 1 ? 's' : ''} saved locally (will sync when online)`}
        </span>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className="offline-sync-banner syncing">
        <span className="sync-icon-spin">⟳</span>
        <span>
          {syncing
            ? `Syncing ${pendingCount} item${pendingCount > 1 ? 's' : ''}…`
            : `${pendingCount} item${pendingCount > 1 ? 's' : ''} saved locally`}
        </span>
        {!syncing && (
          <button className="sync-now-btn" onClick={handleSync}>
            Sync now
          </button>
        )}
      </div>
    )
  }

  return null
}
