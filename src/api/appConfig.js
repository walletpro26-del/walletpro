import { db } from '../firebase'
import { doc, getDoc, setDoc, Timestamp, onSnapshot } from 'firebase/firestore'
import { isAdminEmail } from './subscription'

const CONFIG_DOC = 'appConfig/settings'

// Default config values (used as fallback if Firestore doc doesn't exist yet)
const DEFAULTS = {
  monthlyPrice: 20,
  yearlyPrice: 150,
  ultraMonthlyPrice: 49,
  ultraYearlyPrice: 399,
  ultraEnabled: false, // Master switch for Ultra auto bank sync
  ultraComingSoon: true, // Show "Coming Soon" badge for Ultra
  hideUltraBanner: false, // Admin switch to hide Coming Soon banner completely in Bank History view
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
  subscriberLimit: 10,
  allowNonCsvImport: true,
  geminiApiKeys: '', // Admin-configured multiple Gemini AI API keys (comma or newline separated)
}

let _cachedConfig = null
let _cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function syncLocalConfigCache(cfg) {
  try {
    if (cfg) {
      localStorage.setItem('wv_cached_app_config', JSON.stringify(cfg))
      if (cfg.geminiApiKeys) {
        localStorage.setItem('wv_admin_gemini_api_keys', String(cfg.geminiApiKeys))
      }
    }
  } catch (e) {}
}

/**
 * Get app configuration from Firestore (with in-memory & localStorage cache)
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
    syncLocalConfigCache(_cachedConfig)
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

/**
 * Real-time listener for app configuration updates
 * @param {function} callback 
 * @returns {function} unsubscribe listener
 */
export function listenAppConfig(callback) {
  try {
    const ref = doc(db, 'appConfig', 'settings')
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        _cachedConfig = { ...DEFAULTS, ...snap.data() }
      } else {
        _cachedConfig = { ...DEFAULTS }
      }
      _cacheTime = Date.now()
      callback(_cachedConfig)
    }, (err) => {
      console.warn('[appConfig] Real-time listener warning:', err?.message)
      callback(_cachedConfig || { ...DEFAULTS })
    })
  } catch (err) {
    console.warn('[appConfig] listenAppConfig error:', err?.message)
    callback(_cachedConfig || { ...DEFAULTS })
    return () => {}
  }
}
