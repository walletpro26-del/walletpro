import { useState, useEffect, lazy, Suspense } from 'react'
import { signInWithGoogle } from '../api/auth'
import { listenAppConfig } from '../api/appConfig'
import WalletVibeLogo from './WalletVibeLogo'

const LegalModal = lazy(() => import('./LegalModal'))
const PreLoginFeaturesModal = lazy(() => import('./PreLoginFeaturesModal'))


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
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-logo-wrapper">
            <div className="login-logo-glow" />
            <WalletVibeLogo size={52} variant="icon" animate={false} className="login-logo-svg" />
          </div>
          <h1 className="login-brand">
            <span className="login-brand-wallet">Wallet</span>
            <span className="login-brand-vibe">Vibe</span>
          </h1>
          <p className="login-tagline">Smart Personal Finance &amp; Wealth Management</p>
        </div>

        {/* Unified Interactive Features Preview */}
        <button
          type="button"
          className="login-features-preview"
          onClick={() => setShowFeaturesModal(true)}
          title="Click to explore all features &amp; capabilities"
        >
          <div className="features-preview-chips">
            <span className="preview-chip chip-expenses"><i className="fas fa-receipt" /> Expenses</span>
            <span className="preview-chip chip-lending"><i className="fas fa-handshake" /> Lending</span>
            <span className="preview-chip chip-bank"><i className="fas fa-brain" /> Bank &amp; AI</span>
            <span className="preview-chip chip-reports"><i className="fas fa-chart-pie" /> Reports</span>
          </div>
          <div className="features-preview-action">
            <span>Explore App Features</span>
            <i className="fas fa-arrow-right" />
          </div>
        </button>

        {/* Subscriber Limit Capacity Info Banner */}
        {isLimitReached && (
          <div className="login-limit-banner">
            <div className="limit-banner-title">
              <i className="fas fa-exclamation-triangle" />
              <span>Registration Full ({activeSubscriberCount} / {subscriberLimit})</span>
            </div>
            <p className="limit-banner-desc">
              Online user registration is currently closed because the capacity limit has been reached. Existing registered users can sign in normally below.
            </p>
            <div className="limit-banner-actions">
              <a
                href="mailto:walletpro26@gmail.com?subject=WalletVibe%20Pro%20New%20User%20Registration%20Request"
                className="limit-btn-contact"
              >
                <i className="fas fa-envelope" /> Contact Admin
              </a>
              <button
                type="button"
                onClick={handleCopyAdminEmail}
                className="limit-btn-copy"
              >
                <i className={`fas ${copiedEmail ? 'fa-check' : 'fa-copy'}`} />
                {copiedEmail ? 'Copied' : 'Copy Email'}
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="login-error">
            <div className="login-error-msg">
              <i className="fas fa-circle-exclamation" />
              <span>{error}</span>
            </div>
            {error.includes('Registration Closed') && (
              <div className="login-error-actions">
                <a
                  href="mailto:walletpro26@gmail.com?subject=WalletVibe%20Pro%20Registration%20Access%20Request"
                  className="limit-btn-contact"
                >
                  <i className="fas fa-envelope" /> Email Admin
                </a>
                <button
                  type="button"
                  onClick={handleCopyAdminEmail}
                  className="limit-btn-copy"
                >
                  {copiedEmail ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Google Sign In — Primary CTA */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="login-google-btn"
          type="button"
        >
          {loading ? (
            <>
              <i className="fas fa-spinner fa-spin" />
              <span>Signing in securely...</span>
            </>
          ) : (
            <>
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                width="20"
                height="20"
              />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {/* Security & Privacy Badge */}
        <div className="login-secure-note">
          <i className="fas fa-shield-check" />
          <span>256-bit Encrypted &middot; Secured by Firebase</span>
        </div>
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

      {/* Legal & Pre-Login Modals */}
      <Suspense fallback={null}>
        {legalModalTab && (
          <LegalModal
            initialTab={legalModalTab}
            onClose={closeLegalModal}
          />
        )}

        {showFeaturesModal && (
          <PreLoginFeaturesModal
            onClose={() => setShowFeaturesModal(false)}
          />
        )}
      </Suspense>
    </div>
  )
}
