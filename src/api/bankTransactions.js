/**
 * bankTransactions.js — Centralized API for Bank History data management
 * Handles Firestore queries, local caching, date parsing, and deletion.
 */

import { db } from '../firebase'
import { collection, getDocs, getDocsFromCache, query, where, deleteDoc, doc } from 'firebase/firestore'
import { saveSnapshot, loadSnapshot } from './localCache'

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
 * This ensures previously-loaded data is still accessible when Firestore rules block server reads.
 */
async function safeGetDocs(q) {
  try {
    return await getDocs(q)
  } catch (err) {
    // If server query fails (permissions, network), try local Firestore IndexedDB cache
    try {
      return await getDocsFromCache(q)
    } catch (cacheErr) {
      return null
    }
  }
}

function toRecord(data) {
  const dateObj = parseSafeDate(data.date)
  const debit = parseFloat(data.debit || 0)
  const credit = parseFloat(data.credit || 0)
  const balance = parseFloat(data.balance || 0)
  const bank = data.bank || 'Bank'
  const desc = data.description || data.narration || ''

  return {
    id: data.id,
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

/**
 * Fetch bank transactions from Firestore with multi-layer fallback & user-scoping logic.
 * Flow: server query → Firestore IndexedDB cache → localStorage cache
 */
export async function fetchBankTransactionsFromFirestore(currentUid = '', isAdmin = false) {
  const allDocsMap = new Map()

  if (!currentUid) {
    const cached = loadSnapshot('bank') || loadSnapshot('bank', '')
    return (cached || []).map((r) => toRecord({ ...r, id: r.id || 'cached' }))
  }

  // 1. User-scoped query by 'userId' field
  const snapScoped = await safeGetDocs(
    query(collection(db, 'bankTransactions'), where('userId', '==', currentUid))
  )
  if (snapScoped) {
    snapScoped.docs.forEach((d) => {
      allDocsMap.set(d.id, { id: d.id, ...d.data() })
    })
  }

  // 2. User-scoped query by 'uid' field (legacy documents)
  const snapUid = await safeGetDocs(
    query(collection(db, 'bankTransactions'), where('uid', '==', currentUid))
  )
  if (snapUid) {
    snapUid.docs.forEach((d) => {
      if (!allDocsMap.has(d.id)) {
        allDocsMap.set(d.id, { id: d.id, ...d.data() })
      }
    })
  }

  // 3. Admin or general fallback: full collection (tries server, then IndexedDB cache)
  if (isAdmin || allDocsMap.size === 0) {
    const snapAll = await safeGetDocs(
      query(collection(db, 'bankTransactions'))
    )
    if (snapAll) {
      snapAll.docs.forEach((d) => {
        const data = d.data()
        const docUid = data.userId || data.uid || ''
        if (isAdmin || !docUid || docUid === currentUid) {
          if (!allDocsMap.has(d.id)) {
            allDocsMap.set(d.id, { id: d.id, ...data })
          }
        }
      })
    }
  }

  let records = Array.from(allDocsMap.values()).map(toRecord).sort((a, b) => b.date - a.date)

  // 4. Final fallback: localStorage cache
  if (records.length === 0) {
    const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
    if (cached && cached.length > 0) {
      records = cached.map((r) => toRecord({ ...r, id: r.id || 'cached' })).sort((a, b) => b.date - a.date)
    }
  } else {
    saveSnapshot('bank', records, currentUid)
  }

  return records
}

/**
 * Delete a single bank transaction from Firestore
 */
export async function deleteBankTransaction(id) {
  if (!id) return
  await deleteDoc(doc(db, 'bankTransactions', id))
}
