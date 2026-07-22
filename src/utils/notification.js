/**
 * Web & Mobile System Notification Bar Helper for WalletVibe
 */

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission()
      return permission
    } catch (e) {
      console.warn('[Notification] Permission request failed:', e?.message)
    }
  }
  return Notification.permission
}

export async function sendNativeNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  try {
    if (Notification.permission === 'granted') {
      // 1. Try Service Worker Notification if registered (best for mobile PWA bar)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'wv-notification',
            renotify: true,
            ...options,
          })
          return true
        }
      }
      // 2. Fallback to standard window Notification
      new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        ...options,
      })
      return true
    }
  } catch (err) {
    console.warn('[Notification] Failed to trigger notification:', err?.message)
  }
  return false
}
