import { useEffect, useState } from 'react'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    if (isIOS()) {
      setShowIOSHelp(true)
      return
    }

    const handlerBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handlerBeforeInstall)
    window.addEventListener('appinstalled', () => {
      setInstalled(true)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handlerBeforeInstall)
    }
  }, [])

  if (installed) return null

  // iOS: show guidance only
  if (showIOSHelp) {
    return (
      <div style={{ padding: 12, margin: 16, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Install on iPhone/iPad</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: '#9a3412', fontSize: 13 }}>
          <li>Tap Share button</li>
          <li>Tap “Add to Home Screen”</li>
          <li>Open it like an app</li>
        </ol>
      </div>
    )
  }

  // Android/desktop chrome: install CTA when available
  if (!deferredPrompt) return null

  return (
    <div style={{ padding: 12, margin: 16, borderRadius: 12, background: '#eef2ff', border: '1px solid #e0e7ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, marginBottom: 2 }}>Install WalletVibe</div>
          <div style={{ fontSize: 13, color: '#4f46e5' }}>Get an app-like experience on your device.</div>
        </div>
        <button
          onClick={async () => {
            if (!deferredPrompt) return
            deferredPrompt.prompt()
            const choice = await deferredPrompt.userChoice
            if (choice?.outcome === 'accepted') {
              // handled by appinstalled event
            }
            setDeferredPrompt(null)
          }}
          style={{ padding: '10px 14px', borderRadius: 12, border: '0', background: '#4f46e5', color: 'white', fontWeight: 900 }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
