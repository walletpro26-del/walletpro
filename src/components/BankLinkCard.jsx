import { useState, useEffect } from 'react'
import { createBankConsent, confirmBankConsent, revokeBankConsent, getBankSyncStatus, triggerManualBankSync } from '../api/bankLink'
import { hasUltraAccess } from '../api/subscription'

export default function BankLinkCard({ subscription, appConfig, onOpenSubscriptionModal, onSyncComplete }) {
  const [status, setStatus] = useState({ linked: false, status: 'CHECKING', bankName: '', lastSyncedAt: null })
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const isUltraUser = hasUltraAccess(subscription)
  // Check if Ultra tier feature is enabled in admin settings and ready to use
  const isUltraActive = Boolean(appConfig?.ultraEnabled && !appConfig?.ultraComingSoon)

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await getBankSyncStatus()
      setStatus(res)
    } catch (err) {
      console.warn('[BankLinkCard] Status fetch error:', err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handle callback if redirected back from Setu consent page
  useEffect(() => {
    async function checkCallback() {
      const params = new URLSearchParams(window.location.search)
      const action = params.get('action')
      const consentId = params.get('consentId')

      if (action === 'bank-linked' && consentId) {
        setLinking(true)
        try {
          const res = await confirmBankConsent(consentId)
          if (res.success) {
            setToast(`🎉 Successfully linked ${res.bankName || 'your bank account'}!`)
            await loadStatus()
            onSyncComplete?.()
          }
        } catch (err) {
          setError('Bank link verification error: ' + err.message)
        } finally {
          setLinking(false)
          window.history.replaceState(null, '', window.location.pathname)
        }
      } else {
        loadStatus()
      }
    }
    checkCallback()
  }, [])

  async function handleLinkBank() {
    if (!isUltraUser) {
      onOpenSubscriptionModal?.()
      return
    }

    setError('')
    setLinking(true)
    try {
      const res = await createBankConsent()
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
      } else {
        throw new Error('Redirect URL not received from bank server')
      }
    } catch (err) {
      setError(err.message || 'Could not launch bank consent flow')
      setLinking(false)
    }
  }

  async function handleSyncNow() {
    setError('')
    setSyncing(true)
    try {
      const res = await triggerManualBankSync()
      setToast(`⚡ ${res.message || 'Transactions synced!'}`)
      await loadStatus()
      onSyncComplete?.()
    } catch (err) {
      setError(err.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleUnlinkBank() {
    if (!window.confirm('Are you sure you want to disconnect automatic bank transaction sync?')) return
    setError('')
    setUnlinking(true)
    try {
      await revokeBankConsent()
      setToast('Disconnected bank sync successfully.')
      await loadStatus()
    } catch (err) {
      setError(err.message || 'Failed to disconnect bank')
    } finally {
      setUnlinking(false)
    }
  }

  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('wv_hide_coming_soon_bank_banner') === 'true'
  })

  function handleDismiss() {
    setDismissed(true)
    try {
      localStorage.setItem('wv_hide_coming_soon_bank_banner', 'true')
    } catch (e) {}
  }

  if (loading) {
    return (
      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 12, fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="fas fa-spinner fa-spin" /> Checking Bank Sync Connection...
      </div>
    )
  }

  // 1. If Ultra is NOT enabled or set to "Coming Soon" by admin, show compact info banner with dismiss button
  if (!isUltraActive && !status.linked) {
    if (dismissed || appConfig?.hideUltraBanner) return null

    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.08))',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 12,
        padding: '8px 12px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚡</span>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>Automatic Bank Transaction Sync</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', marginLeft: 6 }}>(Account Aggregator)</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 99,
            background: 'rgba(139, 92, 246, 0.15)',
            color: '#8b5cf6',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            whiteSpace: 'nowrap',
          }}>
            COMING SOON
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            title="Hide Coming Soon banner"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '2px 4px',
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // 2. Active Ultra / Linked State
  return (
    <div style={{
      background: status.linked
        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(5, 150, 105, 0.08))'
        : 'linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(99, 102, 241, 0.08))',
      border: `1px solid ${status.linked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`,
      borderRadius: 12,
      padding: '10px 12px',
      marginBottom: 12,
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{ padding: '4px 8px', borderRadius: 6, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{toast}</span>
          <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: 10, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Compact Banner Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: status.linked ? '#10b981' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
          }}>
            🏦
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span>{status.linked ? status.bankName || 'Linked Bank' : 'Auto Bank Sync'}</span>
              <span style={{ fontSize: 8, background: status.linked ? '#10b981' : '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 99, fontWeight: 800, flexShrink: 0 }}>
                {status.linked ? 'ACTIVE' : 'ULTRA'}
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {status.linked
                ? `Last Synced: ${status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}`
                : '1-Click RBI-regulated Setu Account Aggregator'}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ flexShrink: 0 }}>
          {status.linked ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                style={{
                  padding: '5px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6,
                  fontSize: 10, fontWeight: 800, cursor: syncing ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <i className={`fas ${syncing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
                {syncing ? 'Syncing' : 'Sync'}
              </button>
              <button
                type="button"
                onClick={handleUnlinkBank}
                disabled={unlinking}
                style={{
                  padding: '5px 8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 6,
                  fontSize: 10, fontWeight: 800, cursor: unlinking ? 'not-allowed' : 'pointer',
                }}
              >
                {unlinking ? '...' : 'Unlink'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLinkBank}
              disabled={linking}
              style={{
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 10.5, fontWeight: 800,
                cursor: linking ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
              }}
            >
              {linking ? (
                <><i className="fas fa-spinner fa-spin" /> Redirecting...</>
              ) : isUltraUser ? (
                <><i className="fas fa-link" /> Link Bank</>
              ) : (
                <><i className="fas fa-crown" /> Upgrade Ultra</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
