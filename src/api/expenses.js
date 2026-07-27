import { db, auth } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, where, Timestamp,
} from 'firebase/firestore'
import { saveAttachment, getAttachment, deleteAttachmentChunks } from './attachments'
import { saveSnapshot, loadSnapshot, addPending, isCacheFresh, invalidateSnapshot } from './localCache'

const COL = 'expenses'

function toFirestore(data) {
  const ts = data.date ? new Date(data.date) : new Date()
  return {
    timestamp: Timestamp.fromDate(ts),
    userId: auth.currentUser?.uid || '',
    uid: auth.currentUser?.uid || '',
    forWhom: data.forWhom || 'Self',
    category: data.category || '',
    details: data.details || '',
    amount: parseFloat(data.amount) || 0,
    paymentMode: data.paymentMode || 'Cash',
    remarks: data.remarks || '',
    fileName: data.fileName || data.existingFileName || '',
    mimeType: data.mimeType || data.existingMimeType || '',
    hasAttachment: data.fileData ? true : (data.hasAttachment || false),
    hasChunkedAttachment: data.fileData ? false : (data.hasChunkedAttachment || false),
    fileData: null,
  }
}

function fromFirestore(docSnap) {
  const d = docSnap.data()
  const ts = d.timestamp?.toDate?.() || new Date()
  return {
    id: docSnap.id,
    date: ts.toISOString(),
    dateObj: ts,
    forWhom: d.forWhom || '',
    category: d.category || '',
    details: d.details || '',
    amount: parseFloat(d.amount) || 0,
    paymentMode: d.paymentMode || 'Cash',
    remarks: d.remarks || '',
    fileName: d.fileName || '',
    mimeType: d.mimeType || '',
    hasAttachment: d.hasAttachment || false,
    hasChunkedAttachment: d.hasChunkedAttachment || false,
    fileData: d.fileData || null,
    receipt: d.fileData ? 'inline' : '',
  }
}

// In-memory runtime cache for expenses to eliminate duplicate Firestore reads
const _memExpenseCacheMap = new Map()
const _memExpenseCacheTimeMap = new Map()
const EXPENSE_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export function invalidateExpenseInMemoryCache(uid = '') {
  if (uid) {
    _memExpenseCacheMap.delete(uid)
    _memExpenseCacheTimeMap.delete(uid)
  } else {
    _memExpenseCacheMap.clear()
    _memExpenseCacheTimeMap.clear()
  }
}

