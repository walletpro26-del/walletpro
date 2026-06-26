/**
 * localCache.js — WalletVibe offline-first local cache
 *
 * Provides:
 *  - Snapshot storage: last-known expenses & lending data
 *  - Pending queue: offline writes that need to sync
 *  - All stored in localStorage (browser-local, not sent anywhere)
 */

const KEYS = {
  expenses: 'wv_cache_expenses',
  lending: 'wv_cache_lending',
  pending: 'wv_pending_queue',
  pendingId: 'wv_pending_id',
}

// ── Snapshot (read cache) ────────────────────────────────────────────────────

/**
 * Save a data snapshot locally (called after successful Firebase fetch)
 * @param {'expenses'|'lending'} type
 * @param {Array} data
 */
export function saveSnapshot(type, data) {
  try {
    const key = KEYS[type]
    if (!key) return
    // Store only essential fields to keep size manageable
    const slim = data.map((item) => {
      const { dateObj, ...rest } = item // dateObj is a Date object — not serializable
      return rest
    })
    localStorage.setItem(key, JSON.stringify(slim))
    localStorage.setItem(key + '_ts', Date.now().toString())
  } catch (err) {
    // localStorage might be full — fail silently
    console.warn('[localCache] saveSnapshot failed:', err?.message)
  }
}

/**
 * Load last-known data snapshot from local storage
 * @param {'expenses'|'lending'} type
 * @returns {Array|null}
 */
export function loadSnapshot(type) {
  try {
    const key = KEYS[type]
    if (!key) return null
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
 */
export function getSnapshotAge(type) {
  try {
    const key = KEYS[type]
    const ts = localStorage.getItem(key + '_ts')
    if (!ts) return null
    return Date.now() - parseInt(ts, 10)
  } catch { return null }
}

// ── Pending Queue (offline writes) ───────────────────────────────────────────

function generatePendingId() {
  const n = parseInt(localStorage.getItem(KEYS.pendingId) || '0', 10) + 1
  localStorage.setItem(KEYS.pendingId, n.toString())
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
    localStorage.setItem(KEYS.pending, JSON.stringify(queue))
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
    const raw = localStorage.getItem(KEYS.pending)
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
    localStorage.setItem(KEYS.pending, JSON.stringify(remaining))
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
    localStorage.setItem(KEYS.pending, '[]')
  } catch {}
}
