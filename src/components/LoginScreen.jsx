import { useState, useEffect } from 'react'
import { signInWithGoogle } from '../api/auth'
import { listenAppConfig } from '../api/appConfig'
import WalletVibeLogo from './WalletVibeLogo'
import LegalModal from './LegalModal'
import PreLoginFeaturesModal from './PreLoginFeaturesModal'

export default function LoginScreen({ registrationError = '', appConfig: initialAppConfig = null }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(registrationError)
  const [appConfig, setAppConfig] = useState(initialAppConfig)
  const [legalModalTab, setLegalModalTab] = useState(null)
  const [showFeaturesModal, setShowFeaturesModal] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)

  useEffect(() => {
    setError(registrationError)
  }, [registrationError])

  useEffect(() => {
    if (!appConfig) {
      const unsub = listenAppConfig((cfg) => setAppConfig(cfg))
      return unsub
    }
  }, [appConfig])

  function handleCopyAdminEmail() {
    navigator.clipboard.writeText('walletpro26@gmail.com')
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 3000)
  }

  function closeLegalModal() {
    setLegalModalTab(null)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  const subscriberLimit = Number(appConfig?.subscriberLimit ?? 10)
  const isUnlimited = subscriberLimit <= 0
  const activeSubscriberCount = Number(appConfig?.activeSubscriberCount ?? 0)
  const isLimitReached = !isUnlimited && activeSubscriberCount >= subscriberLimit

  useEffect(() => {
    function handleHashOrQuery() {
      const hash = window.location.hash.replace('#', '').toLowerCase()
      const search = new URLSearchParams(window.location.search).get('page')
      const target = hash || search
      if (['privacy', 'terms', 'refund', 'contact'].includes(target)) {
        setLegalModalTab(target)
        if (hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
    }
    handleHashOrQuery()
    window.addEventListener('hashchange', handleHashOrQuery)
    return () => window.removeEventListener('hashchange', handleHashOrQuery)
  }, [])

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen custom-scrollbar">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      {/* Glassmorphic card */}
      <div className="login-card">
        {/* Logo with glow */}
        <div className="login-logo-area">
          <div className="login-logo-glow" />
          <WalletVibeLogo size={68} variant="icon" animate={true} className="login-logo-svg" />
        </div>

        {/* Brand name */}
        <h1 className="login-brand">
          <span className="login-brand-wallet">Wallet</span>
          <span className="login-brand-vibe">Vibe</span>
        </h1>
        <p className="login-tagline">Personal Finance, Simplified</p>

        {/* Interactive Feature pills */}
        <div className="login-features">
          <div className="login-feature-pill" style={{ cursor: 'pointer' }} onClick={() => setShowFeaturesModal(true)} title="Click to view details">
            <i className="fas fa-receipt" style={{ color: '#34d399' }} />
            <span>Expenses</span>
          </div>
          <div className="login-feature-pill" style={{ cursor: 'pointer' }} onClick={() => setShowFeaturesModal(true)} title="Click to view details">
            <i className="fas fa-handshake" style={{ color: '#fbbf24' }} />
            <span>Lending</span>
          </div>
          <div className="login-feature-pill" style={{ cursor: 'pointer' }} onClick={() => setShowFeaturesModal(true)} title="Click to view details">
            <i className="fas fa-chart-bar" style={{ color: '#38bdf8' }} />
            <span>Reports</span>
          </div>
          <div className="login-feature-pill" style={{ cursor: 'pointer' }} onClick={() => setShowFeaturesModal(true)} title="Click to view details">
            <i className="fas fa-university" style={{ color: '#c084fc' }} />
            <span>Bank &amp; AI</span>
          </div>
        </div>

        {/* Explore Features Button */}
        <button
          type="button"
          onClick={() => setShowFeaturesModal(true)}
          style={{
            margin: '0 0 24px',
            padding: '8px 16px',
            borderRadius: 99,
            border: '1px solid rgba(165, 180, 252, 0.4)',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          <i className="fas fa-layer-group" style={{ fontSize: 11 }} /> Explore App Features
        </button>

        {/* Subscriber Limit Capacity Info Banner */}
        {isLimitReached && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 16,
              textAlign: 'left',
              backdropFilter: 'blur(8px)',
              lineHeight: 1.4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#fca5a5', marginBottom: 4 }}>
              <i className="fas fa-exclamation-triangle" />
              <span>Registration &amp; Subscriptions Full ({activeSubscriberCount} / {subscriberLimit})</span>
            </div>
            <div style={{ color: 'rgba(254, 226, 226, 0.9)', fontSize: 10.5, marginBottom: 10 }}>
              Online user registration is currently closed because the maximum capacity of {subscriberLimit} active accounts has been reached. Existing registered users can log in normally. If you need a new account, please contact the admin for direct activation.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href="mailto:walletpro26@gmail.com?subject=WalletVibe%20Pro%20New%20User%20Registration%20Request"
                style={{
                  padding: '6px 12px', background: '#ef4444', color: '#fff',
                  borderRadius: 6, fontSize: 10.5, fontWeight: 800, textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(239,68,68,0.3)'
                }}
              >
                <i className="fas fa-envelope" /> Contact Admin
              </a>
              <button
                type="button"
                onClick={handleCopyAdminEmail}
                style={{
                  padding: '6px 12px', background: 'rgba(255,255,255,0.15)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 10.5,
                  fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                }}
              >
                <i className={`fas ${copiedEmail ? 'fa-check' : 'fa-copy'}`} />
                {copiedEmail ? 'Copied Email!' : 'Copy Admin Email'}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="login-error" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-exclamation-circle" />
              <span>{error}</span>
            </div>
            {error.includes('Registration Closed') && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <a
                  href="mailto:walletpro26@gmail.com?subject=WalletVibe%20Pro%20Registration%20Access%20Request"
                  style={{
                    padding: '4px 8px', background: '#ef4444', color: '#fff',
                    borderRadius: 4, fontSize: 10, fontWeight: 800, textDecoration: 'none',
                  }}
                >
                  ✉️ Email Admin
                </a>
                <button
                  type="button"
                  onClick={handleCopyAdminEmail}
                  style={{
                    padding: '4px 8px', background: 'rgba(255,255,255,0.2)', color: '#fff',
                    border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  {copiedEmail ? '✓ Copied' : '📋 Copy Email'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Google Sign In — the only login method */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="login-google-btn"
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin" />
              Signing in...
            </>
          ) : (
            <>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                width="20"
                height="20"
              />
              Continue with Google
            </>
          )}
        </button>

        {/* Security note */}
        <p className="login-secure-note">
          <i className="fas fa-shield-alt" />
          End-to-end encrypted &middot; Secured by Firebase
        </p>
      </div>

      {/* Footer */}
      <footer className="login-footer">
        <div>© {new Date().getFullYear()} <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>NextLifTechnologies</a></div>
        <div className="login-footer-links">
          <button type="button" onClick={() => setLegalModalTab('privacy')} style={{ background: 'none', border: 'none', color: 'rgba(226, 232, 240, 0.9)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: '4px 6px' }}>Privacy Policy</button>
          <span style={{ opacity: 0.4 }}>•</span>
          <button type="button" onClick={() => setLegalModalTab('terms')} style={{ background: 'none', border: 'none', color: 'rgba(226, 232, 240, 0.9)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: '4px 6px' }}>Terms &amp; Conditions</button>
          <span style={{ opacity: 0.4 }}>•</span>
          <button type="button" onClick={() => setLegalModalTab('refund')} style={{ background: 'none', border: 'none', color: 'rgba(226, 232, 240, 0.9)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: '4px 6px' }}>Refund Policy</button>
          <span style={{ opacity: 0.4 }}>•</span>
          <button type="button" onClick={() => setLegalModalTab('contact')} style={{ background: 'none', border: 'none', color: 'rgba(226, 232, 240, 0.9)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: '4px 6px' }}>Contact Us</button>
        </div>
      </footer>

      {/* Legal Modal */}
      {legalModalTab && (
        <LegalModal
          initialTab={legalModalTab}
          onClose={closeLegalModal}
        />
      )}

      {/* Pre-Login Features Modal */}
      {showFeaturesModal && (
        <PreLoginFeaturesModal
          onClose={() => setShowFeaturesModal(false)}
        />
      )}
    </div>
  )
}
