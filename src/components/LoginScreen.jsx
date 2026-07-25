import { useState, useEffect } from 'react'
import { signInWithGoogle } from '../api/auth'
import WalletVibeLogo from './WalletVibeLogo'
import LegalModal from './LegalModal'
import PreLoginFeaturesModal from './PreLoginFeaturesModal'

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [legalModalTab, setLegalModalTab] = useState(null)
  const [showFeaturesModal, setShowFeaturesModal] = useState(false)

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
