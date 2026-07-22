/**
 * ARCHIVED RAZORPAY INTEGRATION BACKUP (July 2026)
 * WalletVibe by NextLifTechnologies
 * 
 * Safe backup of Razorpay payment gateway integration.
 * Preserved for historical reference and quick re-activation if ever required in the future.
 */

import { db } from '../firebase'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

/**
 * Load Razorpay Checkout SDK dynamically
 */
export function loadRazorpaySDKBackup() {
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
 * Legacy Razorpay Payment Handler options template
 */
export function createRazorpayOptionsBackup({ user, plan, amount, razorpayKey, onSuccess, onError }) {
  const amountPaise = Math.round(amount * 100)
  const isYearly = plan === 'yearly'
  const planTitle = isYearly ? `WalletVibe Yearly Subscription (₹${amount}/year)` : `WalletVibe Monthly Subscription (₹${amount}/month)`

  return {
    key: razorpayKey || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_walletvibe',
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
        const result = await activateSubscriptionRazorpayBackup(user, plan, response.razorpay_payment_id)
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
 * Activate subscription via Razorpay Payment ID
 */
export async function activateSubscriptionRazorpayBackup(user, plan, paymentId) {
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
    paymentId: paymentId || '',
    gateway: 'razorpay',
    updatedAt: Timestamp.fromDate(now),
  }

  await setDoc(subRef, payload, { merge: true })
  return { success: true, expiresAt, plan }
}
