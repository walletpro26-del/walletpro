import { db, auth } from '../firebase'
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
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
 * Get derived subscription tier: 'free' | 'trial' | 'pro' | 'ultra'
 * @param {object} subscription
 * @returns {'free'|'trial'|'pro'|'ultra'}
 */
export function getSubscriptionTier(subscription) {
  if (subscription?.isAdmin) return 'ultra'
  if (!subscription || !subscription.active) return 'free'
  const plan = String(subscription.plan || '').toLowerCase()
  if (plan === 'trial') return 'trial' // Trial unlocks all features for 3 days
  if (plan.startsWith('ultra')) return 'ultra'
  return 'pro' // 'monthly' | 'yearly'
}

/**
 * Check if user has active Ultra tier access (including during trial or for admin)
 * @param {object} subscription
 * @returns {boolean}
 */
export function hasUltraAccess(subscription) {
  const tier = getSubscriptionTier(subscription)
  return tier === 'ultra' || tier === 'trial' || !!subscription?.isAdmin
}

/**
 * Get current subscription status for a user
 * @param {{ uid: string, email: string }} user
 * @returns {Promise<{ active: boolean, status: string, plan: string, expiresAt: Date|null, isAdmin: boolean }>}
 */
export async function getSubscriptionStatus(user) {
  if (!user || (!user.uid && !user.email)) {
    return { active: false, status: 'unauthenticated', plan: 'none', expiresAt: null, isAdmin: false }
  }

  ensureUserProfile(user).catch(() => {})

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

  // 2. Query Firestore subscriptions collection by UID
  try {
    if (user.uid) {
      const subRef = doc(db, 'subscriptions', user.uid)
      const snap = await getDoc(subRef)

      if (snap.exists()) {
        const data = snap.data()
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
        const isPending = data.status === 'pending_verification'
        const isActive = data.status === 'active' && (!expiresAt || expiresAt > new Date())

        if (isActive || isPending) {
          return {
            active: isActive,
            status: isPending ? 'pending_verification' : 'active',
            plan: data.plan || 'monthly',
            expiresAt,
            isAdmin: false,
            paymentId: data.paymentId || '',
            utr: data.utr || '',
            orderId: data.orderId || '',
            revocationReason: data.revocationReason || '',
          }
        }
      }
    }
  } catch (err) {
    console.warn('[subscription] Failed to fetch subscription status by UID:', err?.message)
  }

  // 3. Fallback: Check doc by email address or query by email field
  if (user.email) {
    const cleanEmail = user.email.toLowerCase().trim()
    try {
      // Check document keyed by email
      const emailSubRef = doc(db, 'subscriptions', cleanEmail)
      const emailSnap = await getDoc(emailSubRef)
      if (emailSnap.exists()) {
        const data = emailSnap.data()
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
        const isActive = data.status === 'active' && (!expiresAt || expiresAt > new Date())

        if (isActive) {
          if (user.uid) {
            setDoc(doc(db, 'subscriptions', user.uid), { ...data, userId: user.uid }, { merge: true }).catch(() => {})
          }
          return {
            active: true,
            status: 'active',
            plan: data.plan || 'monthly',
            expiresAt,
            isAdmin: false,
            paymentId: data.paymentId || '',
            utr: data.utr || '',
            orderId: data.orderId || '',
            revocationReason: data.revocationReason || '',
          }
        }
      }

      // Query collection where email == cleanEmail
      const q = query(collection(db, 'subscriptions'), where('email', '==', cleanEmail))
      const qSnap = await getDocs(q)
      if (!qSnap.empty) {
        for (const d of qSnap.docs) {
          const data = d.data()
          const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
          const isActive = data.status === 'active' && (!expiresAt || expiresAt > new Date())

          if (isActive) {
            if (user.uid) {
              setDoc(doc(db, 'subscriptions', user.uid), { ...data, userId: user.uid }, { merge: true }).catch(() => {})
            }
            return {
              active: true,
              status: 'active',
              plan: data.plan || 'monthly',
              expiresAt,
              isAdmin: false,
              paymentId: data.paymentId || '',
              utr: data.utr || '',
              orderId: data.orderId || '',
              revocationReason: data.revocationReason || '',
            }
          }
        }
      }
    } catch (err) {
      console.warn('[subscription] Failed to fetch subscription status by email fallback:', err?.message)
    }
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

  const subRef = doc(db, 'subscriptions', user.uid)
  const snap = await getDoc(subRef)

  let currentActive = false
  let currentExpires = null
  let isTrialClaimed = false

  if (snap.exists()) {
    const data = snap.data()
    isTrialClaimed = !!data.trialClaimed
    const exp = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
    if (data.status === 'active' && exp && exp > new Date()) {
      currentActive = true
      currentExpires = exp
    }
  }

  const now = new Date()
  let baseDate = now

  // Stack new duration on top of current active trial or subscription
  if (currentActive && currentExpires) {
    baseDate = currentExpires
  }

  let expiresAt = new Date(baseDate.getTime())
  let extraDays = 0

  // If the user hasn't claimed their 3-day free trial yet, add it automatically to their paid time
  if (!isTrialClaimed) {
    extraDays = 3
  }

  const isYearlyPlan = plan === 'yearly' || plan === 'ultra_yearly'
  if (isYearlyPlan) {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30)
  }

  if (extraDays > 0) {
    expiresAt.setDate(expiresAt.getDate() + extraDays)
  }

  let defaultAmt = 20
  if (plan === 'yearly') defaultAmt = 150
  else if (plan === 'ultra_monthly') defaultAmt = 49
  else if (plan === 'ultra_yearly') defaultAmt = 399

  let finalAmount = amount || defaultAmt

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
    trialClaimed: true, // Mark trial as claimed/consumed
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, expiresAt, plan, orderId: paymentId }
}

