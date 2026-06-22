import { db } from '../firebase'
import {
  doc, updateDoc, collection, getDocs, setDoc, deleteDoc, getDoc,
  writeBatch,
} from 'firebase/firestore'

// Firestore doc max ~1 MiB. We keep inline base64 under 700KB to leave room.
const MAX_INLINE_BYTES = 700 * 1024
const CHUNK_SIZE = 500 * 1024

/**
 * Compress an image file client-side before base64-encoding.
 * Returns a data URL (includes the data:mime;base64, prefix).
 */
export function compressImage(file, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve, reject) => {
    // If PDF, just return raw base64 without compression
    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w)
          w = maxWidth
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Save base64 attachment. If small enough, store inline in the document.
 * Otherwise, split into chunks in a subcollection.
 */
export async function saveAttachment(collectionName, docId, base64Data) {
  if (!base64Data) return

  const ref = doc(db, collectionName, docId)

  if (base64Data.length < MAX_INLINE_BYTES) {
    // Store inline
    await updateDoc(ref, {
      fileData: base64Data,
      hasAttachment: true,
      hasChunkedAttachment: false,
    })
  } else {
    // Split into chunks
    const chunks = []
    for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
      chunks.push(base64Data.slice(i, i + CHUNK_SIZE))
    }

    const batch = writeBatch(db)
    chunks.forEach((chunk, index) => {
      const chunkRef = doc(collection(ref, 'attachmentChunks'), `chunk_${String(index).padStart(3, '0')}`)
      batch.set(chunkRef, { data: chunk, index })
    })
    await batch.commit()

    await updateDoc(ref, {
      fileData: null,
      hasAttachment: true,
      hasChunkedAttachment: true,
      chunkCount: chunks.length,
    })
  }
}

/**
 * Retrieve a full base64 attachment (reassembles chunks if needed).
 */
export async function getAttachment(collectionName, docId) {
  const ref = doc(db, collectionName, docId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null

  const data = snap.data()

  // Inline attachment
  if (data.fileData) return data.fileData

  // Chunked attachment
  if (data.hasChunkedAttachment) {
    const chunksSnap = await getDocs(collection(ref, 'attachmentChunks'))
    const sorted = chunksSnap.docs
      .map((d) => ({ index: d.data().index, data: d.data().data }))
      .sort((a, b) => a.index - b.index)
    return sorted.map((c) => c.data).join('')
  }

  return null
}

/**
 * Delete attachment chunks subcollection (cleanup before re-upload or delete).
 */
export async function deleteAttachmentChunks(collectionName, docId) {
  const ref = doc(db, collectionName, docId)
  try {
    const chunksSnap = await getDocs(collection(ref, 'attachmentChunks'))
    if (!chunksSnap.empty) {
      const batch = writeBatch(db)
      chunksSnap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    // Clear inline data too
    await updateDoc(ref, {
      fileData: null,
      hasAttachment: false,
      hasChunkedAttachment: false,
      chunkCount: 0,
    })
  } catch (e) {
    // Document may already be deleted
  }
}
