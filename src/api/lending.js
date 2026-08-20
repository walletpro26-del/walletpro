import { db, auth } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, Timestamp, where,
} from 'firebase/firestore'
import { saveAttachment, getAttachment, deleteAttachmentChunks } from './attachments'
import { saveSnapshot, loadSnapshot, addPending, isCacheFresh, invalidateSnapshot, registerInvalidationListener } from './localCache'

const COL = 'lending'

function toFirestore(data) {
  const ts = data.date ? new Date(data.date) : new Date()
  return {
    timestamp: Timestamp.fromDate(ts),
    userId: auth.currentUser?.uid || '',
    uid: auth.currentUser?.uid || '',
    type: data.type || data.lendType || 'Lend',
    person: data.person || '',
    amount: Math.abs(parseFloat(data.amount)) || 0,
    remarks: data.remarks || data.details || '',
    mobileNo: data.mobileNo || data.phone || '',
    email: data.email || '',
    fileName: data.fileName || data.existingFileName || '',
    mimeType: data.mimeType || data.existingMimeType || '',
    hasAttachment: data.fileData ? true : (data.hasAttachment || false),
    hasChunkedAttachment: data.fileData ? false : (data.hasChunkedAttachment || false),
    fileData: null,
  }
}

export function normalizeLendingType(typeStr) {
  const t = (typeStr || '').toLowerCase().trim()
  if (t === 'lend' || t.includes('loan given') || t === 'loan') return 'LEND'
  if (t === 'borrow' || t.includes('borrowed')) return 'BORROW'
  if (t.includes('they return') || t.includes('received return') || t.includes('received')) return 'THEY_RETURN'
  if (t.includes('i return') || t.includes('i returned')) return 'I_RETURN'
  if (t.includes('forgive') || t.includes('forgiven')) return 'FORGIVE'
  return 'LEND'
}

function fromFirestore(docSnap) {
  const d = docSnap.data()
  const ts = d.timestamp?.toDate?.() || new Date()
  const norm = normalizeLendingType(d.type)

  let label = d.type || ''
  if (norm === 'LEND') label = 'Loan Given'
  else if (norm === 'BORROW') label = 'Borrowed'
  else if (norm === 'THEY_RETURN') label = 'Received Return'
  else if (norm === 'I_RETURN') label = 'I Returned'
  else if (norm === 'FORGIVE') label = 'Forgiven'

  return {
    id: docSnap.id,
    date: ts.toISOString(),
    dateObj: ts,
    type: d.type || '',
    label,
    person: d.person || '',
    amount: parseFloat(d.amount) || 0,
    remarks: d.remarks || '',
    mobileNo: d.mobileNo || '',
    email: d.email || '',
    fileName: d.fileName || '',
    mimeType: d.mimeType || '',
    hasAttachment: d.hasAttachment || false,
    hasChunkedAttachment: d.hasChunkedAttachment || false,
    fileData: d.fileData || null,
    receipt: d.fileData ? 'inline' : '',
    isLend: true,
    sheet: 'lending',
  }
}

// In-memory runtime cache for lending to eliminate duplicate Firestore reads
const _memLendingCacheMap = new Map()
const _memLendingCacheTimeMap = new Map()
const LENDING_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export function invalidateLendingInMemoryCache(uid = '') {
  if (uid) {
    _memLendingCacheMap.delete(uid)
    _memLendingCacheTimeMap.delete(uid)
  } else {
    _memLendingCacheMap.clear()
    _memLendingCacheTimeMap.clear()
  }
}

registerInvalidationListener((type, uid) => {
  if (!type || type === 'lending') {
    invalidateLendingInMemoryCache(uid)
  }
})

export async function addLending(data) {
  const fsData = toFirestore(data)
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('lending', currentUid)
  invalidateLendingInMemoryCache(currentUid)

  const saveOffline = () => {
    const tempId = addPending({
      type: 'add',
      collection: COL,
      data: { ...data, _offline: true },
    })
    const snapshot = loadSnapshot('lending', currentUid) || []
    const optimistic = {
      id: tempId,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      dateObj: data.date ? new Date(data.date) : new Date(),
      person: data.person || '',
      type: data.type || 'LENT',
      amount: parseFloat(data.amount) || 0,
      remarks: data.remarks || '',
      status: data.status || 'Pending',
      phone: data.phone || '',
      email: data.email || '',
      fileName: data.fileName || '',
      mimeType: data.mimeType || '',
      hasAttachment: false,
      hasChunkedAttachment: false,
      _pending: true,
    }
    snapshot.unshift(optimistic)
    saveSnapshot('lending', snapshot, currentUid)
    _memLendingCacheMap.set(currentUid, snapshot)
    _memLendingCacheTimeMap.set(currentUid, Date.now())
    return { success: true, id: tempId, offline: true }
  }

  if (!navigator.onLine) {
    return saveOffline()
  }

  try {
    const docRef = await Promise.race([
      addDoc(collection(db, COL), fsData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 12000))
    ])
    if (data.fileData) {
      await saveAttachment(COL, docRef.id, data.fileData).catch(() => {})
    }
    return { success: true, id: docRef.id }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable' || err?.message?.includes('unavailable') || err?.message === 'timeout_unavailable') {
      return saveOffline()
    }
    throw err
  }
}

