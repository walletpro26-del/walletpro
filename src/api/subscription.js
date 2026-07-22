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
} from 'firebase/firestore'

// List of Admin Emails that have free lifetime access
export const ADMIN_EMAILS = [
  'walletpro26@gmail.com',
  'sheikhgulfam91@gmail.com',
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
      const isActive = data.status === 'active' && expiresAt && expiresAt > new Date()

      return {
        active: isActive,
        status: isActive ? 'active' : (data.status === 'revoked' ? 'revoked' : 'expired'),
        plan: data.plan || 'monthly',
        expiresAt,
        isAdmin: false,
        paymentId: data.paymentId || '',
        utr: data.utr || '',
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
 * Submit dynamic UPI UTR payment with INSTANT AUTOMATIC ACTIVATION
 * @param {{ user: { uid: string, email: string, name?: string }, plan: 'monthly'|'yearly', amount: number, utr: string }} params
 * @returns {Promise<{ success: boolean, orderId: string, expiresAt: Date, message: string }>}
 */
export async function submitUpiPayment({ user, plan, amount, utr }) {
  if (!user || !user.uid) throw new Error('User not logged in')

  const cleanUtr = String(utr || '').trim()
  if (cleanUtr.length !== 12 || !/^\d{12}$/.test(cleanUtr)) {
    throw new Error('Please enter a valid 12-digit UTR / Bank Reference Number.')
  }

  // 1. Uniqueness check on upi_payments (wrapped in try/catch in case of rule restrictions for non-admins)
  try {
    const utrCheckQ = query(collection(db, 'upi_payments'), where('utr', '==', cleanUtr))
    const utrSnap = await getDocs(utrCheckQ)
    if (!utrSnap.empty) {
      throw new Error('This 12-digit UTR has already been used. Please check your bank transaction receipt or contact support.')
    }
  } catch (err) {
    if (err.message && err.message.includes('already been used')) {
      throw err
    }
    console.warn('[subscription] Bypassing global UTR check due to rule restrictions:', err?.message)
  }

  const orderId = `WV_ORD_${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`
  const now = new Date()
  const nowTs = Timestamp.now()

  let expiresAt = new Date()
  let finalAmount = Number(amount) || (plan === 'yearly' ? 150 : 20)

  if (plan === 'yearly') {
    expiresAt.setFullYear(now.getFullYear() + 1)
  } else {
    expiresAt.setDate(now.getDate() + 30)
  }

  // 2. Save UTR payment record in upi_payments (wrapped in try/catch in case of rule restrictions)
  try {
    const paymentData = {
      orderId,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.name || '',
      utr: cleanUtr,
      amount: finalAmount,
      plan: plan || 'monthly',
      merchantPhone: MERCHANT_PHONE,
      status: 'AUTO_ACTIVATED',
      submittedAt: nowTs,
      updatedAt: nowTs,
      expiresAt: Timestamp.fromDate(expiresAt),
    }

    const docRef = doc(db, 'upi_payments', orderId)
    await setDoc(docRef, paymentData)
  } catch (err) {
    console.warn('[subscription] Bypassing upi_payments log creation due to rule restrictions:', err?.message)
  }

  // 3. INSTANTLY Activate User Subscription in subscriptions/{uid} collection (guaranteed write under own-document rule)
  const subRef = doc(db, 'subscriptions', user.uid)
  const subscriptionData = {
    userId: user.uid,
    email: user.email || '',
    status: 'active',
    plan: plan || 'monthly',
    amountPaid: finalAmount,
    currency: 'INR',
    paidAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    paymentId: `UPI_UTR_${cleanUtr}`,
    gateway: 'upi_auto_instant',
    utr: cleanUtr,
    orderId,
    updatedAt: nowTs,
  }

  await setDoc(subRef, subscriptionData, { merge: true })

  return {
    success: true,
    orderId,
    expiresAt,
    message: '🎉 Subscription Activated Successfully!',
  }
}

/**
 * Fetch all UPI payment submissions for Admin Panel audit
 * @returns {Promise<Array<object>>}
 */
export async function getAllUpiPayments() {
  try {
    const q = query(collection(db, 'upi_payments'), orderBy('submittedAt', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('[subscription] Failed to fetch UPI payments:', err?.message)
    try {
      const snap = await getDocs(collection(db, 'upi_payments'))
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    } catch (e) {
      return []
    }
  }
}

/**
 * Revoke / Deactivate a user subscription if fake/tampered UTR is detected by Admin
 * @param {string} userId
 * @param {string} orderId
 * @param {string} adminEmail
 * @param {string} reason
 * @returns {Promise<{ success: boolean }>}
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
        status: 'AUTO_ACTIVATED',
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