/**
 * Create Razorpay Payment Options Configuration
 */
export function createRazorpayOptions({ user, plan, amount, razorpayKey, onSuccess, onError }) {
  let defaultAmt = 20
  if (plan === 'yearly') defaultAmt = 150
  else if (plan === 'ultra_monthly') defaultAmt = 49
  else if (plan === 'ultra_yearly') defaultAmt = 399

  const finalAmt = amount || defaultAmt
  const amountPaise = Math.round(finalAmt * 100)
  const isYearly = plan === 'yearly' || plan === 'ultra_yearly'
  const isUltra = plan.startsWith('ultra')
  const tierName = isUltra ? 'Ultra' : 'Pro'
  const durationName = isYearly ? 'Yearly' : 'Monthly'
  const planTitle = `WalletVibe ${tierName} ${durationName} (₹${finalAmt}/${isYearly ? 'year' : 'month'})`

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
export function listenSubscriptionStatus(uidOrUser, secondArg, thirdArg) {
  let uid = ''
  let email = ''
  let callback = null

  if (typeof uidOrUser === 'object' && uidOrUser !== null) {
    uid = uidOrUser.uid || ''
    email = uidOrUser.email || ''
    callback = typeof secondArg === 'function' ? secondArg : thirdArg
  } else {
    uid = String(uidOrUser || '')
    if (typeof secondArg === 'function') {
      callback = secondArg
    } else {
      email = String(secondArg || '')
      callback = thirdArg
    }
  }

  if (typeof callback !== 'function') return () => {}

  let unsubUid = null
  let unsubEmail = null

  const notify = (sub) => {
    const isAdmin = isAdminEmail(email) || isAdminEmail(auth?.currentUser?.email) || sub?.isAdmin || sub?.plan === 'lifetime_admin'
    if (isAdmin) {
      callback({
        active: true,
        status: 'active',
        plan: 'lifetime_admin',
        expiresAt: null,
        isAdmin: true,
        paymentId: sub?.paymentId || '',
        orderId: sub?.orderId || '',
      })
    } else {
      callback({
        ...sub,
        isAdmin: false,
      })
    }
  }

  if (isAdminEmail(email) || isAdminEmail(auth?.currentUser?.email)) {
    notify({ active: true, status: 'active', plan: 'lifetime_admin', expiresAt: null, isAdmin: true })
  }

  if (uid) {
    const subRef = doc(db, 'subscriptions', uid)
    unsubUid = onSnapshot(subRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
        const isActive = data.status === 'active' && (!expiresAt || expiresAt > new Date())
        notify({
          active: isActive,
          status: data.status || 'inactive',
          plan: data.plan || 'monthly',
          expiresAt,
          isAdmin: data.isAdmin || data.plan === 'lifetime_admin',
          paymentId: data.paymentId || '',
          orderId: data.orderId || '',
        })
      } else if (!email) {
        notify({ active: false, status: 'inactive', plan: 'none', expiresAt: null, isAdmin: false })
      }
    }, (err) => {
      console.warn('[subscription] UID realtime listener warning:', err?.message)
    })
  }

  if (email && email.includes('@')) {
    const cleanEmail = email.toLowerCase().trim()
    const emailSubRef = doc(db, 'subscriptions', cleanEmail)
    unsubEmail = onSnapshot(emailSubRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : (data.expiresAt ? new Date(data.expiresAt) : null)
        const isActive = data.status === 'active' && (!expiresAt || expiresAt > new Date())
        if (isActive) {
          if (uid) {
            setDoc(doc(db, 'subscriptions', uid), { ...data, userId: uid }, { merge: true }).catch(() => {})
          }
          notify({
            active: true,
            status: 'active',
            plan: data.plan || 'monthly',
            expiresAt,
            isAdmin: data.isAdmin || data.plan === 'lifetime_admin',
            paymentId: data.paymentId || '',
            orderId: data.orderId || '',
          })
        }
      }
    }, (err) => {
      console.warn('[subscription] Email realtime listener warning:', err?.message)
    })
  }

  return () => {
    unsubUid?.()
    unsubEmail?.()
  }
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
    const combinedMap = new Map()

    try {
      const profSnap = await getDocs(collection(db, 'userProfiles'))
      profSnap.docs.forEach((d) => {
        const data = d.data()
        const uid = d.id || data.userId || data.uid
        if (uid) {
          combinedMap.set(uid, {
            id: uid,
            userId: uid,
            email: data.email || '',
            name: data.name || '',
            status: 'registered',
            plan: 'none',
            createdAt: data.lastSeenAt || data.createdAt || null,
          })
        }
      })
    } catch (e) {}

    const subSnap = await getDocs(collection(db, 'subscriptions'))
    subSnap.docs.forEach((d) => {
      const data = d.data()
      const key = getMapKey(data, data.userId || data.uid || d.id)
      const existing = combinedMap.get(key) || {}
      const cleanEmail = data.email || existing.email || ''
      const isAdmin = isAdminEmail(cleanEmail)

      combinedMap.set(key, {
        ...existing,
        ...data,
        id: d.id || existing.id || key,
        email: cleanEmail,
        ...(isAdmin ? { status: 'active', plan: 'lifetime_admin', gateway: 'admin_granted', adminActivated: true } : {}),
      })
    })

    // Process all map items to guarantee admin emails have active lifetime_admin status
    combinedMap.forEach((item) => {
      if (isAdminEmail(item.email)) {
        item.status = 'active'
        item.plan = 'lifetime_admin'
        item.gateway = 'admin_granted'
        item.adminActivated = true
      }
    })

    // Classify accounts with NO payment/trial/admin evidence as 'registered' (shows under Pending)
    // These are users who authenticated but never paid, never claimed trial, and weren't admin-activated
    combinedMap.forEach((item) => {
      if (isAdminEmail(item.email)) return // skip super admin
      if (item.adminActivated || item.gateway === 'admin_granted') return // admin-activated
      if (item.status === 'active') return // already active
      if (item.status === 'pending_verification') return // already pending verification (UTR submitted)

      const hasPaid = !!(item.paymentId || item.paidAmount || item.razorpay_payment_id || item.hadPaidSubscription)
      const hasTrial = item.plan === 'trial' || item.trialClaimedAt
      if (!hasPaid && !hasTrial) {
        item.status = 'registered'
        if (!item.plan || item.plan === 'free') item.plan = 'none'
      }
    })

    return Array.from(combinedMap.values())
  } catch (err) {
    console.warn('[subscription] Failed to fetch subscriptions:', err?.message)
    return []
  }
}

