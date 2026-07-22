import { useState, useEffect } from 'react'
import { signInWithGoogle } from '../api/auth'
import WalletVibeLogo from './WalletVibeLogo'
import LegalModal from './LegalModal'

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [legalModalTab, setLegalModalTab] = useState(null)

  function closeLegalModal() {
    setLegalModalTab(null)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

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
    <div className="login-screen">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      {/* Glassmorphic card */}
      <div className="login-card">
        {/* Logo with glow */}
        <div className="login-logo-area">
          <div className="login-logo-glow" />
          <WalletVibeLogo size={72} variant="icon" animate={true} className="login-logo-svg" />
        </div>

        {/* Brand name */}
        <h1 className="login-brand">
          <span className="login-brand-wallet">Wallet</span>
          <span className="login-brand-vibe">Vibe</span>
        </h1>
        <p className="login-tagline">Personal Finance, Simplified</p>

        {/* Feature pills */}
        <div className="login-features">
          <div className="login-feature-pill">
            <i className="fas fa-receipt" />
            <span>Expenses</span>
          </div>
          <div className="login-feature-pill">
            <i className="fas fa-handshake" />
            <span>Lending</span>
          </div>
          <div className="login-feature-pill">
            <i className="fas fa-chart-bar" />
            <span>Reports</span>
          </div>
          <div className="login-feature-pill">
            <i className="fas fa-university" />
            <span>Bank</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="login-error">
            <i className="fas fa-exclamation-circle" />
            {error}
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
      <div className="login-footer" style={{ textAlign: 'center', width: '100%', padding: '0 16px' }}>
        <div>© {new Date().getFullYear()} <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>NextLifTechnologies</a></div>
        <div className="login-footer-links">
          <a href="#privacy" onClick={(e) => { e.preventDefault(); setLegalModalTab('privacy') }}>Privacy Policy</a>
          <span style={{ opacity: 0.4 }}>•</span>
          <a href="#terms" onClick={(e) => { e.preventDefault(); setLegalModalTab('terms') }}>Terms &amp; Conditions</a>
          <span style={{ opacity: 0.4 }}>•</span>
          <a href="#refund" onClick={(e) => { e.preventDefault(); setLegalModalTab('refund') }}>Refund Policy</a>
          <span style={{ opacity: 0.4 }}>•</span>
          <a href="#contact" onClick={(e) => { e.preventDefault(); setLegalModalTab('contact') }}>Contact Us</a>
        </div>
      </div>

      {/* Legal Modal */}
      {legalModalTab && (
        <LegalModal
          initialTab={legalModalTab}
          onClose={closeLegalModal}
        />
      )}
    </div>
  )
}
