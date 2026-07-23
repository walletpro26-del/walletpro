import { db } from '../firebase'
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { isAdminEmail } from './subscription'

const CONFIG_DOC = 'appConfig/settings'

// Default config values (used as fallback if Firestore doc doesn't exist yet)
const DEFAULTS = {
  monthlyPrice: 20,
  yearlyPrice: 150,
  currency: 'INR',
  trialDays: 0,
  appName: 'WalletVibe',
  announcement: '',
  announcementType: 'info', // 'info' | 'warning' | 'success'
  maintenanceMode: false,
  razorpayEnabled: true,
  razorpayMode: 'test',   // 'test' | 'live'
  razorpayKeyId: '',
  cashfreeEnabled: false,
  cashfreeMode: 'sandbox', // 'sandbox' (Test Environment) | 'production' (Live Environment)
  cashfreeAppId: '',
}

let _cachedConfig = null
let _cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get app configuration from Firestore (with in-memory cache)
 * @returns {Promise<object>}
 */
export async function getAppConfig() {
  // Return cache if fresh
  if (_cachedConfig && (Date.now() - _cacheTime) < CACHE_TTL) {
    return _cachedConfig
  }

  try {
    const ref = doc(db, 'appConfig', 'settings')
    const snap = await getDoc(ref)

    if (snap.exists()) {
      _cachedConfig = { ...DEFAULTS, ...snap.data() }
    } else {
      // First time: create the config doc with defaults
      _cachedConfig = { ...DEFAULTS }
    }

    _cacheTime = Date.now()
    return _cachedConfig
  } catch (err) {
    // Quietly fallback to defaults if Firestore rules restrict appConfig document
    if (err?.code !== 'permission-denied' && !err?.message?.includes('permissions')) {
      console.warn('[appConfig] Failed to load config:', err?.message)
    }
    // Return defaults on error
    return _cachedConfig || { ...DEFAULTS }
  }
}

/**
 * Update app configuration (admin only)
 * @param {string} email - Admin email performing the update
 * @param {object} updates - Config fields to update
 * @returns {Promise<{ success: boolean }>}
 */
export async function updateAppConfig(email, updates) {
  if (!isAdminEmail(email)) {
    throw new Error('Only admins can update app configuration')
  }

  const ref = doc(db, 'appConfig', 'settings')
  const payload = {
    ...updates,
    updatedAt: Timestamp.fromDate(new Date()),
    updatedBy: email,
  }

  await setDoc(ref, payload, { merge: true })

  // Invalidate cache
  _cachedConfig = null
  _cacheTime = 0

  return { success: true }
}

/**
 * Force refresh config cache
 */
export function invalidateConfigCache() {
  _cachedConfig = null
  _cacheTime = 0
}