/**
 * Permanently delete a user account and ALL associated documents from Firestore (subscriptions & userProfiles)
 * @param {string} adminEmail
 * @param {string} targetInput - Email, UID, or document ID
 * @returns {Promise<{ success: boolean, deletedCount: number }>}
 */
export async function deleteSubscriptionAccount(adminEmail, targetInput) {
  const cleanAdmin = String(adminEmail || auth?.currentUser?.email || '').toLowerCase().trim()
  if (!isAdminEmail(cleanAdmin)) {
    throw new Error('Unauthorized: Only super admins can delete user accounts.')
  }

  const cleanTarget = String(targetInput || '').replace(/^email:/, '').trim().toLowerCase()
  if (!cleanTarget) throw new Error('Valid email or UID is required to delete account')

  let deletedCount = 0

  // 1. Search and delete from subscriptions collection
  try {
    const subSnap = await getDocs(collection(db, 'subscriptions'))
    for (const d of subSnap.docs) {
      const data = d.data()
      const docEmail = (data.email || '').toLowerCase().trim()
      const docUid = (data.uid || data.userId || d.id).toLowerCase().trim()
      const docId = d.id.toLowerCase().trim()

      if (docId === cleanTarget || docEmail === cleanTarget || docUid === cleanTarget) {
        await deleteDoc(doc(db, 'subscriptions', d.id)).catch(() => {})
        deletedCount++
      }
    }
  } catch (err) {
    console.warn('[subscription] Failed deleting from subscriptions collection:', err?.message)
  }

  // 2. Search and delete from userProfiles collection
  try {
    const profSnap = await getDocs(collection(db, 'userProfiles'))
    for (const d of profSnap.docs) {
      const data = d.data()
      const docEmail = (data.email || '').toLowerCase().trim()
      const docUid = (data.uid || data.userId || d.id).toLowerCase().trim()
      const docId = d.id.toLowerCase().trim()

      if (docId === cleanTarget || docEmail === cleanTarget || docUid === cleanTarget) {
        await deleteDoc(doc(db, 'userProfiles', d.id)).catch(() => {})
        deletedCount++
      }
    }
  } catch (err) {
    console.warn('[subscription] Failed deleting from userProfiles collection:', err?.message)
  }

  return { success: true, deletedCount }
}