export async function updateLending(id, data) {
  const ref = doc(db, COL, id)
  const fsData = toFirestore(data)
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('lending', currentUid)
  invalidateLendingInMemoryCache(currentUid)
  delete fsData.fileData

  const saveOfflineUpdate = () => {
    addPending({ type: 'update', collection: COL, id, data })
    const snapshot = loadSnapshot('lending', currentUid) || []
    const idx = snapshot.findIndex((l) => l.id === id)
    if (idx !== -1) {
      snapshot[idx] = { ...snapshot[idx], ...data, _pending: true }
      saveSnapshot('lending', snapshot, currentUid)
      _memLendingCacheMap.set(currentUid, snapshot)
      _memLendingCacheTimeMap.set(currentUid, Date.now())
    }
    return { success: true, id, offline: true }
  }

  if (!navigator.onLine) {
    return saveOfflineUpdate()
  }

  try {
    await Promise.race([
      updateDoc(ref, fsData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 12000))
    ])
    if (data.fileData) {
      await deleteAttachmentChunks(COL, id).catch(() => {})
      await saveAttachment(COL, id, data.fileData).catch(() => {})
    }
    return { success: true }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable' || err?.message?.includes('unavailable') || err?.message === 'timeout_unavailable') {
      return saveOfflineUpdate()
    }
    throw err
  }
}

function unpackLendingDoc(docSnap) {
  const data = docSnap.data()
  if (data.isBatch && Array.isArray(data.items)) {
    return data.items.map((item, idx) => {
      const ts = item.date ? new Date(item.date) : new Date()
      return {
        id: item.id || `${docSnap.id}_idx_${idx}`,
        parentDocId: docSnap.id,
        date: ts.toISOString(),
        dateObj: ts,
        person: item.person || '',
        type: item.type || 'Lent',
        amount: parseFloat(item.amount) || 0,
        remarks: item.remarks || '',
        status: item.isSettled ? 'Settled' : (item.status || 'Pending'),
        phone: item.phone || '',
        email: item.email || '',
        fileName: item.fileName || '',
        mimeType: item.mimeType || '',
        hasAttachment: false,
        hasChunkedAttachment: false,
        fileData: null,
      }
    })
  }
  return [fromFirestore(docSnap)]
}

export async function deleteLending(id, parentDocId = null) {
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('lending', currentUid)
  invalidateLendingInMemoryCache(currentUid)

  const saveOfflineDelete = () => {
    addPending({ type: 'delete', collection: COL, id })
    const snapshot = loadSnapshot('lending', currentUid) || []
    const filtered = snapshot.filter((l) => l.id !== id)
    saveSnapshot('lending', filtered, currentUid)
    _memLendingCacheMap.set(currentUid, filtered)
    _memLendingCacheTimeMap.set(currentUid, Date.now())
    return { success: true, offline: true }
  }

  if (!navigator.onLine) {
    return saveOfflineDelete()
  }

  if (parentDocId) {
    try {
      const ref = doc(db, COL, parentDocId)
      const snap = await getDocs(query(collection(db, COL), where('__name__', '==', parentDocId)))
      if (snap && !snap.empty) {
        const data = snap.docs[0].data()
        if (Array.isArray(data.items)) {
          const updatedItems = data.items.filter((item) => item.id !== id)
          if (updatedItems.length === 0) {
            await deleteDoc(ref)
          } else {
            await updateDoc(ref, { items: updatedItems, count: updatedItems.length, updatedAt: Timestamp.now() })
          }
          return { success: true }
        }
      }
    } catch (err) {
      console.warn('[lending] Batch item delete fallback:', err?.message)
    }
  }

  try {
    await Promise.race([
      deleteDoc(doc(db, COL, id)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 12000))
    ])
    await deleteAttachmentChunks(COL, id).catch(() => {})
    return { success: true }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable' || err?.message?.includes('unavailable') || err?.message === 'timeout_unavailable') {
      return saveOfflineDelete()
    }
    throw err
  }
}

export async function getRecentLending(n = 20) {
  const all = await getAllLending()
  return all.slice(0, n)
}

