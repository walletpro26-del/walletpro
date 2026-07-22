import { db, auth } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, Timestamp, where,
} from 'firebase/firestore'
import { saveAttachment, getAttachment, deleteAttachmentChunks } from './attachments'
import { saveSnapshot, loadSnapshot, addPending } from './localCache'

const COL = 'lending'

function toFirestore(data) {
  const ts = data.date ? new Date(data.date) : new Date()
  return {
    timestamp: Timestamp.fromDate(ts),
    userId: auth.currentUser?.uid || '',
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
    amount: d.amount || 0,
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

export async function addLending(data) {
  const fsData = toFirestore(data)
  try {
    const docRef = await addDoc(collection(db, COL), fsData)
    if (data.fileData) {
      await saveAttachment(COL, docRef.id, data.fileData)
    }
    return { success: true, id: docRef.id }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable') {
      const tempId = addPending({
        type: 'add',
        collection: COL,
        data: { ...data, _offline: true },
      })
      // Optimistically update snapshot
      const snapshot = loadSnapshot('lending') || []
      const norm = normalizeLendingType(data.type || 'Lend')
      let label = data.type || 'Loan Given'
      if (norm === 'LEND') label = 'Loan Given'
      else if (norm === 'BORROW') label = 'Borrowed'
      else if (norm === 'THEY_RETURN') label = 'Received Return'
      else if (norm === 'I_RETURN') label = 'I Returned'
      else if (norm === 'FORGIVE') label = 'Forgiven'
      const optimistic = {
        id: tempId,
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        dateObj: data.date ? new Date(data.date) : new Date(),
        type: data.type || 'Lend',
        label,
        person: data.person || '',
        amount: Math.abs(parseFloat(data.amount)) || 0,
        remarks: data.remarks || '',
        mobileNo: data.mobileNo || data.phone || '',
        email: data.email || '',
        fileName: '',
        mimeType: '',
        hasAttachment: false,
        hasChunkedAttachment: false,
        isLend: true,
        sheet: 'lending',
        _pending: true,
      }
      snapshot.unshift(optimistic)
      saveSnapshot('lending', snapshot)
      return { success: true, id: tempId, offline: true }
    }
    throw err
  }
}

export async function updateLending(id, data) {
  const ref = doc(db, COL, id)
  const fsData = toFirestore(data)
  delete fsData.fileData
  try {
    await updateDoc(ref, fsData)
    if (data.fileData) {
      await deleteAttachmentChunks(COL, id)
      await saveAttachment(COL, id, data.fileData)
    }
    return { success: true }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable') {
      addPending({ type: 'update', collection: COL, id, data })
      return { success: true, offline: true }
    }
    throw err
  }
}

export async function deleteLending(id) {
  try {
    await deleteAttachmentChunks(COL, id)
    await deleteDoc(doc(db, COL, id))
    return { success: true }
  } catch (err) {
    if (!navigator.onLine || err?.code === 'unavailable') {
      addPending({ type: 'delete', collection: COL, id })
      return { success: true, offline: true }
    }
    throw err
  }
}

export async function getRecentLending(n = 20) {
  const all = await getAllLending()
  return all.slice(0, n)
}

export async function getAllLending() {
  const currentUid = auth.currentUser?.uid || ''
  if (!currentUid) return []

  try {
    // Fetch user-scoped lending records
    const qScoped = query(collection(db, COL), where('userId', '==', currentUid))
    const snapScoped = await getDocs(qScoped)
    let items = snapScoped.docs.map(fromFirestore)

    const sorted = items.sort((a, b) => b.dateObj - a.dateObj)
    saveSnapshot('lending', sorted)
    return sorted
  } catch (err) {
    console.warn('Lending fetch failed, using local cache:', err?.message)
    const cached = loadSnapshot('lending')
    if (cached) return cached.sort((a, b) => new Date(b.date) - new Date(a.date))
    return []
  }
}

export async function getLendingAttachment(id) {
  return getAttachment(COL, id)
}

export function computeLendingStatsLocally(all) {
  let receivable = 0, payable = 0

  for (const t of all) {
    const norm = normalizeLendingType(t.type)
    if (norm === 'LEND') receivable += t.amount
    else if (norm === 'BORROW') payable += t.amount
    else if (norm === 'THEY_RETURN') receivable -= t.amount
    else if (norm === 'I_RETURN') payable -= t.amount
    else if (norm === 'FORGIVE') receivable -= t.amount
  }

  return { receivable, payable, net: receivable - payable }
}

export async function getLendingStats() {
  const all = await getAllLending()
  return computeLendingStatsLocally(all)
}
