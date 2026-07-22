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
  const [selectedPlan, setSelectedPlan] = useState('yearly') // 'monthly' | 'yearly'
  const [step, setStep] = useState('select') // 'select' | 'success'
  
  // Custom UPI merchant ID from config or default
  const merchantUpi = appConfig?.merchantUpi || DEFAULT_MERCHANT_UPI
  const monthlyPrice = appConfig?.monthlyPrice || 20
  const yearlyPrice = appConfig?.yearlyPrice || 150

  const amount = selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice

  // Generate unique Order ID
  const [orderId, setOrderId] = useState('')
  useEffect(() => {
    setOrderId(`WV_ORD_${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`)
  }, [selectedPlan])

  // UTR Form State
  const [utr, setUtr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activationResult, setActivationResult] = useState(null)

  // Build standard UPI Deep Link URL & Dynamic QR Code
  const upiUri = `upi://pay?pa=${encodeURIComponent(merchantUpi)}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&tn=${encodeURIComponent(orderId)}&cu=INR`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`

  async function handleSubmitUTR(e) {
    e?.preventDefault()
    setError('')

    const cleanUtr = String(utr || '').trim()
    if (cleanUtr.length !== 12 || !/^\d{12}$/.test(cleanUtr)) {
      setError('Please enter a valid 12-digit UTR / Bank Reference Number.')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitUpiPayment({
        user,
        plan: selectedPlan,
        amount,
        utr: cleanUtr,
      })

      if (res.success) {
        setActivationResult(res)
        setStep('success')
        onSubscriptionSuccess?.(res)
      }
    } catch (err) {
      setError(err?.message || 'Failed to submit UTR. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isAdmin = subscription?.isAdmin

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div
        className="modal-backdrop"
        onClick={() => {
          if (!isBlocking) onClose?.()
        }}
      />
      <div className="modal-container custom-scrollbar" style={{ maxWidth: 460, padding: 0, overflow: 'hidden', borderRadius: 16 }}>
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '22px 20px',
            color: '#fff',
            position: 'relative',
          }}
        >
          {!isBlocking || step === 'success' ? (
            <button
              className="modal-close"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={onClose}
              aria-label="Close subscription modal"
            >
              <i className="fas fa-times" />
            </button>
          ) : onLogout ? (
            <button
              onClick={() => {
                onClose?.()
                onLogout()
              }}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(239, 68, 68, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              title="Log out and sign in with another email"
            >
              <i className="fas fa-sign-out-alt" />
              Log Out
            </button>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {isAdmin ? '👑' : step === 'success' ? '🎉' : '⚡'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>
                {isAdmin
                  ? 'Admin Lifetime Access'
                  : step === 'success'
                  ? 'Subscription Active!'
                  : 'WalletVibe Instant UPI Access'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a5b4fc' }}>
                {isAdmin
                  ? 'Unlimited free access granted to Admin email.'
                  : step === 'success'
                  ? 'Your account has been fully upgraded.'
                  : 'Instant Activation &bull; 0% Commission Direct UPI'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          {/* User Account & Switch Email Bar */}
          {user?.email && step !== 'success' && (
            <div
              style={{
                background: 'var(--bg-body, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                <i className="fas fa-user-circle" style={{ fontSize: 16, color: '#6366f1', flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-muted, #64748b)', fontSize: 11 }}>Logged in as: </span>
                  <strong style={{ color: 'var(--text-primary, #1e293b)' }}>{user.email}</strong>
                </div>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.()
                    onLogout()
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                  title="Log out and switch to another Google account"
                >
                  <i className="fas fa-sign-out-alt" />
                  Switch Email
                </button>
              )}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <i className="fas fa-exclamation-circle" />
              {error}
            </div>
          )}

          {/* ADMIN DISPLAY */}
          {isAdmin ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                background: 'var(--emerald-50, #ecfdf5)',
                border: '1px solid var(--emerald-500, #10b981)',
                borderRadius: 12,
              }}
            >
              <i className="fas fa-shield-alt" style={{ fontSize: 36, color: '#059669', marginBottom: 8 }} />
              <h4 style={{ margin: '0 0 4px', color: '#047857', fontWeight: 800 }}>
                Free Lifetime Admin Account
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: '#065f46' }}>
                Logged in as <strong>{user?.email}</strong>. Full unrestricted access enabled.
              </p>
            </div>
          ) : step === 'success' ? (
            /* INSTANT ACTIVATION SUCCESS SCREEN */
            <div
              style={{
                textAlign: 'center',
                padding: '20px 16px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
              <h4 style={{ margin: '0 0 6px', color: '#047857', fontWeight: 800, fontSize: 18 }}>
                Subscription Activated!
              </h4>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#065f46', lineHeight: 1.5 }}>
                Your account is now fully active with unlimited access to all features.
              </p>

              <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 10, fontSize: 12, display: 'inline-block', color: '#1e293b', border: '1px solid #a7f3d0', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748b' }}>Plan:</span>
                  <strong>{selectedPlan.toUpperCase()} PASS</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748b' }}>Order ID:</span>
                  <strong>{activationResult?.orderId || orderId}</strong>
                </div>
                {activationResult?.expiresAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Expires On:</span>
                    <strong>{new Date(activationResult.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <button
                  onClick={onClose}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 14,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderRadius: 8,
                  }}
                >
                  <i className="fas fa-rocket" style={{ marginRight: 8 }} />
                  Start Using WalletVibe
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: SELECT PLAN */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #475569)', display: 'block', marginBottom: 8 }}>
                  1. Select Subscription Plan:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Monthly Plan */}
                  <div
                    onClick={() => setSelectedPlan('monthly')}
                    style={{
                      border: `2px solid ${selectedPlan === 'monthly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'monthly' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card, #ffffff)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Monthly Pass</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 2 }}>
                      ₹{monthlyPrice} <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>/ 30 days</span>
                    </div>
                  </div>

                  {/* Yearly Plan */}
                  <div
                    onClick={() => setSelectedPlan('yearly')}
                    style={{
                      border: `2px solid ${selectedPlan === 'yearly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'yearly' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card, #ffffff)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    <div style={{ position: 'absolute', top: -8, right: 8, background: '#10b981', color: '#fff', fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 99 }}>
                      SAVE {Math.round((1 - (yearlyPrice / (monthlyPrice * 12))) * 100)}%
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Annual Saver</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 2 }}>
                      ₹{yearlyPrice} <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>/ 1 Year</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PAYMENT SECTION */}
              <div
                style={{
                  background: 'var(--bg-body, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                    2. Pay ₹{amount} via any UPI App
                  </span>
                  <span style={{ fontSize: 10, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                    Order: {orderId}
                  </span>
                </div>

                {/* Mobile Intent Button */}
                <div style={{ marginBottom: 14 }}>
                  <a
                    href={upiUri}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '12px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      textAlign: 'center',
                      borderRadius: 10,
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: 14,
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    }}
                  >
                    <i className="fas fa-mobile-alt" style={{ fontSize: 16 }} />
                    Pay via UPI App (GPay / PhonePe / Paytm / BHIM)
                  </a>
                </div>

                <div style={{ textAlign: 'center', margin: '12px 0', color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                  — OR SCAN DYNAMIC QR CODE ON DESKTOP —
                </div>

                {/* QR Display */}
                <div style={{ textAlign: 'center', margin: '12px 0' }}>
                  <img
                    src={qrCodeUrl}
                    alt="UPI Payment Dynamic QR Code"
                    width="190"
                    height="190"
                    style={{
                      border: '2px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 8,
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    }}
                  />
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, margin: 0 }}>
                    Merchant UPI ID: <strong style={{ color: '#1e293b' }}>{merchantUpi}</strong>
                  </p>
                </div>

                {/* UTR Form */}
                <form onSubmit={handleSubmitUTR} style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 14, marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                    3. Enter 12-Digit Transaction UTR / Ref No:
                  </label>
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="e.g. 420192837465"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      marginBottom: 10,
                      fontSize: 14,
                      letterSpacing: '1px',
                      fontWeight: 600,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '11px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      fontSize: 14,
                      borderRadius: 8,
                    }}
                  >
                    {submitting ? (
                      <>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />
                        Activating Instant Access...
                      </>
                    ) : (
                      '⚡ Submit UTR & Activate Instantly'
                    )}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* Legal Footer Links */}
          <div
            style={{
              textAlign: 'center',
              marginTop: 12,
              fontSize: 10,
              color: 'var(--text-muted, #64748b)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <div>
              <i className="fas fa-shield-alt" style={{ fontSize: 9, marginRight: 4, color: '#10b981' }} />
              Instant 0% Fee UPI Activation &bull; Managed by Sheikh Gulfam
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