export async function addExpense(data) {
  const fsData = toFirestore(data)
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('expenses', currentUid)
  invalidateExpenseInMemoryCache(currentUid)

  const saveOffline = () => {
    const tempId = addPending({
      type: 'add',
      collection: COL,
      data: { ...data, _offline: true },
    })
    const snapshot = loadSnapshot('expenses', currentUid) || []
    const optimistic = {
      id: tempId,
      date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      dateObj: data.date ? new Date(data.date) : new Date(),
      forWhom: data.forWhom || 'Self',
      category: data.category || '',
      details: data.details || '',
      amount: parseFloat(data.amount) || 0,
      paymentMode: data.paymentMode || 'Cash',
      remarks: data.remarks || '',
      fileName: data.fileName || '',
      mimeType: data.mimeType || '',
      hasAttachment: false,
      hasChunkedAttachment: false,
      _pending: true,
    }
    snapshot.unshift(optimistic)
    saveSnapshot('expenses', snapshot, currentUid)
    _memExpenseCacheMap.set(currentUid, snapshot)
    _memExpenseCacheTimeMap.set(currentUid, Date.now())
    return { success: true, id: tempId, offline: true }
  }

  if (!navigator.onLine) {
    return saveOffline()
  }

  try {
    const docRef = await Promise.race([
      addDoc(collection(db, COL), fsData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 2500))
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

export async function updateExpense(id, data) {
  const ref = doc(db, COL, id)
  const fsData = toFirestore(data)
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('expenses', currentUid)
  invalidateExpenseInMemoryCache(currentUid)
  delete fsData.fileData

  const saveOfflineUpdate = () => {
    addPending({ type: 'update', collection: COL, id, data })
    const snapshot = loadSnapshot('expenses', currentUid) || []
    const idx = snapshot.findIndex((e) => e.id === id)
    if (idx !== -1) {
      snapshot[idx] = { ...snapshot[idx], ...data, _pending: true }
      saveSnapshot('expenses', snapshot, currentUid)
      _memExpenseCacheMap.set(currentUid, snapshot)
      _memExpenseCacheTimeMap.set(currentUid, Date.now())
    }
    return { success: true, id, offline: true }
  }

  if (!navigator.onLine) {
    return saveOfflineUpdate()
  }

  try {
    await Promise.race([
      updateDoc(ref, fsData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 2500))
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

function unpackExpenseDoc(docSnap) {
  const data = docSnap.data()
  if (data.isBatch && Array.isArray(data.items)) {
    return data.items.map((item, idx) => {
      const ts = item.date ? new Date(item.date) : new Date()
      return {
        id: item.id || `${docSnap.id}_idx_${idx}`,
        parentDocId: docSnap.id,
        date: ts.toISOString(),
        dateObj: ts,
        forWhom: item.forWhom || 'Self',
        category: item.category || '',
        details: item.details || '',
        amount: parseFloat(item.amount) || 0,
        paymentMode: item.paymentMode || 'Cash',
        remarks: item.remarks || '',
        fileName: item.fileName || '',
        mimeType: item.mimeType || '',
        hasAttachment: false,
        hasChunkedAttachment: false,
        fileData: null,
        receipt: '',
      }
    })
  }
  return [fromFirestore(docSnap)]
}

export async function deleteExpense(id, parentDocId = null) {
  const currentUid = auth.currentUser?.uid || ''
  invalidateSnapshot('expenses', currentUid)
  invalidateExpenseInMemoryCache(currentUid)

  const saveOfflineDelete = () => {
    addPending({ type: 'delete', collection: COL, id })
    const snapshot = loadSnapshot('expenses', currentUid) || []
    const filtered = snapshot.filter((e) => e.id !== id)
    saveSnapshot('expenses', filtered, currentUid)
    _memExpenseCacheMap.set(currentUid, filtered)
    _memExpenseCacheTimeMap.set(currentUid, Date.now())
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
      console.warn('[expenses] Batch item delete fallback:', err?.message)
    }
  }

  try {
    await Promise.race([
      deleteDoc(doc(db, COL, id)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 2500))
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

export async function getRecentExpenses(n = 20) {
  const all = await getAllExpenses()
  return all.slice(0, n)
}

export async function getAllExpenses(forceRefresh = false) {
  const currentUid = auth.currentUser?.uid || ''
  if (!currentUid) return []

  // 1. In-memory runtime cache (0 Firestore reads)
  const memTime = _memExpenseCacheTimeMap.get(currentUid) || 0
  if (!forceRefresh && _memExpenseCacheMap.has(currentUid) && (Date.now() - memTime) < EXPENSE_CACHE_TTL) {
    return _memExpenseCacheMap.get(currentUid)
  }

  // 2. Check if offline or local snapshot is fresh (15 min TTL)
  if (!navigator.onLine || (!forceRefresh && isCacheFresh('expenses', currentUid))) {
    const cached = loadSnapshot('expenses', currentUid)
    if (cached && cached.length > 0) {
      const sorted = cached.sort((a, b) => b.dateObj - a.dateObj)
      _memExpenseCacheMap.set(currentUid, sorted)
      _memExpenseCacheTimeMap.set(currentUid, Date.now())
      return sorted
    }
  }

  try {
    // Fetch user-scoped expenses with 2.5s network timeout
    const qScoped = query(collection(db, COL), where('userId', '==', currentUid))
    const snapScoped = await Promise.race([
      getDocs(qScoped),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_unavailable')), 2500))
    ])

    let items = []
    snapScoped.docs.forEach((docSnap) => {
      items.push(...unpackExpenseDoc(docSnap))
    })

    const sorted = items.sort((a, b) => b.dateObj - a.dateObj)
    saveSnapshot('expenses', sorted, currentUid)
    _memExpenseCacheMap.set(currentUid, sorted)
    _memExpenseCacheTimeMap.set(currentUid, Date.now())
    return sorted
  } catch (err) {
    console.warn('Expenses fetch failed/offline, using local cache:', err?.message)
    const cached = loadSnapshot('expenses', currentUid)
    if (cached) return cached.sort((a, b) => new Date(b.date) - new Date(a.date))
    return []
  }
}

/**
 * Save Expenses as a single Batched Array Document (1 Write per 300 records!)
 * @param {string} currentUid
 * @param {Array<object>} itemsArray
 * @returns {Promise<{ success: boolean, docCount: number }>}
 */
export async function saveExpensesBatch(currentUid, itemsArray = []) {
  if (!currentUid) throw new Error('User not authenticated')
  if (!Array.isArray(itemsArray) || itemsArray.length === 0) return { success: true, docCount: 0 }

  invalidateSnapshot('expenses', currentUid)
  invalidateExpenseInMemoryCache(currentUid)

  const CHUNK_SIZE = 300
  let docCount = 0

  for (let i = 0; i < itemsArray.length; i += CHUNK_SIZE) {
    const chunk = itemsArray.slice(i, i + CHUNK_SIZE)
    const formattedItems = chunk.map((item, idx) => {
      const ts = item.date ? new Date(item.date) : new Date()
      return {
        id: item.id || `exp_${Date.now()}_${i + idx}_${Math.floor(Math.random() * 1000)}`,
        date: ts.toISOString(),
        forWhom: item.forWhom || 'Self',
        category: item.category || '',
        details: item.details || '',
        amount: parseFloat(item.amount) || 0,
        paymentMode: item.paymentMode || 'Cash',
        remarks: item.remarks || '',
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

export async function getExpenseAttachment(id) {
  return getAttachment(COL, id)
}

export function computeExpenseStatsLocally(all) {
  const now = new Date()
  const currM = now.getMonth()
  const currY = now.getFullYear()
  const currD = now.getDate()

  let today = 0, month = 0, total = 0
  for (const e of all) {
    const amt = parseFloat(e.amount) || 0
    const d = e.dateObj || new Date(e.date)
    total += amt
    if (d.getFullYear() === currY && d.getMonth() === currM) {
      month += amt
      if (d.getDate() === currD) today += amt
    }
  }

  return { today, month, total }
}

export async function getExpenseStats() {
  const all = await getAllExpenses()
  return computeExpenseStatsLocally(all)
}

export function computeSuggestions(expenses) {
  const freqMap = {}
  const forWhomSet = new Set()
  const categorySet = new Set()
  const detailsSet = new Set()

  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i]
    if (e.forWhom) forWhomSet.add(e.forWhom)
    if (e.category) categorySet.add(e.category)
    if (e.details) detailsSet.add(e.details)

    if (e.amount > 0 && e.category && e.details) {
      const key = [e.forWhom || 'Self', e.category, e.details].join('||')
      if (!freqMap[key]) {
        freqMap[key] = {
          count: 0,
          lastSeenIndex: i,
          data: {
            whom: (e.forWhom || 'Self').trim(),
            category: e.category.trim(),
            details: e.details.trim(),
            amount: e.amount,
            mode: e.paymentMode || 'Cash',
            label: e.details.trim(),
          },
        }
      }
      freqMap[key].count++
    }
  }

  const sorted = Object.values(freqMap).sort((a, b) => {
    if (a.lastSeenIndex !== b.lastSeenIndex) return a.lastSeenIndex - b.lastSeenIndex
    return b.count - a.count
  })

  return {
    forWhom: [...forWhomSet],
    categories: [...categorySet],
    details: [...detailsSet],
    quickFills: sorted.slice(0, 15).map((item) => item.data),
  }
}
