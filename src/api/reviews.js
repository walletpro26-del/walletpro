/**
 * reviews.js
 * Handles App Rating & Feedback submission and retrieval via Firestore & local cache.
 */

import { db } from '../firebase'
import { doc, setDoc, getDoc, getDocs, collection, query, orderBy, Timestamp } from 'firebase/firestore'

const REVIEWS_COLLECTION = 'appReviews'

/**
 * Submit or update a user rating & feedback review
 */
export async function submitReview({ name, mobile, email, rating, comment, userId }) {
  if (!name || !name.trim()) throw new Error('Please enter your name.')
  if (!mobile || !mobile.trim()) throw new Error('Please enter your mobile number.')
  if (!rating || rating < 1 || rating > 5) throw new Error('Please select a star rating between 1 and 5.')

  const cleanEmail = (email || '').toLowerCase().trim()
  const docId = userId || cleanEmail.replace(/[^a-zA-Z0-9]/g, '_') || 'anon_' + Date.now()

  const reviewData = {
    docId,
    name: name.trim(),
    mobile: mobile.trim(),
    email: cleanEmail,
    rating: Number(rating),
    comment: comment ? comment.trim() : '',
    userId: userId || '',
    updatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  }

  // 1. Primary write to appReviews collection
  try {
    const docRef = doc(db, REVIEWS_COLLECTION, docId)
    await setDoc(docRef, reviewData, { merge: true })
  } catch (err) {
    console.warn('[reviews] Firestore appReviews write warning:', err?.message)
  }

  // 2. Secondary write to userProfiles collection (guaranteed allowed collection)
  if (docId || cleanEmail) {
    try {
      const userDocId = userId || cleanEmail.replace(/[.@]/g, '_')
      const profileRef = doc(db, 'userProfiles', userDocId)
      await setDoc(profileRef, {
        rating: Number(rating),
        reviewComment: comment ? comment.trim() : '',
        reviewName: name.trim(),
        reviewMobile: mobile.trim(),
        reviewUpdatedAt: Timestamp.now(),
      }, { merge: true })
    } catch (e) {
      console.warn('[reviews] Firestore userProfiles review write warning:', e?.message)
    }
  }

  // 3. Save in local storage cache for instant offline rendering
  localStorage.setItem('wv_user_review', JSON.stringify({
    ...reviewData,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }))

  return reviewData
}

/**
 * Get all user reviews from Firestore (with local fallback)
 */
export async function getAllReviews() {
  let reviews = []

  // Fetch from appReviews collection without unindexed orderBy constraint
  try {
    const snap = await getDocs(collection(db, REVIEWS_COLLECTION))
    snap.docs.forEach((d) => {
      const data = d.data()
      if (!data) return
      const dateObj = data.updatedAt?.toDate?.() || new Date(data.updatedAt || Date.now())
      reviews.push({
        id: d.id,
        name: data.name || 'Anonymous User',
        mobile: data.mobile || '',
        email: data.email || '',
        rating: Number(data.rating || 5),
        comment: data.comment || '',
        date: dateObj,
      })
    })
  } catch (err) {
    console.warn('[reviews] Fetch appReviews warning:', err?.message)
  }

  // Fetch reviews embedded in userProfiles collection as backup
  try {
    const profSnap = await getDocs(collection(db, 'userProfiles'))
    profSnap.docs.forEach((d) => {
      const data = d.data()
      if (data && data.rating && !reviews.some((r) => r.email === (data.email || '').toLowerCase())) {
        const dateObj = data.reviewUpdatedAt?.toDate?.() || new Date()
        reviews.push({
          id: 'prof_' + d.id,
          name: data.reviewName || data.name || 'User',
          mobile: data.reviewMobile || '',
          email: data.email || '',
          rating: Number(data.rating),
          comment: data.reviewComment || '',
          date: dateObj,
        })
      }
    })
  } catch (e) {}

  // Sort by date descending in JavaScript memory
  reviews.sort((a, b) => (b.date?.getTime ? b.date.getTime() : 0) - (a.date?.getTime ? a.date.getTime() : 0))

  // Include local review if not present
  const localStr = localStorage.getItem('wv_user_review')
  if (localStr) {
    try {
      const localRev = JSON.parse(localStr)
      const exists = reviews.some((r) => r.id === localRev.docId || (localRev.email && r.email === localRev.email))
      if (!exists) {
        reviews.unshift({
          id: localRev.docId || 'local_rev',
          name: localRev.name,
          mobile: localRev.mobile,
          email: localRev.email,
          rating: localRev.rating,
          comment: localRev.comment,
          date: new Date(localRev.updatedAt),
        })
      }
    } catch (e) {}
  }

  return reviews
}

/**
 * Get current user's existing review
 */
export async function getUserReview(userId, email) {
  const localStr = localStorage.getItem('wv_user_review')
  if (localStr) {
    try {
      return JSON.parse(localStr)
    } catch (e) {}
  }

  if (!userId && !email) return null

  try {
    const docId = userId || email?.replace(/[^a-zA-Z0-9]/g, '_')
    const docRef = doc(db, REVIEWS_COLLECTION, docId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return snap.data()
    }
  } catch (err) {
    // quiet catch
  }
  return null
}