/**
 * Backfill userProfiles + subscriptions docs for Firebase Auth emails that don't exist in Firestore yet.
 * Admin-only tool: paste emails from Firebase Auth console → creates 'registered' docs so they appear under Pending.
 * @param {string} adminEmail - Must be an admin email
 * @param {string[]} emails - Array of email strings to backfill
 * @returns {Promise<{ success: boolean, addedCount: number, skippedCount: number, errors: string[] }>}
 */
export async function backfillUserProfiles(adminEmail, emails = []) {
  if (!isAdminEmail(adminEmail)) throw new Error('Admin access required')
  if (!emails.length) throw new Error('No emails provided')

  // Get all existing emails from both collections
  const existingEmails = new Set()

  try {
    const subSnap = await getDocs(collection(db, 'subscriptions'))
    subSnap.docs.forEach((d) => {
      const email = (d.data().email || '').toLowerCase().trim()
      if (email) existingEmails.add(email)
    })
  } catch (e) {}

  try {
    const profSnap = await getDocs(collection(db, 'userProfiles'))
    profSnap.docs.forEach((d) => {
      const email = (d.data().email || '').toLowerCase().trim()
      if (email) existingEmails.add(email)
    })
  } catch (e) {}

  let addedCount = 0
  let skippedCount = 0
  const errors = []

  for (const rawEmail of emails) {
    const email = (rawEmail || '').toLowerCase().trim()
    if (!email || !email.includes('@')) {
      skippedCount++
      continue
    }

    if (existingEmails.has(email)) {
      skippedCount++
      continue
    }

    try {
      // Generate a deterministic doc ID from email (replace dots and @ for Firestore compatibility)
      const docId = email.replace(/[.@]/g, '_')
      const now = Timestamp.now()
      const isAdmin = isAdminEmail(email)

      // Create userProfile doc
      await setDoc(doc(db, 'userProfiles', docId), {
        userId: docId,
        uid: docId,
        email: email,
        name: email.split('@')[0] || 'User',
        lastSeenAt: now,
        backfilledAt: now,
        backfilledBy: adminEmail,
      }, { merge: true })

      // Create subscriptions doc (registered/no payment)
      await setDoc(doc(db, 'subscriptions', docId), {
        userId: docId,
        uid: docId,
        email: email,
        name: email.split('@')[0] || 'User',
        status: isAdmin ? 'active' : 'registered',
        plan: isAdmin ? 'lifetime_admin' : 'none',
        gateway: isAdmin ? 'admin_granted' : 'none',
        adminActivated: isAdmin,
        createdAt: now,
        updatedAt: now,
        backfilledAt: now,
        backfilledBy: adminEmail,
      }, { merge: true })

      existingEmails.add(email)
      addedCount++
    } catch (err) {
      errors.push(`${email}: ${err.message}`)
    }
  }

  return { success: true, addedCount, skippedCount, errors }
}

