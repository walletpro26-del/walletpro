import { useEffect, useState, useRef } from 'react'

export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [newVersion, setNewVersion] = useState('')
  const currentVersionRef = useRef('')

  useEffect(() => {
    // In development mode, bypass update banners entirely
    if (import.meta.env.DEV) return

    let isMounted = true

    // Fetch the version active when this session started
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ version }) => {
        if (!isMounted || !version) return
        currentVersionRef.current = version
        localStorage.setItem('wv_app_version', version)
      })
      .catch(() => {})

    // Listen for messages from the service worker (only APP_UPDATED, never SW_ACTIVATED)
    function handleSWMessage(event) {
      if (event.data?.type === 'APP_UPDATED' && event.data?.version) {
        const incomingVersion = event.data.version
        const activeVersion = currentVersionRef.current || localStorage.getItem('wv_app_version')
        if (activeVersion && incomingVersion !== activeVersion) {
          setShowUpdate(true)
          setNewVersion(incomingVersion)
        }
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    // Periodically poll version.json (every 10 minutes) during an extended active session
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        const activeVersion = currentVersionRef.current || localStorage.getItem('wv_app_version')
        if (activeVersion && version && version !== activeVersion) {
          setShowUpdate(true)
          setNewVersion(version)
        }
      } catch (_) {}
    }, 10 * 60 * 1000)

    // Ping SW to check version
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CHECK_VERSION' })
    }

    return () => {
      isMounted = false
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
      clearInterval(interval)
    }
  }, [])

  function handleReload() {
    if (newVersion) localStorage.setItem('wv_app_version', newVersion)
    window.location.reload()
  }

  function handleDismiss() {
    if (newVersion) localStorage.setItem('wv_app_version', newVersion)
    setShowUpdate(false)
  }

  if (!showUpdate) return null

  return (
    <div className="update-banner" role="alert" aria-live="polite">
      <div className="update-banner-inner">
        <div className="update-banner-icon-box">
          <i className="fas fa-sparkles update-banner-icon" />
          <span className="update-banner-pulse" />
        </div>
        <div className="update-banner-text">
          <span className="update-banner-title">Update Available</span>
          <span className="update-banner-desc">A newer version of WalletVibe is ready.</span>
        </div>
        <div className="update-banner-actions">
          <button type="button" className="update-btn-reload" onClick={handleReload}>
            <i className="fas fa-arrow-rotate-right" /> Update Now
          </button>
          <button type="button" className="update-btn-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

