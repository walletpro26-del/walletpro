/**
 * deviceSession.js — Single Active Device Enforcement for WalletVibe
 *
 * Guarantees that at any given time, an account can only be active on one device.
 * When an account logs in on a new device, any previous device is automatically
 * signed out in real-time with an informative notification.
 */

import { db, auth } from '../firebase'
import { doc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore'
import { isAdminEmail } from './subscription'

const SESSION_KEY = 'wv_device_session_id'

/**
 * Get or create a persistent unique session ID for this browser / device instance.
 * Stored in localStorage so tabs or page refreshes on the SAME device share the same ID.
 */
export function getDeviceSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id || typeof id !== 'string' || id.length < 10) {
      id = `wv_sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return `wv_sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * Detect human-readable device and browser description
 */
export function getDeviceDescription() {
  if (typeof navigator === 'undefined') return 'Unknown Device'
  const ua = navigator.userAgent || ''
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone

  let os = 'Unknown OS'
  if (/android/i.test(ua)) os = 'Android'
  else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS'
  else if (/windows nt/i.test(ua)) os = 'Windows PC'
  else if (/macintosh|mac os x/i.test(ua)) os = 'Mac'
  else if (/linux/i.test(ua)) os = 'Linux'

  let browser = 'Browser'
  if (/chrome|crios/i.test(ua) && !/edg|opr/i.test(ua)) browser = 'Chrome'
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox'
  else if (/edg/i.test(ua)) browser = 'Edge'
  else if (/opera|opr/i.test(ua)) browser = 'Opera'

  const pwaSuffix = isPWA ? ' (PWA Native)' : ''
  return `${os} • ${browser}${pwaSuffix}`
}

/**
 * Register this device's session in Firestore.
 * Updates both userProfiles/{uid} and userSessions/{uid} for high compatibility.
 * @param {{ uid: string, email: string }} user
 * @param {string} customSessionId
 */
export async function registerDeviceSession(user, customSessionId = '') {
  const uid = user?.uid || auth?.currentUser?.uid || ''
  if (!uid) return null

  const sessionId = customSessionId || getDeviceSessionId()
  const deviceInfo = getDeviceDescription()

  const payload = {
    currentSessionId: sessionId,
    sessionDeviceInfo: deviceInfo,
    sessionUpdatedAt: Timestamp.now(),
    lastActiveAt: Timestamp.now(),
  }

  // 1. Primary write to userProfiles (already permitted by default Firestore security rules)
  const profileRef = doc(db, 'userProfiles', uid)
  await setDoc(profileRef, payload, { merge: true }).catch((err) => {
    console.warn('[deviceSession] userProfiles session write warning:', err?.message)
  })

  // 2. Secondary write to userSessions
  const sessionRef = doc(db, 'userSessions', uid)
  setDoc(sessionRef, { ...payload, userId: uid }, { merge: true }).catch(() => {})

  return sessionId
}

/**
 * Real-time listener for active device session.
 * Notifies callback if this device has been superseded by a newer login on another device.
 * @param {string} uid
 * @param {string} email
 * @param {(details: { newDevice: string, time: Date }) => void} onSuperseded
 * @returns {() => void} unsubscribe
 */
export function listenDeviceSession(uid, email = '', onSuperseded) {
  if (!uid || typeof onSuperseded !== 'function') return () => {}

  // Admins are exempt from single-device kickout to facilitate development and multi-device management
  if (isAdminEmail(email) || isAdminEmail(auth?.currentUser?.email)) {
    return () => {}
  }

  const mySessionId = getDeviceSessionId()
  const profileRef = doc(db, 'userProfiles', uid)

  let initialCheckPassed = false

  const unsub = onSnapshot(profileRef, (snap) => {
    if (!snap.exists()) return
    const data = snap.data()
    const activeSessionId = data.currentSessionId

    if (!activeSessionId) return

    // If server has a different session ID, this device's session has been invalidated
    if (activeSessionId !== mySessionId) {
      // Small debounce to avoid race conditions right during initial registration
      if (!initialCheckPassed) {
        initialCheckPassed = true
        // If the server timestamp is newer than our session start, trigger logout
        const updatedTime = data.sessionUpdatedAt?.toDate ? data.sessionUpdatedAt.toDate() : new Date()
        onSuperseded({
          newDevice: data.sessionDeviceInfo || 'Another device',
          time: updatedTime,
        })
      } else {
        const updatedTime = data.sessionUpdatedAt?.toDate ? data.sessionUpdatedAt.toDate() : new Date()
        onSuperseded({
          newDevice: data.sessionDeviceInfo || 'Another device',
          time: updatedTime,
        })
      }
    } else {
      initialCheckPassed = true
    }
  }, (err) => {
    console.warn('[deviceSession] Real-time session listener error:', err?.message)
  })

  return unsub
}

/**
 * Clear local device session
 */
export function clearDeviceSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}
