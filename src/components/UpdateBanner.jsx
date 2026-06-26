import { useEffect, useState } from 'react'

export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [newVersion, setNewVersion] = useState('')

  useEffect(() => {
    // Listen for messages from the service worker
    function handleSWMessage(event) {
      if (event.data?.type === 'APP_UPDATED' || event.data?.type === 'SW_ACTIVATED') {
        // Only show update banner if the page has been open for a bit (not on fresh load)
        const openTime = window.__wv_open_time || Date.now()
        const age = Date.now() - openTime
        if (age > 5000) { // only show if app was open > 5s (not on first load)
          setShowUpdate(true)
          if (event.data?.version) setNewVersion(event.data.version)
        }
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    // Also poll version.json every 5 minutes to catch deploy without SW update
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        const stored = localStorage.getItem('wv_app_version')
        if (stored && stored !== version) {
          setShowUpdate(true)
          setNewVersion(version)
        } else if (!stored) {
          localStorage.setItem('wv_app_version', version)
        }
      } catch (_) {}
    }, 5 * 60 * 1000)

    // Initial version fetch — store without showing banner
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ version }) => {
        const stored = localStorage.getItem('wv_app_version')
        if (!stored) {
          localStorage.setItem('wv_app_version', version)
        } else if (stored !== version) {
          const openTime = window.__wv_open_time || Date.now()
          const age = Date.now() - openTime
          if (age > 3000) {
            setShowUpdate(true)
            setNewVersion(version)
          } else {
            localStorage.setItem('wv_app_version', version)
          }
        }
      })
      .catch(() => {})

    // Ping SW to check version
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CHECK_VERSION' })
    }

    return () => {
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
    <div className="update-banner" role="alert">
      <div className="update-banner-inner">
        <span className="update-banner-icon">🚀</span>
        <div className="update-banner-text">
          <strong>New version available!</strong>
          <span> Reload to get the latest features.</span>
        </div>
        <div className="update-banner-actions">
          <button className="update-btn-reload" onClick={handleReload}>
            Reload
          </button>
          <button className="update-btn-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
