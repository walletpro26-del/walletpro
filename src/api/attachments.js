import { db } from '../firebase'
import {
  doc, updateDoc, collection, getDocs, setDoc, deleteDoc, getDoc,
  writeBatch,
} from 'firebase/firestore'

// Restrict attachments (Image/PDF) to equal to or less than 130 KB (133,120 bytes)
export const MAX_ATTACHMENT_BYTES = 130 * 1024
const CHUNK_SIZE = 500 * 1024

/**
 * Get approximate byte length of a Data URL / base64 string
 */
export function getBase64ByteSize(dataUrl) {
  if (!dataUrl) return 0
  const base64 = dataUrl.split(',')[1] || dataUrl
  return Math.round((base64.length * 3) / 4)
}

/**
 * Compress an image file client-side before base64-encoding.
 * Restricts images and PDFs to <= 130 KB.
 * Returns a promise resolving to data URL.
 */
export function compressImage(file, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const limitKB = 130
    const limitBytes = MAX_ATTACHMENT_BYTES

    // If PDF, check size strictly before reading
    if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
      if (file.size > limitBytes) {
        const sizeKB = (file.size / 1024).toFixed(1)
        reject(new Error(`PDF size (${sizeKB} KB) exceeds the 130 KB limit. Please upload a smaller PDF.`))
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target.result
        const byteSize = getBase64ByteSize(result)
        if (byteSize > limitBytes) {
          const sizeKB = (byteSize / 1024).toFixed(1)
          reject(new Error(`PDF attachment (${sizeKB} KB) exceeds the 130 KB limit.`))
        } else {
          resolve(result)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read PDF file.'))
      reader.readAsDataURL(file)
      return
    }

    // For images, attempt multi-pass compression to fit within 130 KB
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // Pass 1: Standard compression (800px max, quality 0.65)
        let dataUrl = compressCanvas(img, maxWidth, quality)
        let byteSize = getBase64ByteSize(dataUrl)

        // Pass 2: Medium compression (600px max, quality 0.45)
        if (byteSize > limitBytes) {
          dataUrl = compressCanvas(img, 600, 0.45)
          byteSize = getBase64ByteSize(dataUrl)
        }

        // Pass 3: Maximum compression (400px max, quality 0.30)
        if (byteSize > limitBytes) {
          dataUrl = compressCanvas(img, 400, 0.30)
          byteSize = getBase64ByteSize(dataUrl)
        }

        if (byteSize > limitBytes) {
          const sizeKB = (byteSize / 1024).toFixed(1)
          reject(new Error(`Image size (${sizeKB} KB after compression) exceeds the 130 KB limit. Please select a smaller file.`))
        } else {
          resolve(dataUrl)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image for compression.'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

function compressCanvas(img, maxWidth, quality) {
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
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Save base64 attachment. If small enough, store inline in the document.
 * Otherwise, split into chunks in a subcollection.
 */
export async function saveAttachment(collectionName, docId, base64Data) {
  if (!base64Data) return

  const ref = doc(db, collectionName, docId)

  if (base64Data.length < MAX_ATTACHMENT_BYTES) {
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