/**
 * Ensure user profile document exists in Firestore on sign-in
 * Creates subscription & userProfile documents for registered accounts so they appear in Admin Panel.
 */
export async function ensureUserProfile(user) {
  if (!user || (!user.uid && !user.email)) return
  const currentUid = user.uid || auth?.currentUser?.uid || ''
  const cleanEmail = (user.email || auth?.currentUser?.email || '').toLowerCase().trim()
  if (!currentUid) return

  const subRef = doc(db, 'subscriptions', currentUid)
  const profileRef = doc(db, 'userProfiles', currentUid)

  const [snap, profSnap] = await Promise.all([
    getDoc(subRef).catch(() => null),
    getDoc(profileRef).catch(() => null)
  ])

  const isExistingUser = (snap && snap.exists()) || (profSnap && profSnap.exists())

  // If this is a BRAND NEW user registering for the first time, verify subscriber limit
  if (!isExistingUser && !isAdminEmail(cleanEmail)) {
    try {
      const cfgSnap = await getDoc(doc(db, 'appConfig', 'global'))
      if (cfgSnap.exists()) {
        const cfgData = cfgSnap.data()
        const limitNum = Number(cfgData.subscriberLimit ?? 10)
        const isUnlimited = limitNum <= 0

        if (!isUnlimited) {
          const allSubs = await getAllSubscriptions()
          const counts = getSubscriberCounts(allSubs)
          const currentCount = Math.max(Number(cfgData.activeSubscriberCount ?? 0), counts.regularActiveCount)

          if (currentCount >= limitNum) {
            const err = new Error(`REGISTRATION_CLOSED_LIMIT_REACHED:${limitNum}`)
            err.code = 'REGISTRATION_CLOSED_LIMIT_REACHED'
            throw err
          }
        }
      }
    } catch (err) {
      if (err.code === 'REGISTRATION_CLOSED_LIMIT_REACHED' || err.message?.startsWith('REGISTRATION_CLOSED_LIMIT_REACHED')) {
        throw err
      }
    }
  }

  // Create or update user profile and subscription document
  const isAdmin = isAdminEmail(cleanEmail)
  if (!snap || !snap.exists()) {
    await setDoc(subRef, {
      userId: currentUid,
      uid: currentUid,
      email: cleanEmail,
      name: user.name || user.displayName || cleanEmail.split('@')[0] || 'User',
      status: isAdmin ? 'active' : 'inactive',
      plan: isAdmin ? 'lifetime_admin' : 'free',
      gateway: isAdmin ? 'admin_granted' : 'none',
      adminActivated: isAdmin,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true })
  } else if (isAdmin) {
    await setDoc(subRef, {
      status: 'active',
      plan: 'lifetime_admin',
      gateway: 'admin_granted',
      adminActivated: true,
      updatedAt: Timestamp.now(),
    }, { merge: true })
  }

  await setDoc(profileRef, {
    userId: currentUid,
    uid: currentUid,
    email: cleanEmail,
    name: user.name || user.displayName || cleanEmail.split('@')[0] || 'User',
    lastSeenAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * Real-time listener for all subscriptions & registered user profiles (Admin use ONLY)
 * Combines subscriptions and userProfiles so 100% of registered accounts reflect in Admin Panel.
 * @param {function} callback
 * @returns {function} unsubscribe function
 */
export function listenAllSubscriptions(callback) {
  const userEmail = auth?.currentUser?.email || ''
  if (!isAdminEmail(userEmail)) {
    if (typeof callback === 'function') callback([])
    return () => {}
  }

  const subsMap = new Map()
  const profilesMap = new Map()

  function getMapKey(item, fallbackId) {
    const email = (item?.email || '').toLowerCase().trim()
    if (email) return `email:${email}`
    return fallbackId || item?.userId || item?.uid || item?.id
  }

  function mergeAndNotify() {
    const combinedMap = new Map()

    // 1. Registered user profiles
    profilesMap.forEach((prof, uid) => {
      const cleanEmail = prof.email || ''
      const key = getMapKey(prof, uid)
      const isAdmin = isAdminEmail(cleanEmail)

      combinedMap.set(key, {
        id: uid,
        userId: uid,
        email: cleanEmail,
        name: prof.name || '',
        status: isAdmin ? 'active' : 'inactive',
        plan: isAdmin ? 'lifetime_admin' : 'free',
        gateway: isAdmin ? 'admin_granted' : 'none',
        adminActivated: isAdmin,
        createdAt: prof.lastSeenAt || null,
      })
    })

    // 2. Subscriptions (overrides inactive state with paid/pending status)
    subsMap.forEach((sub, subId) => {
      const key = getMapKey(sub, sub.userId || sub.uid || sub.id || subId)
      const existing = combinedMap.get(key) || {}
      const cleanEmail = sub.email || existing.email || ''
      const isAdmin = isAdminEmail(cleanEmail)

      combinedMap.set(key, {
        ...existing,
        ...sub,
        id: sub.id || existing.id || key,
        email: cleanEmail,
        ...(isAdmin ? { status: 'active', plan: 'lifetime_admin', gateway: 'admin_granted', adminActivated: true } : {}),
      })
    })

    // Ensure all admin emails in combined map are set to active lifetime_admin
    combinedMap.forEach((item) => {
      if (isAdminEmail(item.email)) {
        item.status = 'active'
        item.plan = 'lifetime_admin'
        item.gateway = 'admin_granted'
        item.adminActivated = true
      }
    })

    if (typeof callback === 'function') {
      callback(Array.from(combinedMap.values()))
    }
  }

  const unsubSubs = onSnapshot(collection(db, 'subscriptions'), (snap) => {
    subsMap.clear()
    snap.docs.forEach((d) => subsMap.set(d.id, { id: d.id, ...d.data() }))
    mergeAndNotify()
  }, () => {})

  const unsubProfiles = onSnapshot(collection(db, 'userProfiles'), (snap) => {
    profilesMap.clear()
    snap.docs.forEach((d) => profilesMap.set(d.id, { id: d.id, ...d.data() }))
    mergeAndNotify()
  }, () => {})

  return () => {
    unsubSubs?.()
    unsubProfiles?.()
  }
}

/**
 * Deduplicate raw subscription records by normalized email address
 * Picks the most active / latest expiring record as primary for each unique email.
 * @param {Array<object>} subscriptions
 * @returns {Array<object>}
 */
export function deduplicateSubscriptions(subscriptions = []) {
  const map = new Map()

  subscriptions.forEach((sub) => {
    const rawEmail = (sub.email || sub.userId || sub.id || '').toLowerCase().trim()
    if (!rawEmail) return

    const expiresAt = sub.expiresAt?.toDate ? sub.expiresAt.toDate() : (sub.expiresAt ? new Date(sub.expiresAt) : null)
    const isActive = sub.status === 'active' && (!expiresAt || expiresAt > new Date())
    const score = (isActive ? 1000 : 0) + (sub.status === 'pending_verification' ? 500 : 0) + (expiresAt ? expiresAt.getTime() / 1e10 : 0)

    const docId = sub.id || sub.userId

    if (!map.has(rawEmail)) {
      map.set(rawEmail, {
        ...sub,
        email: sub.email || rawEmail,
        _score: score,
        docIds: docId ? [docId] : [],
      })
    } else {
      const existing = map.get(rawEmail)
      if (docId && !existing.docIds.includes(docId)) {
        existing.docIds.push(docId)
      }

      // If new doc has a higher priority/status score, replace primary details
      if (score > existing._score) {
        map.set(rawEmail, {
          ...sub,
          email: sub.email || rawEmail,
          _score: score,
          docIds: existing.docIds,
        })
      }
    }
  })

  return Array.from(map.values()).map(({ _score, ...rest }) => rest)
}

/**
 * Permanently purge duplicate subscription documents for the same email in Firestore
 * @param {string} adminEmail
 * @returns {Promise<{ success: boolean, deletedCount: number }>}
 */
export async function purgeDuplicateSubscriptions(adminEmail) {
  if (!isAdminEmail(adminEmail)) {
    throw new Error('Only whitelisted admins can purge duplicate records')
  }

  const snap = await getDocs(collection(db, 'subscriptions'))
  const rawSubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const emailGroups = new Map()
  rawSubs.forEach((sub) => {
    const email = (sub.email || sub.userId || sub.id || '').toLowerCase().trim()
    if (!email) return
    if (!emailGroups.has(email)) emailGroups.set(email, [])
    emailGroups.get(email).push(sub)
  })

  let deletedCount = 0

  for (const [email, docs] of emailGroups.entries()) {
    if (docs.length <= 1) continue

    // Sort docs by score (best / most active / newest first)
    docs.sort((a, b) => {
      const expA = a.expiresAt?.toDate ? a.expiresAt.toDate() : (a.expiresAt ? new Date(a.expiresAt) : new Date(0))
      const expB = b.expiresAt?.toDate ? b.expiresAt.toDate() : (b.expiresAt ? new Date(b.expiresAt) : new Date(0))
      const activeA = a.status === 'active' && expA > new Date() ? 1000 : 0
      const activeB = b.status === 'active' && expB > new Date() ? 1000 : 0
      return (activeB + expB.getTime()) - (activeA + expA.getTime())
    })

    // Keep docs[0] as primary, delete docs[1..N]
    const docsToDelete = docs.slice(1)
    for (const d of docsToDelete) {
      try {
        const ref = doc(db, 'subscriptions', d.id)
        await deleteDoc(ref)
        deletedCount++
      } catch (err) {
        console.warn(`[subscription] Failed to delete duplicate doc ${d.id}:`, err?.message)
      }
    }
  }

  return { success: true, deletedCount }
}

/**
 * Admin direct manual activation or deactivation of any user account by Email or UID
 * Updates ALL duplicate documents associated with that email in Firestore.
 * @param {string} targetInput - User email or UID
 * @param {'active'|'revoked'|'expired'} status
 * @param {'monthly'|'yearly'} plan
 * @param {string} adminEmail
 * @param {string} reason
 */
export async function adminSetSubscriptionByEmailOrUid(targetInput, status, plan = 'monthly', adminEmail = '', reason = '') {
  const cleanInput = String(targetInput || '').trim()
  if (!cleanInput) throw new Error('User Email or UID is required')

  let matchingUids = [cleanInput]
  let targetEmail = cleanInput.includes('@') ? cleanInput.toLowerCase() : ''

  // If email is passed, search in subscriptions collection to find ALL matching UIDs or email keys
  if (cleanInput.includes('@')) {
    try {
      const q = query(collection(db, 'subscriptions'), where('email', '==', targetEmail))
      const snap = await getDocs(q)
      if (!snap.empty) {
        matchingUids = snap.docs.map((d) => d.id)
        if (!matchingUids.includes(targetEmail)) {
          matchingUids.push(targetEmail)
        }
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

  // Update ALL matching documents for this email/UID
  for (const uid of matchingUids) {
    const subRef = doc(db, 'subscriptions', uid)

    let existingPaidData = {}
    try {
      const snap = await getDoc(subRef)
      if (snap.exists()) {
        const d = snap.data()
        if (d.paymentId || d.amountPaid || d.paidAt) {
          existingPaidData = {
            paidPaymentId: d.paymentId || d.paidPaymentId || '',
            paidAmount: d.amountPaid || d.paidAmount || 0,
            paidOrderId: d.orderId || d.paidOrderId || '',
            paidAt: d.paidAt || null,
            originalPaidExpiresAt: d.expiresAt || null,
            hadPaidSubscription: true,
          }
        }
      }
    } catch (e) {}

    const payload = {
      userId: uid,
      email: targetEmail || uid,
      status,
      plan: status === 'active' ? plan : 'none',
      updatedAt: nowTs,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedByAdmin: adminEmail || 'admin',
      gateway: status === 'active' ? 'admin_granted' : 'none',
      adminActivated: status === 'active',
      adminNote: reason || (status === 'active' ? 'Manually activated/exempted by Admin' : 'Deactivated by Admin'),
      ...existingPaidData,
    }
    await setDoc(subRef, payload, { merge: true })
  }

  return { success: true, userId: matchingUids[0], status, expiresAt }
}

/**
 * Categorize and count active subscriptions into regular (counted towards limit) and admin-granted (exempt from limit)
 * Deduplicates entries by unique email first.
 * @param {Array<object>} subscriptions
 * @returns {{ totalActive: number, adminActivatedCount: number, regularActiveCount: number }}
 */
export function getSubscriberCounts(subscriptions = []) {
  const uniqueSubs = deduplicateSubscriptions(subscriptions)
  let adminActivatedCount = 0
  let regularActiveCount = 0
  let pendingCount = 0
  let inactiveCount = 0

  uniqueSubs.forEach((sub) => {
    const cleanEmail = sub.email || ''
    // Only the hardcoded super admin email is truly "Admin"
    const isSuperAdmin = isAdminEmail(cleanEmail)
    // Admin-activated users are treated as regular active (exempt from payment but counted normally)
    const isAdminActivatedUser =
      !isSuperAdmin && (
        sub.gateway === 'admin_granted' ||
        sub.adminActivated === true ||
        sub.plan === 'lifetime_admin'
      )

    const expiresAt = sub.expiresAt?.toDate ? sub.expiresAt.toDate() : (sub.expiresAt ? new Date(sub.expiresAt) : null)
    const isActive = (sub.status === 'active' || isSuperAdmin || isAdminActivatedUser) && (!expiresAt || expiresAt > new Date())
    const isPending = !isSuperAdmin && (sub.status === 'pending_verification' || sub.status === 'registered')

    if (isSuperAdmin) {
      adminActivatedCount++
    } else if (isActive) {
      regularActiveCount++
    } else if (isPending) {
      pendingCount++
    } else {
      inactiveCount++
    }
  })

  return {
    totalAccounts: uniqueSubs.length,
    adminActivatedCount,
    regularActiveCount,
    pendingCount,
    inactiveCount,
    totalActive: regularActiveCount + adminActivatedCount,
  }
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
