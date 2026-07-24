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

  const docId = userId || email?.replace(/[^a-zA-Z0-9]/g, '_') || 'anon_' + Date.now()

  const reviewData = {
    docId,
    name: name.trim(),
    mobile: mobile.trim(),
    email: email ? email.trim() : '',
    rating: Number(rating),
    comment: comment ? comment.trim() : '',
    userId: userId || '',
    updatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  }

  try {
    const docRef = doc(db, REVIEWS_COLLECTION, docId)
    await setDoc(docRef, reviewData, { merge: true })

    // Save locally in cache
    localStorage.setItem('wv_user_review', JSON.stringify({
      ...reviewData,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }))

    return reviewData
  } catch (err) {
    // Fallback to local storage if offline or permissions issue
    localStorage.setItem('wv_user_review', JSON.stringify({
      ...reviewData,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }))
    return reviewData
  }
}

/**
 * Get all user reviews from Firestore (with local fallback)
 */
export async function getAllReviews() {
  try {
    const q = query(collection(db, REVIEWS_COLLECTION), orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)

    let reviews = snap.docs.map((d) => {
      const data = d.data()
      const dateObj = data.updatedAt?.toDate?.() || new Date(data.updatedAt)
      return {
        id: d.id,
        name: data.name || 'Anonymous User',
        mobile: data.mobile || '',
        email: data.email || '',
        rating: Number(data.rating || 5),
        comment: data.comment || '',
        date: dateObj,
      }
    })

    // Include local review if not present
    const localStr = localStorage.getItem('wv_user_review')
    if (localStr) {
      try {
        const localRev = JSON.parse(localStr)
        const exists = reviews.some((r) => r.id === localRev.docId || r.email === localRev.email)
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
      } catch (e) {
        // quiet catch
      }
    }

    // Default sample reviews if empty
    if (reviews.length === 0) {
      reviews = [
        {
          id: 'sample_1',
          name: 'Rahul Sharma',
          mobile: '9876543210',
          email: 'rahul.sharma@gmail.com',
          rating: 5,
          comment: 'Outstanding personal finance manager! PDF statement auto-parsing via Gemini AI saved me hours of manual data entry.',
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'sample_2',
          name: 'Anita Verma',
          mobile: '9812345678',
          email: 'anita.v@gmail.com',
          rating: 5,
          comment: 'The Lend/Borrow ledger and Bank History tracking are super smooth. 1-click CSV Undo import is a lifesaver!',
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      ]
    }

    return reviews
  } catch (err) {
    // Return sample/cached reviews on error
    const localStr = localStorage.getItem('wv_user_review')
    const list = []
    if (localStr) {
      try {
        const r = JSON.parse(localStr)
        list.push({
          id: r.docId || 'local_1',
          name: r.name,
          mobile: r.mobile,
          email: r.email,
          rating: r.rating,
          comment: r.comment,
          date: new Date(r.updatedAt),
        })
      } catch (e) {}
    }
    return list
  }
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
