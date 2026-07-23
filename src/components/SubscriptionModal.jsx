import { useState, useEffect } from 'react'
import {
  listenSubscriptionStatus,
  loadRazorpaySDK,
  createRazorpayOptions,
  claimFreeTrial,
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

  const monthlyPrice = appConfig?.monthlyPrice || 20
  const yearlyPrice = appConfig?.yearlyPrice || 150
  const amount = selectedPlan === 'yearly' ? yearlyPrice : monthlyPrice

  const [orderId, setOrderId] = useState('')
  useEffect(() => {
    setOrderId(`WV_ORD_${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`)
  }, [selectedPlan])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [activationResult, setActivationResult] = useState(null)

  // Real-time listener: watch subscription status
  useEffect(() => {
    if (!user?.uid) return
    const unsub = listenSubscriptionStatus(user.uid, (sub) => {
      if (sub.status === 'active' && sub.active) {
        setActivationResult({
          orderId: sub.orderId || orderId,
          expiresAt: sub.expiresAt,
        })
        setStep('success')
        onSubscriptionSuccess?.(sub)
      }
    })
    return unsub
  }, [user?.uid])

  async function handleRazorpayCheckout() {
    setError('')
    setSubmitting(true)
    try {
      const loaded = await loadRazorpaySDK()
      if (!loaded) {
        throw new Error('Failed to load Razorpay payment gateway. Please check your network connection.')
      }

      const options = createRazorpayOptions({
        user,
        plan: selectedPlan,
        amount,
        razorpayKey: appConfig?.razorpayKeyId,
        onSuccess: (result) => {
          setActivationResult(result)
          setStep('success')
          onSubscriptionSuccess?.(result)
        },
        onError: (err) => {
          setError(err?.message || 'Razorpay payment cancelled or failed.')
        },
      })

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        setError(resp?.error?.description || 'Payment failed')
      })
      rzp.open()
    } catch (err) {
      setError(err?.message || 'Could not launch payment gateway')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClaimTrial() {
    setError('')
    setSubmitting(true)
    try {
      const res = await claimFreeTrial(user)
      if (res.success) {
        setActivationResult(res)
        setStep('success')
        onSubscriptionSuccess?.(res)
      }
    } catch (err) {
      setError(err?.message || 'Failed to claim free trial.')
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
          {!isBlocking || step === 'success' || step === 'pending' ? (
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
              {isAdmin ? '👑' : step === 'success' ? '🎉' : step === 'pending' ? '⏳' : '⚡'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>
                {isAdmin ? 'Admin Access' : step === 'success' ? 'Activated!' : step === 'pending' ? 'Pending Verification' : 'WalletVibe Pro'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#a5b4fc', lineHeight: 1.2 }}>
                {isAdmin ? 'Free lifetime admin access' : step === 'success' ? 'Your account is upgraded' : step === 'pending' ? 'Admin will verify your payment' : '0% Commission • UPI Activation'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '12px 14px', flex: 1 }}>

          {/* User email bar (compact) */}
          {user?.email && step !== 'success' && step !== 'pending' && (
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

          ) : (
            <>
              {/* App Features List */}
              <div style={{ marginBottom: 16, background: 'var(--bg-body, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted, #64748b)', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>WalletVibe Pro Features</span>
                  <a href="/WalletVibe_Pro_Features.pdf" target="_blank" download style={{ textTransform: 'none', color: '#6366f1', textDecoration: 'none', fontWeight: 700, fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <i className="fas fa-file-pdf" style={{ fontSize: 10 }} /> Features.pdf
                  </a>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 10 }}>
                    <span style={{ fontSize: 11, background: '#e0e7ff', padding: '3px 5px', borderRadius: 6 }}>🚀</span>
                    <div>
                      <strong style={{ color: 'var(--text-primary, #1e293b)', display: 'block', fontSize: 10 }}>Unlimited Logs</strong>
                      <span style={{ color: '#64748b', fontSize: 8.5 }}>Record infinite cash flows</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 10 }}>
                    <span style={{ fontSize: 11, background: '#e0e7ff', padding: '3px 5px', borderRadius: 6 }}>📊</span>
                    <div>
                      <strong style={{ color: 'var(--text-primary, #1e293b)', display: 'block', fontSize: 10 }}>Visual Charts</strong>
                      <span style={{ color: '#64748b', fontSize: 8.5 }}>Deep visual breakdown</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 10 }}>
                    <span style={{ fontSize: 11, background: '#e0e7ff', padding: '3px 5px', borderRadius: 6 }}>💾</span>
                    <div>
                      <strong style={{ color: 'var(--text-primary, #1e293b)', display: 'block', fontSize: 10 }}>Real-time Sync</strong>
                      <span style={{ color: '#64748b', fontSize: 8.5 }}>Secure cloud database</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 10 }}>
                    <span style={{ fontSize: 11, background: '#e0e7ff', padding: '3px 5px', borderRadius: 6 }}>📥</span>
                    <div>
                      <strong style={{ color: 'var(--text-primary, #1e293b)', display: 'block', fontSize: 10 }}>Reports Export</strong>
                      <span style={{ color: '#64748b', fontSize: 8.5 }}>Premium PDF/Excel sheets</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3-Day Free Trial Action Card */}
              {!subscription?.trialClaimed && (
                <div style={{
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.12))',
                  border: '1.5px dashed #10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🎁 Free Trial Available!
                    </div>
                    <div style={{ fontSize: 9, color: '#065f46', marginTop: 2 }}>
                      Get 3 days of Pro access completely free
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClaimTrial}
                    disabled={submitting}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 6px rgba(16,185,129,0.2)'
                    }}
                  >
                    {submitting ? 'Claiming...' : 'Claim 3D Free'}
                  </button>
                </div>
              )}

              {/* STEP 1: Plan Selection */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #64748b)', marginBottom: 8 }}>
                  Select a subscription plan
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Monthly Card */}
                  <div
                    onClick={() => setSelectedPlan('monthly')}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${selectedPlan === 'monthly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'monthly' ? 'var(--bg-card-active, rgba(99,102,241,0.04))' : 'var(--bg-card, #ffffff)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: selectedPlan === 'monthly' ? '0 4px 12px rgba(99,102,241,0.06)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 800, color: selectedPlan === 'monthly' ? '#6366f1' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Pass</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 4 }}>
                      ₹{monthlyPrice}<span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>/mo</span>
                    </div>
                  </div>

                  {/* Yearly Card */}
                  <div
                    onClick={() => setSelectedPlan('yearly')}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${selectedPlan === 'yearly' ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`,
                      background: selectedPlan === 'yearly' ? 'var(--bg-card-active, rgba(99,102,241,0.04))' : 'var(--bg-card, #ffffff)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative',
                      boxShadow: selectedPlan === 'yearly' ? '0 4px 12px rgba(99,102,241,0.06)' : 'none',
                    }}
                  >
                    <div style={{ position: 'absolute', top: -7, right: 8, background: '#10b981', color: '#fff', fontSize: 7, fontWeight: 900, padding: '2px 6px', borderRadius: 99, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      Save {Math.round((1 - (yearlyPrice / (monthlyPrice * 12))) * 100)}%
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: selectedPlan === 'yearly' ? '#6366f1' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Yearly Saver</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary, #1e293b)', marginTop: 4 }}>
                      ₹{yearlyPrice}<span style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>/yr</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 2: Checkout Action */}
              <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #64748b)' }}>Secure Online Checkout</span>
                  <span style={{ fontSize: 8, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 8px', borderRadius: 99, fontWeight: 800, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Instant Grant</span>
                </div>

                {/* Razorpay Gateway Button */}
                {appConfig?.razorpayEnabled !== false && (
                  <button
                    type="button"
                    onClick={handleRazorpayCheckout}
                    disabled={submitting}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      width: '100%', padding: '12px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      color: '#ffffff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12,
                      cursor: 'pointer', transition: 'all 0.15s ease',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
                    }}
                  >
                    {submitting ? (
                      <><i className="fas fa-spinner fa-spin" /> Starting Secure Checkout...</>
                    ) : (
                      <><i className="fas fa-shield-alt" style={{ fontSize: 11 }} /> Continue to Pay ₹{amount}</>
                    )}
                  </button>
                )}

                {/* Cashfree Payment Gateway Button */}
                {appConfig?.cashfreeEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      alert(`Cashfree Gateway (${appConfig?.cashfreeMode === 'sandbox' ? 'TEST Mode' : 'LIVE Mode'}): Initiating payment session for ${selectedPlan?.toUpperCase()} (₹${amount})...`)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      width: '100%', padding: '12px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#ffffff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12,
                      cursor: 'pointer', transition: 'all 0.15s ease',
                      boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)', marginTop: appConfig?.razorpayEnabled !== false ? 8 : 0,
                    }}
                  >
                    <i className="fas fa-credit-card" style={{ fontSize: 11 }} /> Pay ₹{amount} via Cashfree
                  </button>
                )}

                <div style={{ fontSize: 8.5, color: '#94a3b8', marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <i className="fas fa-lock" /> PCI-DSS Compliant • 256-bit SSL secure payment connection
                </div>
              </div>
            </>
          )}

          {/* Legal footer */}
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 9, color: 'var(--text-muted, #64748b)' }}>
            <div>
              <i className="fas fa-check-circle" style={{ fontSize: 8, marginRight: 3, color: '#10b981' }} />
              Automated Subscription Activator
            </div>
            <div style={{ marginTop: 3, opacity: 0.8 }}>
              By subscribing, you agree to our{' '}
              <a href="#terms" onClick={(e) => { e.preventDefault(); window.location.hash = '#terms' }} style={{ color: '#6366f1', textDecoration: 'none' }}>Terms</a>,{' '}
              <a href="#privacy" onClick={(e) => { e.preventDefault(); window.location.hash = '#privacy' }} style={{ color: '#6366f1', textDecoration: 'none' }}>Privacy</a> &amp;{' '}
              <a href="#refund" onClick={(e) => { e.preventDefault(); window.location.hash = '#refund' }} style={{ color: '#6366f1', textDecoration: 'none' }}>Refunds</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
