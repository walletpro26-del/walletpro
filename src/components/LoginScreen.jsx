import { useState } from 'react'
import { signIn } from '../api/auth'

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

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-logo">
          <i className="fas fa-wallet"></i>
        </div>
        <div className="login-title">
          <h2>Welcome Back</h2>
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
            {loading ? 'Signing in...' : 'Access Wallet'}
          </button>
        </form>
      </div>
    </div>
  )
}
