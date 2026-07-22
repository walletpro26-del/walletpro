import { useState, useEffect } from 'react'
import {
  submitUpiPayment,
  DEFAULT_MERCHANT_UPI,
  MERCHANT_NAME,
  MERCHANT_PHONE,
} from '../api/subscription'

export default function SubscriptionModal({
  user,
  subscription,
  appConfig,
  onClose,
  onLogout,
  onSubscriptionSuccess,
  isBlocking = false,
}) {
  const [selectedPlan, setSelectedPlan] = useState('yearly')
  const [step, setStep] = useState('select') // 'select' | 'success'

  const merchantUpi = appConfig?.merchantUpi || DEFAULT_MERCHANT_UPI
  const monthlyPrice = appConfig?.monthlyPrice || 20
  const yearlyPrice = appConfig?.yearlyPrice || 150
  const amount = selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice

  const [orderId, setOrderId] = useState('')
  useEffect(() => {
    setOrderId(`WV_ORD_${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`)
  }, [selectedPlan])

  const [utr, setUtr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activationResult, setActivationResult] = useState(null)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [payMode, setPayMode] = useState('app') // 'app' | 'qr'

  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantUpi)}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&tn=${encodeURIComponent(orderId)}&cu=INR`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`

  async function handleSubmitUTR(e) {
    e?.preventDefault()
    setError('')
    const cleanUtr = String(utr || '').trim()
    if (cleanUtr.length !== 12 || !/^\d{12}$/.test(cleanUtr)) {
      setError('Enter a valid 12-digit UTR number.')
      return
    }
    setSubmitting(true)
    try {
      const res = await submitUpiPayment({ user, plan: selectedPlan, amount, utr: cleanUtr })
      if (res.success) {
        setActivationResult(res)
        setStep('success')
        onSubscriptionSuccess?.(res)
      }
    } catch (err) {
      setError(err?.message || 'Failed to activate. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isAdmin = subscription?.isAdmin
  const s = (obj) => obj // style helper

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="modal-backdrop" onClick={() => { if (!isBlocking) onClose?.() }} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          maxWidth: 420,
          width: '94%',
          maxHeight: '95dvh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 14,
          overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── Compact Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
          padding: '14px 16px',
          color: '#fff',
          position: 'relative',
          flexShrink: 0,
        }}>
          {/* Close / Logout button */}
          {!isBlocking || step === 'success' ? (
            <button
              className="modal-close"
              style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(255,255,255,0.12)', color: '#fff', width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              onClick={onClose}
              aria-label="Close"
            >
              <i className="fas fa-times" />
            </button>
          ) : onLogout ? (
            <button
              onClick={() => { onClose?.(); onLogout() }}
              style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(239,68,68,0.3)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <i className="fas fa-sign-out-alt" /> Log Out
            </button>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 70 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
              {isAdmin ? '👑' : step === 'success' ? '🎉' : '⚡'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>
                {isAdmin ? 'Admin Access' : step === 'success' ? 'Activated!' : 'WalletVibe Pro'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#a5b4fc', lineHeight: 1.2 }}>
                {isAdmin ? 'Free lifetime admin access' : step === 'success' ? 'Your account is upgraded' : '0% Commission • Instant UPI Activation'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '12px 14px', flex: 1 }}>

          {/* User email bar (compact) */}
          {user?.email && step !== 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10, fontSize: 11, padding: '6px 10px', background: 'var(--bg-body, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary, #1e293b)' }}>
                <i className="fas fa-user-circle" style={{ color: '#6366f1', marginRight: 5, fontSize: 12 }} />
                {user.email}
              </div>
              {onLogout && (
                <button type="button" onClick={() => { onClose?.(); onLogout() }}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Switch
                </button>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 11, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* ── ADMIN ── */}
          {isAdmin ? (
            <div style={{ textAlign: 'center', padding: '16px 12px', background: 'rgba(16,185,129,0.08)', border: '1px solid #10b981', borderRadius: 10 }}>
              <i className="fas fa-shield-alt" style={{ fontSize: 28, color: '#059669', marginBottom: 6, display: 'block' }} />
              <h4 style={{ margin: '0 0 4px', color: '#047857', fontWeight: 800, fontSize: 14 }}>Admin Lifetime Access</h4>
              <p style={{ margin: 0, fontSize: 11, color: '#065f46' }}>Logged in as <strong>{user?.email}</strong></p>
            </div>

          /* ── SUCCESS ── */
          ) : step === 'success' ? (
            <div style={{ textAlign: 'center', padding: '16px 12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>🎉</div>
              <h4 style={{ margin: '0 0 4px', color: '#047857', fontWeight: 800, fontSize: 16 }}>Subscription Activated!</h4>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#065f46' }}>Full access to all features unlocked.</p>
              <div style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 11, color: '#1e293b', border: '1px solid #a7f3d0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#64748b' }}>Plan:</span>
                  <strong>{selectedPlan.toUpperCase()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#64748b' }}>Order:</span>
                  <strong>{activationResult?.orderId || orderId}</strong>
                </div>
                {activationResult?.expiresAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Expires:</span>
                    <strong>{new Date(activationResult.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="btn-primary" style={{ width: '100%', padding: '10px', fontSize: 13, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 8, marginTop: 12 }}>
                <i className="fas fa-rocket" style={{ marginRight: 6 }} /> Start Using WalletVibe
              </button>
            </div>

          /* ── MAIN PAYMENT FLOW ── */
          ) : (
            <>
              {/* STEP 1: Plan Selection (compact inline pills) */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #475569)', marginBottom: 6 }}>
                  1. Choose Plan:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    onClick={() => setSelectedPlan('monthly')}
                    style={{
                      flex: 1,
                      border: `2px solid ${selectedPlan === 'monthly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'monthly' ? 'rgba(99,102,241,0.08)' : 'var(--bg-card, #fff)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Monthly</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 1 }}>
                      ₹{monthlyPrice}<span style={{ fontSize: 9, fontWeight: 500, color: '#64748b' }}>/mo</span>
                    </div>
                  </div>
                  <div
                    onClick={() => setSelectedPlan('yearly')}
                    style={{
                      flex: 1,
                      border: `2px solid ${selectedPlan === 'yearly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'yearly' ? 'rgba(99,102,241,0.08)' : 'var(--bg-card, #fff)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    <div style={{ position: 'absolute', top: -7, right: 6, background: '#10b981', color: '#fff', fontSize: 7, fontWeight: 900, padding: '1px 5px', borderRadius: 99 }}>
                      SAVE {Math.round((1 - (yearlyPrice / (monthlyPrice * 12))) * 100)}%
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Yearly</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 1 }}>
                      ₹{yearlyPrice}<span style={{ fontSize: 9, fontWeight: 500, color: '#64748b' }}>/yr</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 2: Pay via UPI or QR Code (Compact Tab Switcher) */}
              <div style={{ background: 'var(--bg-body, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>2. Pay ₹{amount}:</span>
                  
                  {/* Mode Tab Switcher: Pay via UPI | QR Code */}
                  <div style={{ display: 'flex', background: 'var(--border-color, #e2e8f0)', borderRadius: 6, padding: 2, gap: 2 }}>
                    <button
                      type="button"
                      onClick={() => setPayMode('app')}
                      style={{
                        border: 'none',
                        background: payMode === 'app' ? '#ffffff' : 'transparent',
                        color: payMode === 'app' ? '#2563eb' : '#64748b',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 5,
                        cursor: 'pointer',
                        boxShadow: payMode === 'app' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <i className="fas fa-mobile-alt" style={{ fontSize: 10 }} />
                      Pay via UPI
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayMode('qr')}
                      style={{
                        border: 'none',
                        background: payMode === 'qr' ? '#ffffff' : 'transparent',
                        color: payMode === 'qr' ? '#2563eb' : '#64748b',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 5,
                        cursor: 'pointer',
                        boxShadow: payMode === 'qr' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <i className="fas fa-qrcode" style={{ fontSize: 10 }} />
                      QR Code
                    </button>
                  </div>
                </div>

                {payMode === 'app' ? (
                  <>
                    {/* Pay via UPI App Button */}
                    <a
                      href={upiUri}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        width: '100%', padding: '9px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 12,
                        boxSizing: 'border-box', marginBottom: 6,
                      }}
                    >
                      <i className="fas fa-mobile-alt" /> Pay via UPI App (GPay / PhonePe / Paytm)
                    </a>

                    {/* Copy buttons row */}
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText(merchantUpi); setCopiedUpi(true); setTimeout(() => setCopiedUpi(false), 2500) }}
                        style={{ flex: 1, padding: '6px', background: copiedUpi ? '#10b981' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <i className={copiedUpi ? 'fas fa-check' : 'fas fa-copy'} />
                        {copiedUpi ? 'Copied ✅' : 'Copy UPI ID'}
                      </button>
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText('9682547458'); setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 2500) }}
                        style={{ flex: 1, padding: '6px', background: copiedPhone ? '#10b981' : '#0284c7', color: '#fff', border: 'none', borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <i className={copiedPhone ? 'fas fa-check' : 'fas fa-phone-alt'} />
                        {copiedPhone ? 'Copied ✅' : 'Pay to 9682547458'}
                      </button>
                    </div>
                  </>
                ) : (
                  /* QR Code Tab View */
                  <div style={{ textAlign: 'center', padding: '4px 0' }}>
                    <img
                      src={qrCodeUrl}
                      alt="UPI Payment Dynamic QR Code"
                      width="120"
                      height="120"
                      style={{
                        border: '2px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 4,
                        background: '#ffffff',
                      }}
                    />
                    <p style={{ fontSize: 9, color: '#64748b', marginTop: 3, margin: 0 }}>
                      Scan QR in any UPI app • VPA: <strong style={{ color: '#1e293b' }}>{merchantUpi}</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* STEP 3: UTR Activation (Stacked Full-Width Input & Button) */}
              <form onSubmit={handleSubmitUTR} style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid #10b981', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ background: '#10b981', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 99 }}>STEP 3</span>
                  <span style={{ fontSize: 10, color: '#047857', fontWeight: 800 }}>Enter 12-Digit UTR Number:</span>
                </div>
                
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="Enter 12-digit UTR (e.g. 420192837465)"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1.5px solid #10b981',
                    fontSize: 13,
                    letterSpacing: '1px',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#064e3b',
                    marginBottom: 8,
                  }}
                />
                
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '9px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  {submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin" />
                      Activating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-bolt" />
                      Activate Instantly
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Legal footer */}
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 9, color: 'var(--text-muted, #64748b)' }}>
            <div>
              <i className="fas fa-shield-alt" style={{ fontSize: 8, marginRight: 3, color: '#10b981' }} />
              0% Fee UPI • Managed by Sheikh Gulfam
            </div>
            <div style={{ marginTop: 2, opacity: 0.85 }}>
              By subscribing, you agree to our{' '}
              <a href="#terms" onClick={(e) => { e.preventDefault(); window.location.hash = '#terms' }} style={{ color: '#6366f1' }}>Terms</a>,{' '}
              <a href="#privacy" onClick={(e) => { e.preventDefault(); window.location.hash = '#privacy' }} style={{ color: '#6366f1' }}>Privacy</a> &amp;{' '}
              <a href="#refund" onClick={(e) => { e.preventDefault(); window.location.hash = '#refund' }} style={{ color: '#6366f1' }}>Refund Policy</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
