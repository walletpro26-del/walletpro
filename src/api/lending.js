import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, Timestamp,
} from 'firebase/firestore'
import { saveAttachment, getAttachment, deleteAttachmentChunks } from './attachments'

const COL = 'lending'

function toFirestore(data) {
  const ts = data.date ? new Date(data.date) : new Date()
  return {
    timestamp: Timestamp.fromDate(ts),
    type: data.type || data.lendType || 'Lend',
    person: data.person || '',
    amount: Math.abs(parseFloat(data.amount)) || 0,
    remarks: data.remarks || data.details || '',
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
  const docRef = await addDoc(collection(db, COL), fsData)
  if (data.fileData) {
    await saveAttachment(COL, docRef.id, data.fileData)
  }
  return { success: true, id: docRef.id }
}

export async function updateLending(id, data) {
  const ref = doc(db, COL, id)
  const fsData = toFirestore(data)
  delete fsData.fileData
  await updateDoc(ref, fsData)
  if (data.fileData) {
    await deleteAttachmentChunks(COL, id)
    await saveAttachment(COL, id, data.fileData)
  }
  return { success: true }
}

export async function deleteLending(id) {
  await deleteAttachmentChunks(COL, id)
  await deleteDoc(doc(db, COL, id))
  return { success: true }
}

export async function getRecentLending(n = 20) {
  const q = query(collection(db, COL), orderBy('timestamp', 'desc'), limit(n))
  const snap = await getDocs(q)
  return snap.docs.map(fromFirestore)
}

export async function getAllLending() {
  const q = query(collection(db, COL), orderBy('timestamp', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(fromFirestore)
}

export async function getLendingAttachment(id) {
  return getAttachment(COL, id)
}

export async function getLendingStats() {
  const all = await getAllLending()
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
