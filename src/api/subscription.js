import { db } from '../firebase'
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore'

// List of Admin Emails that have free lifetime access
export const ADMIN_EMAILS = [
  'walletpro26@gmail.com',
]

// Default Merchant UPI credentials (linked to HDFC Bank & Axis Bank)
export const DEFAULT_MERCHANT_UPI = 'sheikhgulfam91-1@okhdfcbank'
export const SECONDARY_MERCHANT_UPI = 'sheikhgulfam91@okaxis'
export const MERCHANT_NAME = 'Sheikh Gulfam'
export const MERCHANT_PHONE = '9682547458'

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
      const isPending = data.status === 'pending_verification'
      const isActive = data.status === 'active' && expiresAt && expiresAt > new Date()

      return {
        active: isActive,
        status: isPending ? 'pending_verification' : (isActive ? 'active' : (data.status === 'revoked' ? 'revoked' : 'expired')),
        plan: data.plan || 'monthly',
        expiresAt,
        isAdmin: false,
        paymentId: data.paymentId || '',
        utr: data.utr || '',
        orderId: data.orderId || '',
        revocationReason: data.revocationReason || '',
      }
    }
  } catch (err) {
    console.warn('[subscription] Failed to fetch subscription status:', err?.message)
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
 * Load Razorpay Checkout SDK dynamically
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
 * Activate subscription via Razorpay Payment Gateway
 */
export async function activateSubscriptionRazorpay(user, plan, paymentId, amount) {
  if (!user || !user.uid) throw new Error('User not logged in')

  const now = new Date()
  let expiresAt = new Date()
  let finalAmount = amount || (plan === 'yearly' ? 150 : 20)

  if (plan === 'yearly') {
    expiresAt.setFullYear(now.getFullYear() + 1)
  } else {
    expiresAt.setDate(now.getDate() + 30)
  }

  const subRef = doc(db, 'subscriptions', user.uid)
  const payload = {
    userId: user.uid,
    email: user.email || '',
    status: 'active',
    plan,
    amountPaid: finalAmount,
    currency: 'INR',
    paidAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    paymentId: paymentId || '',
    gateway: 'razorpay',
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, expiresAt, plan, orderId: paymentId }
}

/**
 * Create Razorpay Payment Options Configuration
 */
export function createRazorpayOptions({ user, plan, amount, razorpayKey, onSuccess, onError }) {
  const amountPaise = Math.round((amount || (plan === 'yearly' ? 150 : 20)) * 100)
  const isYearly = plan === 'yearly'
  const planTitle = isYearly ? `WalletVibe Yearly Subscription (₹${amount}/year)` : `WalletVibe Monthly Subscription (₹${amount}/month)`

  return {
    key: razorpayKey || 'rzp_test_walletvibe',
    amount: amountPaise,
    currency: 'INR',
    name: 'WalletVibe',
    description: planTitle,
    image: '/favicon.ico',
    prefill: {
      name: user?.name || '',
      email: user?.email || '',
    },
    theme: {
      color: '#6366f1',
    },
    handler: async function (response) {
      try {
        const result = await activateSubscriptionRazorpay(user, plan, response.razorpay_payment_id, amount)
        if (result.success) {
          onSuccess?.(result)
        }
      } catch (err) {
        onError?.(err)
      }
    },
    modal: {
      ondismiss: function () {},
    },
  }
}

/**
 * Real-time listener for a user's subscription status changes.
 * Fires callback whenever status changes.
 */
export function listenSubscriptionStatus(uid, callback) {
  if (!uid) return () => {}
  const subRef = doc(db, 'subscriptions', uid)
  return onSnapshot(subRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data()
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
      const isActive = data.status === 'active' && expiresAt && expiresAt > new Date()
      callback({
        active: isActive,
        status: data.status || 'inactive',
        plan: data.plan || 'monthly',
        expiresAt,
        isAdmin: false,
        paymentId: data.paymentId || '',
        orderId: data.orderId || '',
      })
    }
  }, (err) => {
    console.warn('[subscription] Realtime listener error:', err?.message)
  })
}

/**
 * Revoke / Deactivate a user subscription if fake/tampered UTR is detected by Admin
 */
export async function revokeSubscription(userId, orderId, adminEmail, reason = '') {
  if (!userId) throw new Error('User ID required')

  const nowTs = Timestamp.now()

  // 1. Immediately Deactivate User Subscription in subscriptions collection
  const subRef = doc(db, 'subscriptions', userId)
  await updateDoc(subRef, {
    status: 'revoked',
    expiresAt: nowTs,
    revokedBy: adminEmail || 'admin',
    revocationReason: reason || 'Payment UTR verification failed or unpaid',
    updatedAt: nowTs,
  })

  // 2. Mark UPI Payment log as REVOKED in upi_payments
  if (orderId) {
    try {
      const payRef = doc(db, 'upi_payments', orderId)
      await updateDoc(payRef, {
        status: 'REVOKED',
        revokedBy: adminEmail || 'admin',
        revocationReason: reason || 'Payment UTR verification failed or unpaid',
        updatedAt: nowTs,
      })
    } catch (err) {
      console.warn('[subscription] Could not update upi_payments doc:', err?.message)
    }
  }

  return { success: true }
}

