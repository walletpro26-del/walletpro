/**
 * localCache.js — WalletVibe offline-first user-isolated local cache
 *
 * Provides:
 *  - Snapshot storage: last-known expenses & lending data (isolated by user UID)
 *  - Pending queue: offline writes that need to sync
 *  - All stored in localStorage (browser-local, not sent anywhere)
 */

function getKey(type, uid = '') {
  const userPrefix = uid ? `_${uid}` : ''
  return `wv_cache${userPrefix}_${type}`
}

const PENDING_KEYS = {
  pending: 'wv_pending_queue',
  pendingId: 'wv_pending_id',
}

// ── Snapshot (read cache) ────────────────────────────────────────────────────

/**
 * Save a data snapshot locally (called after successful Firebase fetch)
 * @param {'expenses'|'lending'|'bank'} type
 * @param {Array} data
 * @param {string} uid
 */
export function saveSnapshot(type, data, uid = '') {
  try {
    const key = getKey(type, uid)
    // Store only essential fields to keep size manageable and prevent QuotaExceededError
    const slim = data.map((item) => {
      const { dateObj, fileData, ...rest } = item
      return rest
    })
    localStorage.setItem(key, JSON.stringify(slim))
    localStorage.setItem(key + '_ts', Date.now().toString())
  } catch (err) {
    console.warn('[localCache] saveSnapshot failed:', err?.message)
  }
}

/**
 * Load last-known data snapshot from local storage
 * @param {'expenses'|'lending'|'bank'} type
 * @param {string} uid
 * @returns {Array|null}
 */
export function loadSnapshot(type, uid = '') {
  try {
    const key = getKey(type, uid)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const items = JSON.parse(raw)
    // Rehydrate date objects
    return items.map((item) => ({
      ...item,
      dateObj: item.date ? new Date(item.date) : new Date(),
    }))
  } catch {
    return null
  }
}

/**
 * Get snapshot age in ms (or null if no snapshot)
 * @param {'expenses'|'lending'|'bank'} type
 * @param {string} uid
 */
export function getSnapshotAge(type, uid = '') {
  try {
    const key = getKey(type, uid)
    const ts = localStorage.getItem(key + '_ts')
    if (!ts) return null
    return Date.now() - parseInt(ts, 10)
  } catch { return null }
}

/**
 * Clear cached user snapshot
 * @param {string} uid
 */
export function clearUserCache(uid = '') {
  try {
    if (!uid) return
    localStorage.removeItem(getKey('expenses', uid))
    localStorage.removeItem(getKey('expenses', uid) + '_ts')
    localStorage.removeItem(getKey('lending', uid))
    localStorage.removeItem(getKey('lending', uid) + '_ts')
    localStorage.removeItem(getKey('bank', uid))
    localStorage.removeItem(getKey('bank', uid) + '_ts')
  } catch {}
}

// ── Pending Queue (offline writes) ───────────────────────────────────────────

function generatePendingId() {
  const n = parseInt(localStorage.getItem(PENDING_KEYS.pendingId) || '0', 10) + 1
  localStorage.setItem(PENDING_KEYS.pendingId, n.toString())
  return `pending_${n}_${Date.now()}`
}

/**
 * Add an operation to the pending sync queue
 * @param {{ type: 'add'|'update'|'delete', collection: 'expenses'|'lending', data: object, tempId?: string }} op
 * @returns {string} tempId assigned to this pending op
 */
export function addPending(op) {
  try {
    const queue = getPendingQueue()
    const tempId = op.tempId || generatePendingId()
    queue.push({ ...op, tempId, createdAt: Date.now() })
    localStorage.setItem(PENDING_KEYS.pending, JSON.stringify(queue))
    return tempId
  } catch (err) {
    console.warn('[localCache] addPending failed:', err?.message)
    return op.tempId || ''
  }
}

/**
 * Get all pending operations
 * @returns {Array}
 */
export function getPendingQueue() {
  try {
    const raw = localStorage.getItem(PENDING_KEYS.pending)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * Remove completed operations from queue by tempId array
 * @param {string[]} tempIds
 */
export function clearPending(tempIds) {
  try {
    const queue = getPendingQueue()
    const remaining = queue.filter((op) => !tempIds.includes(op.tempId))
    localStorage.setItem(PENDING_KEYS.pending, JSON.stringify(remaining))
  } catch (err) {
    console.warn('[localCache] clearPending failed:', err?.message)
  }
}

/**
 * Get count of pending operations
 */
export function getPendingCount() {
  return getPendingQueue().length
}

/**
 * Clear all pending operations (use after full sync)
 */
export function clearAllPending() {
  try {
    localStorage.setItem(PENDING_KEYS.pending, '[]')
  } catch {}
}
