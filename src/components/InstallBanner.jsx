import { useEffect, useState } from 'react'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function checkIsPwaInstalled() {
  if (typeof window === 'undefined') return false
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')

  const isStorageSaved =
    localStorage.getItem('wv_pwa_installed_success') === 'true' ||
    localStorage.getItem('wv_pwa_installed') === 'true' ||
    localStorage.getItem('wv_app_installed') === 'true'

  return Boolean(isStandalone || isStorageSaved)
}

export function markPwaInstalled() {
  try {
    localStorage.setItem('wv_pwa_installed_success', 'true')
    localStorage.setItem('wv_pwa_installed', 'true')
    localStorage.setItem('wv_app_installed', 'true')
  } catch (e) {}
}

export function checkIsStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(checkIsStandaloneMode)
  const [isInstalled, setIsInstalled] = useState(checkIsPwaInstalled)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('wv_standalone_banner_shown') === 'true'
    } catch {
      return false
    }
  })

  const dismissBannerPermanently = () => {
    setDismissed(true)
    try {
      localStorage.setItem('wv_standalone_banner_shown', 'true')
    } catch (e) {}
  }

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      markPwaInstalled()
      setIsInstalled(true)
      setIsStandalone(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleMediaChange = (e) => {
      if (e.matches) {
        setIsStandalone(true)
        setIsInstalled(true)
        markPwaInstalled()
      }
    }
    mediaQuery.addEventListener?.('change', handleMediaChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener?.('change', handleMediaChange)
    }
  }, [])

  // Auto-mark standalone success banner as seen once so it doesn't reappear on subsequent app opens
  useEffect(() => {
    if ((isStandalone || isInstalled) && !dismissed) {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem('wv_standalone_banner_shown', 'true')
        } catch (e) {}
      }, 5000) // Automatically dismiss after 5s or on click
      return () => clearTimeout(timer)
    }
  }, [isStandalone, isInstalled, dismissed])

  // Case 1: App is installed and running in standalone native app mode
  if (isStandalone) {
    if (dismissed) return null
    return (
      <div style={{
        padding: '10px 14px', margin: '12px 14px 4px', borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.15))',
        border: '1px solid rgba(16,185,129,0.3)', color: 'var(--text-primary, #1e293b)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        boxShadow: '0 2px 8px rgba(16,185,129,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
            ✓
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#047857' }}>📱 Installed &amp; Running as Home Screen App</div>
            <div style={{ fontSize: 10, color: '#065f46', opacity: 0.9 }}>WalletVibe is ready on your device with full offline local cache support</div>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissBannerPermanently}
          style={{ background: 'transparent', border: 'none', color: '#047857', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '4px 6px' }}
          title="Dismiss status banner"
        >
          ✕
        </button>
      </div>
    )
  }

  // Case 2: App is installed on device (Recognized from prior install)
  if (isInstalled) {
    if (dismissed) return null
    return (
      <div style={{
        padding: '10px 14px', margin: '12px 14px 4px', borderRadius: 12,
        background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700 }}>
          <span style={{ fontSize: 14 }}>🎉</span>
          <div>
            <div><strong>WalletVibe App Installed &amp; Recognized!</strong></div>
            <div style={{ fontSize: 10, opacity: 0.9 }}>Launch directly from your phone app icon for full offline PWA experience.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissBannerPermanently}
          style={{ background: 'transparent', border: 'none', color: '#047857', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    )
  }

  if (dismissed) return null

  // Case 3: iOS Safari Guidance
  if (isIOS()) {
    return (
      <div style={{
        padding: '10px 14px', margin: '12px 14px 4px', borderRadius: 12,
        background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fas fa-mobile-alt" />
            <span>📱 Install WalletVibe on iPhone / iPad</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 10.5, color: 'var(--text-primary, #334155)' }}>
          <span>1. Tap Share button <i className="fas fa-share-square" style={{ color: '#007aff' }} /></span>
          <span>2. Tap "Add to Home Screen" <i className="fas fa-plus-square" style={{ color: '#007aff' }} /></span>
          <span>3. Open as native app!</span>
        </div>
      </div>
    )
  }

  // Case 4: Android / Desktop Chrome Install Prompt Banner
  if (!deferredPrompt) return null

  return (
    <div style={{
      padding: '10px 14px', margin: '12px 14px 4px', borderRadius: 12,
      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      color: '#ffffff', boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
          📲
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.2 }}>Install WalletVibe App</div>
          <div style={{ fontSize: 10, opacity: 0.9 }}>Add to Home Screen for fast offline access &amp; app experience</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={async () => {
            if (!deferredPrompt) return
            deferredPrompt.prompt()
            const choice = await deferredPrompt.userChoice
            if (choice?.outcome === 'accepted') {
              markPwaInstalled()
              setIsInstalled(true)
            }
            setDeferredPrompt(null)
          }}
          style={{
            padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ffffff',
            color: '#4f46e5', fontSize: 11, fontWeight: 900, cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
          }}
        >
          ⚡ Install App
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', padding: 4 }}
          title="Dismiss install banner"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
