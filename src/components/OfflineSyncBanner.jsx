import { useEffect, useState, useCallback, useRef } from 'react'
import { getPendingQueue, clearPending } from '../api/localCache'
import { addDoc, collection, updateDoc, deleteDoc, doc, Timestamp, setDoc } from 'firebase/firestore'
import { db, auth } from '../firebase'

export default function OfflineSyncBanner({ onSyncComplete }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(() => getPendingQueue().length)
  const [syncing, setSyncing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  const syncingRef = useRef(false)

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingQueue().length)
  }, [])

  const handleSync = useCallback(async () => {
    if (syncingRef.current) return
    const queue = getPendingQueue()
    if (queue.length === 0) {
      setSyncing(false)
      syncingRef.current = false
      return
    }
    if (!auth.currentUser) {
      setSyncing(false)
      syncingRef.current = false
      return
    }

    syncingRef.current = true
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

          // Idempotent write using deterministic tempId to prevent duplicates
          if (op.tempId) {
            await Promise.race([
              setDoc(doc(db, col, op.tempId), fsData, { merge: true }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 12000))
            ])
          } else {
            await Promise.race([
              addDoc(collection(db, col), fsData),
              new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 12000))
            ])
          }
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 12000))
          ])
          succeeded.push(op.tempId)
        } else if (op.type === 'delete' && op.id) {
          await Promise.race([
            deleteDoc(doc(db, op.collection, op.id)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 12000))
          ])
          succeeded.push(op.tempId)
        }
      } catch (err) {
        networkFailed = true
        // Only mark offline if browser also reports offline
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsOnline(false)
        }
      }
    }

    if (succeeded.length > 0) {
      clearPending(succeeded)
      const remaining = getPendingQueue().length
      setPendingCount(remaining)
      setIsOnline(true)
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 3000)
      onSyncComplete?.()
    }

    syncingRef.current = false
    setSyncing(false)
  }, [onSyncComplete])

  useEffect(() => {
    refreshPendingCount()

    const onOnline = () => {
      setIsOnline(true)
      refreshPendingCount()
      handleSync()
    }
    const onOffline = () => {
      setIsOnline(false)
      syncingRef.current = false
      setSyncing(false)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Immediate sync on mount if online and items are pending
    if (navigator.onLine && getPendingQueue().length > 0) {
      handleSync()
    }

    // Periodic self-healing check every 4 seconds
    const pollInterval = setInterval(() => {
      const currentOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
      setIsOnline(currentOnline)
      const queueLen = getPendingQueue().length
      setPendingCount(queueLen)
      if (currentOnline && queueLen > 0 && !syncingRef.current) {
        handleSync()
      }
    }, 4000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(pollInterval)
    }
  }, [refreshPendingCount, handleSync])

  // Don't show if online + nothing pending + not just synced
  if (isOnline && pendingCount === 0 && !justSynced) return null

  if (justSynced) {
    return (
      <div
        className="offline-sync-banner synced"
        style={{
          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
          color: '#ffffff',
          padding: '7px 12px',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
        }}
      >
        <span>✅ All data synced to cloud!</span>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div
        className="offline-sync-banner offline"
        style={{
          background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
          color: '#ffffff',
          padding: '7px 12px',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>📴</span>
          <span>
            <strong>Offline mode</strong>
            {pendingCount > 0 && ` — ${pendingCount} item${pendingCount > 1 ? 's' : ''} saved locally`}
          </span>
        </div>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 4,
              border: 'none',
              background: '#ffffff',
              color: '#d97706',
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div
        className="offline-sync-banner syncing"
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
          color: '#ffffff',
          padding: '7px 12px',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
          <span>
            {syncing
              ? `Syncing ${pendingCount} pending item${pendingCount > 1 ? 's' : ''} to cloud…`
              : `${pendingCount} item${pendingCount > 1 ? 's' : ''} saved locally (ready to sync)`}
          </span>
        </div>
        {!syncing && (
          <button
            type="button"
            className="sync-now-btn"
            onClick={handleSync}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 4,
              border: 'none',
              background: '#ffffff',
              color: '#4f46e5',
              cursor: 'pointer',
            }}
          >
            Sync now
          </button>
        )}
      </div>
    )
  }

  return null
}