/**
 * Reactivate a previously revoked user subscription
 * @param {string} userId
 * @param {string} orderId
 * @param {string} adminEmail
 * @returns {Promise<{ success: boolean }>}
 */
export async function reactivateSubscription(userId, orderId, adminEmail) {
  if (!userId) throw new Error('User ID required')

  const now = new Date()
  const nowTs = Timestamp.now()
  const expiresAt = new Date()
  expiresAt.setDate(now.getDate() + 30) // Default 30 days extension

  const subRef = doc(db, 'subscriptions', userId)
  await updateDoc(subRef, {
    status: 'active',
    expiresAt: Timestamp.fromDate(expiresAt),
    reactivatedBy: adminEmail || 'admin',
    updatedAt: nowTs,
  })

  if (orderId) {
    try {
      const payRef = doc(db, 'upi_payments', orderId)
      await updateDoc(payRef, {
        status: 'APPROVED',
        updatedAt: nowTs,
      })
    } catch (e) {}
  }

  return { success: true }
}

/**
 * Direct Manual Subscription Activation helper
 */
export async function activateSubscription(user, plan, paymentId) {
  if (!user || !user.uid) throw new Error('User not logged in')

  const now = new Date()
  let expiresAt = new Date()
  let amount = plan === 'yearly' ? 150 : 20

  if (plan === 'yearly') {
    expiresAt.setFullYear(now.getFullYear() + 1)
  } else {
    expiresAt.setDate(now.getDate() + 30)
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
    paymentId: paymentId || 'ADMIN_MANUAL',
    gateway: 'admin_granted',
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, expiresAt, plan }
}

/**
 * Fetch all user subscription records from Firestore (Admin tool)
 * @returns {Promise<Array<object>>}
 */
export async function getAllSubscriptions() {
  try {
    const snap = await getDocs(collection(db, 'subscriptions'))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('[subscription] Failed to fetch subscriptions:', err?.message)
    return []
  }
}

/**
 * Real-time listener for all subscriptions (Admin use)
 * @param {function} callback
 * @returns {function} unsubscribe function
 */
export function listenAllSubscriptions(callback) {
  const q = collection(db, 'subscriptions')
  return onSnapshot(q, (snap) => {
    const subs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(subs)
  }, (err) => {
    console.warn('[subscription] Subscriptions listener error:', err?.message)
  })
}

/**
 * Admin direct manual activation or deactivation of any user account by Email or UID
 * @param {string} targetInput - User email or UID
 * @param {'active'|'revoked'|'expired'} status
 * @param {'monthly'|'yearly'} plan
 * @param {string} adminEmail
 * @param {string} reason
 */
export async function adminSetSubscriptionByEmailOrUid(targetInput, status, plan = 'monthly', adminEmail = '', reason = '') {
  const cleanInput = String(targetInput || '').trim()
  if (!cleanInput) throw new Error('User Email or UID is required')

  let targetUid = cleanInput
  let targetEmail = cleanInput.includes('@') ? cleanInput.toLowerCase() : ''

  // If email is passed, search in subscriptions collection to find matching UID
  if (cleanInput.includes('@')) {
    try {
      const q = query(collection(db, 'subscriptions'), where('email', '==', targetEmail))
      const snap = await getDocs(q)
      if (!snap.empty) {
        targetUid = snap.docs[0].id
      }
    } catch (err) {
      console.warn('[subscription] Search by email warning:', err?.message)
    }
  }

  const now = new Date()
  const nowTs = Timestamp.now()
  let expiresAt = new Date()

  if (status === 'active') {
    if (plan === 'yearly') {
      expiresAt.setFullYear(now.getFullYear() + 1)
    } else {
      expiresAt.setDate(now.getDate() + 30)
    }
  } else {
    // Set expired/revoked timestamp to now
    expiresAt = now
  }

  const subRef = doc(db, 'subscriptions', targetUid)
  const payload = {
    userId: targetUid,
    email: targetEmail || targetUid,
    status,
    plan: status === 'active' ? plan : 'none',
    updatedAt: nowTs,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedByAdmin: adminEmail || 'admin',
    adminNote: reason || (status === 'active' ? 'Manually activated by Admin' : 'Deactivated by Admin'),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, userId: targetUid, status, expiresAt }
}

/**
 * Claim the 3-day free trial for a user (can only be claimed once)
 * @param {{ uid: string, email: string }} user
 * @returns {Promise<{ success: boolean, expiresAt: Date, plan: string }>}
 */
export async function claimFreeTrial(user) {
  if (!user || !user.uid) throw new Error('User not logged in')

  const subRef = doc(db, 'subscriptions', user.uid)
  const snap = await getDoc(subRef)

  if (snap.exists()) {
    const data = snap.data()
    if (data.trialClaimed) {
      throw new Error('You have already claimed your 3-day free trial on this account.')
    }
  }

  const now = new Date()
  const expiresAt = new Date()
  expiresAt.setDate(now.getDate() + 3) // 3 Days Trial

  const payload = {
    userId: user.uid,
    email: user.email || '',
    status: 'active',
    plan: 'trial',
    amountPaid: 0,
    currency: 'INR',
    paidAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    gateway: 'free_trial',
    trialClaimed: true,
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, expiresAt, plan: 'trial' }
}
