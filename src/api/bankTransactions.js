/**
 * bankTransactions.js — Centralized API for Bank History data management
 * Handles Firestore queries, local caching, date parsing, and deletion.
 */

import { db } from '../firebase'
import { collection, getDocs, getDocsFromCache, getDoc, getDocFromCache, query, where, deleteDoc, doc, addDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { saveSnapshot, loadSnapshot, isCacheFresh, invalidateSnapshot, registerInvalidationListener } from './localCache'

export function parseSafeDate(d) {
  if (!d) return new Date()
  if (d instanceof Date) return isNaN(d.getTime()) ? new Date() : d
  if (typeof d.toDate === 'function') return d.toDate()
  if (typeof d === 'object') {
    if (typeof d.seconds === 'number') return new Date(d.seconds * 1000)
    if (typeof d._seconds === 'number') return new Date(d._seconds * 1000)
  }
  if (typeof d === 'number') return new Date(d)
  if (typeof d === 'string') {
    const iso = new Date(d.replace(' ', 'T'))
    if (!isNaN(iso.getTime())) return iso
  }
  const fallback = new Date(d)
  return isNaN(fallback.getTime()) ? new Date() : fallback
}

/**
 * Try getDocs from server first; on permission error, fall back to getDocsFromCache (IndexedDB).
 */
async function safeGetDocs(q) {
  try {
    return await getDocs(q)
  } catch (err) {
    try {
      return await getDocsFromCache(q)
    } catch (cacheErr) {
      return null
    }
  }
}

/**
 * Try getDoc for single document reference from server first; on error, fall back to getDocFromCache.
 */
async function safeGetDoc(docRef) {
  try {
    return await getDoc(docRef)
  } catch (err) {
    try {
      return await getDocFromCache(docRef)
    } catch (cacheErr) {
      return null
    }
  }
}

function toRecord(data, parentDocId = null) {
  const dateObj = parseSafeDate(data.date)
  const debit = parseFloat(data.debit || 0)
  const credit = parseFloat(data.credit || 0)
  const balance = parseFloat(data.balance || 0)
  const bank = data.bank || 'Bank'
  const desc = data.description || data.narration || ''

  return {
    id: data.id,
    parentDocId: parentDocId || data.parentDocId || null,
    bank,
    date: dateObj,
    dateObj,
    description: desc,
    debit,
    credit,
    balance,
    userId: data.userId || data.uid || '',
    searchStr: `${dateObj.toLocaleDateString('en-IN')} ${desc} ${bank} ${debit} ${credit} ${balance}`.toLowerCase(),
  }
}

// In-memory runtime cache to eliminate repeat Firestore queries across component renders
const _memBankCacheMap = new Map()
const _memBankCacheTimeMap = new Map()
const BANK_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export function invalidateBankInMemoryCache(uid = '') {
  if (uid) {
    _memBankCacheMap.delete(uid)
    _memBankCacheTimeMap.delete(uid)
  } else {
    _memBankCacheMap.clear()
    _memBankCacheTimeMap.clear()
  }
}

registerInvalidationListener((type, uid) => {
  if (!type || type === 'bank') {
    invalidateBankInMemoryCache(uid)
  }
})

function unpackFirestoreDocs(docSnapshots, currentUid) {
  const records = []
  docSnapshots.forEach((d) => {
    const data = d.data()
    const docUid = data.userId || data.uid || currentUid
    // Check if doc is a batched statement document holding array of items
    if (data.isBatch && Array.isArray(data.items)) {
      data.items.forEach((item, idx) => {
        records.push(toRecord({
          ...item,
          id: item.id || `${d.id}_idx_${idx}`,
          userId: docUid,
          bank: item.bank || data.bank || 'Bank',
        }, d.id))
      })
    } else {
      records.push(toRecord({ id: d.id, ...data }, null))
    }
  })
  return records
}

/**
 * Fetch bank transactions from Firestore with multi-layer fallback & user-scoping logic.
 * Supports single docs and batched statement documents.
 */
export async function fetchBankTransactionsFromFirestore(currentUid = '', isAdmin = false, forceRefresh = false) {
  if (!currentUid) {
    const cached = loadSnapshot('bank') || loadSnapshot('bank', '')
    return (cached || []).map((r) => toRecord({ ...r, id: r.id || 'cached' }))
  }

  // 1. Fast in-memory session cache (0 Firestore reads)
  const memTime = _memBankCacheTimeMap.get(currentUid) || 0
  if (!forceRefresh && _memBankCacheMap.has(currentUid) && (Date.now() - memTime) < BANK_CACHE_TTL) {
    return _memBankCacheMap.get(currentUid)
  }

  // 2. Check if localStorage snapshot is fresh (15 min TTL)
  if (!forceRefresh && isCacheFresh('bank', currentUid)) {
    const cached = loadSnapshot('bank', currentUid)
    if (cached && cached.length > 0) {
      const records = cached.map((r) => toRecord({ ...r, id: r.id || 'cached' })).sort((a, b) => b.date - a.date)
      _memBankCacheMap.set(currentUid, records)
      _memBankCacheTimeMap.set(currentUid, Date.now())
      return records
    }
  }

  let rawDocs = []

  // 3. User-scoped query by 'userId' field
  const snapScoped = await safeGetDocs(
    query(collection(db, 'bankTransactions'), where('userId', '==', currentUid))
  )
  if (snapScoped && !snapScoped.empty) {
    rawDocs = snapScoped.docs
  } else {
    // 4. Fallback query by legacy 'uid' field
    const snapUid = await safeGetDocs(
      query(collection(db, 'bankTransactions'), where('uid', '==', currentUid))
    )
    if (snapUid && !snapUid.empty) {
      rawDocs = snapUid.docs
    } else if (isAdmin) {
      // 5. Admin fallback
      const snapAll = await safeGetDocs(query(collection(db, 'bankTransactions')))
      if (snapAll) rawDocs = snapAll.docs
    }
  }

  let records = unpackFirestoreDocs(rawDocs, currentUid).sort((a, b) => b.date - a.date)

  // 6. Final fallback: localStorage cache
  if (records.length === 0) {
    const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
    if (cached && cached.length > 0) {
      records = cached.map((r) => toRecord({ ...r, id: r.id || 'cached' })).sort((a, b) => b.date - a.date)
    }
  } else {
    saveSnapshot('bank', records, currentUid)
  }

  _memBankCacheMap.set(currentUid, records)
  _memBankCacheTimeMap.set(currentUid, Date.now())

  return records
}

/**
 * Save bank transactions as a single Batched Array Document (1 Write per 300 records!)
 * @param {string} currentUid
 * @param {Array<object>} itemsArray
 * @param {string} defaultBank
 * @returns {Promise<{ success: boolean, docCount: number }>}
 */
export async function saveBankTransactionsBatch(currentUid, itemsArray = [], defaultBank = 'Bank') {
  if (!currentUid) throw new Error('User not authenticated')
  if (!Array.isArray(itemsArray) || itemsArray.length === 0) return { success: true, docCount: 0 }

  invalidateSnapshot('bank', currentUid)
  invalidateBankInMemoryCache(currentUid)

  // Chunk items into batches of 300 to stay well under 1MB document limit
  const CHUNK_SIZE = 300
  let docCount = 0

  for (let i = 0; i < itemsArray.length; i += CHUNK_SIZE) {
    const chunk = itemsArray.slice(i, i + CHUNK_SIZE)
    const formattedItems = chunk.map((item, idx) => {
      const dateObj = parseSafeDate(item.date || item.dateObj)
      return {
        id: item.id || `bt_${Date.now()}_${i + idx}_${Math.floor(Math.random() * 1000)}`,
        date: dateObj.toISOString(),
        bank: item.bank || defaultBank,
        description: item.description || item.narration || '',
        debit: parseFloat(item.debit || 0),
        credit: parseFloat(item.credit || 0),
        balance: parseFloat(item.balance || 0),
      }
    })

    const payload = {
      userId: currentUid,
      uid: currentUid,
      bank: defaultBank,
      isBatch: true,
      count: formattedItems.length,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      items: formattedItems,
    }

    await addDoc(collection(db, 'bankTransactions'), payload)
    docCount++
  }

  return { success: true, docCount }
}

/**
 * Delete a single bank transaction from Firestore (supports single docs and batch sub-items)
 */
export async function deleteBankTransaction(id, parentDocId = null) {
  if (!id) return
  invalidateSnapshot('bank')
  invalidateBankInMemoryCache()

  if (parentDocId) {
    try {
      const ref = doc(db, 'bankTransactions', parentDocId)
      // Check if doc exists and filter out item from array
      const snap = await safeGetDoc(ref)
      if (snap && snap.exists()) {
        const data = snap.data()
        if (Array.isArray(data.items)) {
          const updatedItems = data.items.filter((item, idx) => {
            const itemId = item.id || `${parentDocId}_idx_${idx}`
            return itemId !== id && item.id !== id
          })
          if (updatedItems.length === 0) {
            await deleteDoc(ref)
          } else {
            await updateDoc(ref, { items: updatedItems, count: updatedItems.length, updatedAt: Timestamp.now() })
          }
          return
        }
      }
    } catch (err) {
      console.warn('[bankTransactions] Batch item delete fallback:', err?.message)
    }
  }

  await deleteDoc(doc(db, 'bankTransactions', id))
}

/**
 * Bulk delete bank transactions (handles single Firestore documents and batched sub-items).
 */
export async function deleteBankTransactionsBulk(recordsToDelete, currentUid = '') {
  if (!Array.isArray(recordsToDelete) || recordsToDelete.length === 0) return 0

  invalidateSnapshot('bank', currentUid)
  invalidateBankInMemoryCache(currentUid)

  const parentUpdatesMap = new Map()
  const singleDocIds = new Set()

  recordsToDelete.forEach((r) => {
    const parentId = r.parentDocId || (typeof r.id === 'string' && r.id.includes('_idx_') ? r.id.split('_idx_')[0] : null)
    if (parentId) {
      if (!parentUpdatesMap.has(parentId)) {
        parentUpdatesMap.set(parentId, new Set())
      }
      parentUpdatesMap.get(parentId).add(r.id)
    } else if (r.id) {
      singleDocIds.add(r.id)
    }
  })

  // 1. Delete single documents instantly using Firestore writeBatch (1 network roundtrip!)
  const singleIdsArray = Array.from(singleDocIds)
  const BATCH_LIMIT = 400
  for (let i = 0; i < singleIdsArray.length; i += BATCH_LIMIT) {
    const chunk = singleIdsArray.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    chunk.forEach((docId) => {
      batch.delete(doc(db, 'bankTransactions', docId))
    })
    await batch.commit().catch((err) => console.warn('[bankTransactions] Batch delete error:', err?.message))
  }

  // 2. Update batched array documents
  for (const [parentDocId, itemIdsToRemove] of parentUpdatesMap.entries()) {
    try {
      const ref = doc(db, 'bankTransactions', parentDocId)
      const snap = await safeGetDoc(ref)
      if (snap && snap.exists()) {
        const data = snap.data()
        if (Array.isArray(data.items)) {
          const updatedItems = data.items.filter((item, idx) => {
            const itemId = item.id || `${parentDocId}_idx_${idx}`
            return !itemIdsToRemove.has(itemId) && !itemIdsToRemove.has(item.id)
          })
          if (updatedItems.length === 0) {
            await deleteDoc(ref)
          } else {
            await updateDoc(ref, { items: updatedItems, count: updatedItems.length, updatedAt: Timestamp.now() })
          }
        }
      }
    } catch (err) {
      console.warn('[bankTransactions] Parent doc batch update error:', parentDocId, err?.message)
    }
  }

  return recordsToDelete.length
}
