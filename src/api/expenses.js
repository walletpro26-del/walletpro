import { db, auth } from '../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, limit, where, Timestamp,
} from 'firebase/firestore'
import { saveAttachment, getAttachment, deleteAttachmentChunks } from './attachments'

const COL = 'expenses'

function toFirestore(data) {
  const ts = data.date ? new Date(data.date) : new Date()
  return {
    timestamp: Timestamp.fromDate(ts),
    userId: auth.currentUser?.uid || '',
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
    amount: d.amount || 0,
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

export async function addExpense(data) {
  const fsData = toFirestore(data)
  const docRef = await addDoc(collection(db, COL), fsData)
  if (data.fileData) {
    await saveAttachment(COL, docRef.id, data.fileData)
  }
  return { success: true, id: docRef.id }
}

export async function updateExpense(id, data) {
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

export async function deleteExpense(id) {
  await deleteAttachmentChunks(COL, id)
  await deleteDoc(doc(db, COL, id))
  return { success: true }
}

export async function getRecentExpenses(n = 20) {
  const all = await getAllExpenses()
  return all.slice(0, n)
}

export async function getAllExpenses() {
  const currentUid = auth.currentUser?.uid || ''
  if (!currentUid) return []

  try {
    // 1. Fetch scoped expenses
    const qScoped = query(collection(db, COL), where('userId', '==', currentUid))
    const snapScoped = await getDocs(qScoped)
    let items = snapScoped.docs.map(fromFirestore)

    // 2. Fetch all to find legacy items (without userId) to migrate
    const qAll = query(collection(db, COL))
    const snapAll = await getDocs(qAll)
    const legacyDocs = snapAll.docs.filter((d) => !d.data().userId)

    if (legacyDocs.length > 0) {
      legacyDocs.forEach((d) => {
        const ref = doc(db, COL, d.id)
        updateDoc(ref, { userId: currentUid }).catch((err) => console.error('Migration error:', err))
        items.push(fromFirestore(d))
      })
    }

    return items.sort((a, b) => b.dateObj - a.dateObj)
  } catch (err) {
    console.error('Error fetching expenses:', err)
    return []
  }
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
    const d = e.dateObj
    total += e.amount
    if (d.getFullYear() === currY && d.getMonth() === currM) {
      month += e.amount
      if (d.getDate() === currD) today += e.amount
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