export async function getAllLending(forceRefresh = false, uidOverride = '') {
  const currentUid = uidOverride || auth.currentUser?.uid || ''
  if (!currentUid) return []

  // 1. In-memory runtime cache (0 Firestore reads)
  const memTime = _memLendingCacheTimeMap.get(currentUid) || 0
  if (!forceRefresh && _memLendingCacheMap.has(currentUid) && (Date.now() - memTime) < LENDING_CACHE_TTL) {
    return _memLendingCacheMap.get(currentUid)
  }

  // 2. Check if offline or local snapshot is fresh (15 min TTL)
  if (!navigator.onLine || (!forceRefresh && isCacheFresh('lending', currentUid))) {
    const cached = loadSnapshot('lending', currentUid)
    if (cached && cached.length > 0) {
      const sorted = cached.sort((a, b) => b.dateObj - a.dateObj)
      _memLendingCacheMap.set(currentUid, sorted)
      _memLendingCacheTimeMap.set(currentUid, Date.now())
      return sorted
    }
  }

  try {
    const qScoped = query(collection(db, COL), where('userId', '==', currentUid))
    const snapScoped = await Promise.race([
      getDocs(qScoped),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 12000))
    ])

    let items = []
    const seenIds = new Set()

    if (snapScoped && !snapScoped.empty) {
      snapScoped.docs.forEach((docSnap) => {
        const unpacked = unpackLendingDoc(docSnap)
        unpacked.forEach((item) => {
          if (!seenIds.has(item.id)) {
            items.push(item)
            seenIds.add(item.id)
          }
        })
      })
    }

    // Fallback: Query by legacy 'uid' field if userId query returned 0 items
    if (items.length === 0) {
      const qUid = query(collection(db, COL), where('uid', '==', currentUid))
      const snapUid = await getDocs(qUid).catch(() => null)
      if (snapUid && !snapUid.empty) {
        snapUid.docs.forEach((docSnap) => {
          const unpacked = unpackLendingDoc(docSnap)
          unpacked.forEach((item) => {
            if (!seenIds.has(item.id)) {
              items.push(item)
              seenIds.add(item.id)
            }
          })
        })
      }
    }

    const sorted = items.sort((a, b) => b.dateObj - a.dateObj)
    saveSnapshot('lending', sorted, currentUid)
    _memLendingCacheMap.set(currentUid, sorted)
    _memLendingCacheTimeMap.set(currentUid, Date.now())
    return sorted
  } catch (err) {
    console.warn('Lending fetch failed/offline, using local cache:', err?.message)
    const cached = loadSnapshot('lending', currentUid)
    if (cached) return cached.sort((a, b) => new Date(b.date) - new Date(a.date))
    return []
  }
}

/**
 * Save Lend/Borrow records as a single Batched Array Document (1 Write per 300 records!)
 * @param {string} currentUid
 * @param {Array<object>} itemsArray
 * @returns {Promise<{ success: boolean, docCount: number }>}
 */
export async function saveLendingBatch(currentUid, itemsArray = []) {
  if (!currentUid) throw new Error('User not authenticated')
  if (!Array.isArray(itemsArray) || itemsArray.length === 0) return { success: true, docCount: 0 }

  invalidateSnapshot('lending', currentUid)
  invalidateLendingInMemoryCache(currentUid)

  const CHUNK_SIZE = 300
  let docCount = 0

  for (let i = 0; i < itemsArray.length; i += CHUNK_SIZE) {
    const chunk = itemsArray.slice(i, i + CHUNK_SIZE)
    const formattedItems = chunk.map((item, idx) => {
      const ts = item.date ? new Date(item.date) : new Date()
      return {
        id: item.id || `lend_${Date.now()}_${i + idx}_${Math.floor(Math.random() * 1000)}`,
        date: ts.toISOString(),
        person: item.person || '',
        type: item.type || 'Lent',
        amount: parseFloat(item.amount) || 0,
        remarks: item.remarks || '',
        isSettled: Boolean(item.isSettled),
        status: item.isSettled ? 'Settled' : 'Pending',
      }
    })

    const payload = {
      userId: currentUid,
      uid: currentUid,
      isBatch: true,
      count: formattedItems.length,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      items: formattedItems,
    }

    await addDoc(collection(db, COL), payload)
    docCount++
  }

  return { success: true, docCount }
}

export async function getLendingAttachment(id) {
  return getAttachment(COL, id)
}

export function computeLendingStatsLocally(all) {
  let receivable = 0, payable = 0

  for (const t of all) {
    const amt = parseFloat(t.amount) || 0
    const norm = normalizeLendingType(t.type)
    if (norm === 'LEND') receivable += amt
    else if (norm === 'BORROW') payable += amt
    else if (norm === 'THEY_RETURN') receivable -= amt
    else if (norm === 'I_RETURN') payable -= amt
    else if (norm === 'FORGIVE') receivable -= amt
  }

  return { receivable, payable, net: receivable - payable }
}

export async function getLendingStats() {
  const all = await getAllLending()
  return computeLendingStatsLocally(all)
}
