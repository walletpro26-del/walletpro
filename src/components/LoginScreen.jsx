import { useState } from 'react'
import { signIn, signInWithGoogle } from '../api/auth'
import WalletVibeLogo from './WalletVibeLogo'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn(email, password)
      if (res.success) onLogin(res)
    } catch (err) {
      const code = err?.code || ''
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        setError('Invalid email or password')
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Please try again later.')
      } else {
        setError(err?.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      const res = await signInWithGoogle()
      if (res.success) onLogin(res)
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-logo-glow" />
          <WalletVibeLogo size={64} variant="icon" animate={true} className="login-logo-svg" />
        </div>

        <div className="login-title">
          <h2>
            <span className="login-brand-wallet">Wallet</span>
            <span className="login-brand-vibe">Vibe</span>
          </h2>
          <p>Secure Personal Finance</p>
        </div>

        {error && (
          <div className="error-banner" style={{ margin: '0 0 16px', fontSize: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div className="float-group">
            <input
              type="email"
              id="login-email"
              className="float-input"
              placeholder=" "
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <label htmlFor="login-email" className="float-label">Email Address</label>
          </div>

          <div className="float-group">
            <input
              type="password"
              id="login-pw"
              className="float-input"
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <label htmlFor="login-pw" className="float-label">Password</label>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Signing in...</>
            ) : (
              <><i className="fas fa-unlock-alt" style={{ marginRight: 6 }} />Access Wallet</>
            )}
          </button>

          <div className="login-divider"><span>OR</span></div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="google-signin-btn"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" style={{ width: 18, height: 18 }} />
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  )
}
