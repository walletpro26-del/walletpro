import { db, auth } from '../firebase'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'

// List of Admin Emails that have free lifetime access
export const ADMIN_EMAILS = [
  'walletpro26@gmail.com',
  'sheikhgulfam91@gmail.com',
]

/**
 * Check if a given email is an admin
 * @param {string} email
 * @returns {boolean}
 */
export function isAdminEmail(email) {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase().trim())
}

/**
 * Load Razorpay Checkout SDK dynamically if not already loaded
 */
export function loadRazorpaySDK() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/**
 * Get current subscription status for a user
 * @param {{ uid: string, email: string }} user
 * @returns {Promise<{ active: boolean, status: string, plan: string, expiresAt: Date|null, isAdmin: boolean }>}
 */
export async function getSubscriptionStatus(user) {
  if (!user || !user.uid) {
    return { active: false, status: 'unauthenticated', plan: 'none', expiresAt: null, isAdmin: false }
  }

  // 1. Admin exemption
  if (isAdminEmail(user.email)) {
    return {
      active: true,
      status: 'active',
      plan: 'lifetime_admin',
      expiresAt: null,
      isAdmin: true,
    }
  }

  // 2. Query Firestore subscriptions collection
  try {
    const subRef = doc(db, 'subscriptions', user.uid)
    const snap = await getDoc(subRef)

    if (snap.exists()) {
      const data = snap.data()
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
      const isActive = data.status === 'active' && expiresAt && expiresAt > new Date()

      return {
        active: isActive,
        status: isActive ? 'active' : 'expired',
        plan: data.plan || 'monthly',
        expiresAt,
        isAdmin: false,
        paymentId: data.paymentId || '',
      }
    }
  } catch (err) {
    console.warn('[subscription] Failed to fetch subscription doc:', err?.message)
  }

  return {
    active: false,
    status: 'inactive',
    plan: 'none',
    expiresAt: null,
    isAdmin: false,
  }
}

/**
 * Activate subscription in Firestore after successful Razorpay payment
 * @param {{ uid: string, email: string }} user
 * @param {'monthly'|'yearly'} plan
 * @param {string} paymentId
 * @returns {Promise<{ success: boolean, expiresAt: Date }>}
 */
export async function activateSubscription(user, plan, paymentId) {
  if (!user || !user.uid) throw new Error('User not logged in')

  const now = new Date()
  let expiresAt = new Date()
  let amount = 20

  if (plan === 'yearly') {
    expiresAt.setFullYear(now.getFullYear() + 1)
    amount = 150
  } else {
    // Default: monthly (30 days)
    expiresAt.setDate(now.getDate() + 30)
    amount = 20
  }

  const subRef = doc(db, 'subscriptions', user.uid)
  const payload = {
    userId: user.uid,
    email: user.email || '',
    status: 'active',
    plan,
    amountPaid: amount,
    currency: 'INR',
    paidAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    paymentId: paymentId || '',
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })

  return { success: true, expiresAt, plan }
}
