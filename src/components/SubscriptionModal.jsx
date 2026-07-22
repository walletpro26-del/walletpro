import { useState } from 'react'
import { loadRazorpaySDK, activateSubscription } from '../api/subscription'

export default function SubscriptionModal({
  user,
  subscription,
  onClose,
  onSubscriptionSuccess,
  isBlocking = false,
}) {
  const [loadingPlan, setLoadingPlan] = useState('')
  const [error, setError] = useState('')

  async function handleSubscribe(plan) {
    setError('')
    setLoadingPlan(plan)

    try {
      const sdkLoaded = await loadRazorpaySDK()
      if (!sdkLoaded) {
        throw new Error('Failed to load Razorpay SDK. Please check your internet connection.')
      }

      const isYearly = plan === 'yearly'
      const amountPaise = isYearly ? 15000 : 2000 // ₹150 or ₹20 in paise
      const planTitle = isYearly ? 'WalletVibe Yearly Subscription (₹150/year)' : 'WalletVibe Monthly Subscription (₹20/month)'
      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_walletvibe'

      const options = {
        key: razorpayKey,
        amount: amountPaise,
        currency: 'INR',
        name: 'WalletVibe',
        description: planTitle,
        image: '/favicon.ico',
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#6366f1',
        },
        handler: async function (response) {
          try {
            setLoadingPlan('activating')
            const result = await activateSubscription(user, plan, response.razorpay_payment_id)
            if (result.success) {
              onSubscriptionSuccess?.(result)
              onClose?.()
            }
          } catch (err) {
            setError('Payment succeeded but activation failed: ' + err?.message)
          } finally {
            setLoadingPlan('')
          }
        },
        modal: {
          ondismiss: function () {
            setLoadingPlan('')
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (resp) {
        setError('Payment Failed: ' + (resp?.error?.description || 'Transaction cancelled'))
        setLoadingPlan('')
      })
      rzp.open()
    } catch (err) {
      setError(err?.message || 'Payment initiation failed')
      setLoadingPlan('')
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
      <div className="modal-container" style={{ maxWidth: 440, padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
            padding: '24px 20px',
            color: '#fff',
            position: 'relative',
          }}
        >
          {!isBlocking && (
            <button
              className="modal-close"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
              }}
              onClick={onClose}
            >
              <i className="fas fa-times" />
            </button>
          )}

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
              {isAdmin ? '👑' : '⭐'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>
                {isAdmin ? 'Admin Lifetime Access' : 'WalletVibe Pro Subscription'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a5b4fc' }}>
                {isAdmin
                  ? 'Unlimited free access granted to Admin email.'
                  : 'Unlock unlimited tracking, cloud backup, and PDF statements.'}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {error && (
            <div className="login-error" style={{ marginBottom: 16 }}>
              <i className="fas fa-exclamation-circle" />
              {error}
            </div>
          )}

          {isAdmin ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 16px',
                background: 'var(--emerald-50)',
                border: '1px solid var(--emerald-500)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <i className="fas fa-shield-alt" style={{ fontSize: 32, color: 'var(--emerald-600)', marginBottom: 8 }} />
              <h4 style={{ margin: '0 0 4px', color: 'var(--emerald-600)', fontWeight: 800 }}>
                Free Lifetime Admin Account
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                Logged in as <strong>{user?.email}</strong>. No payments required.
              </p>
            </div>
          ) : (
            <>
              {/* Feature list */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
                  Unlimited Expenses & Lending
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
                  WhatsApp & Email Ledger PDFs
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
                  Bank Statement Search & Import
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-check-circle" style={{ color: '#10b981' }} />
                  Secure Multi-Device Cloud Sync
                </div>
              </div>

              {/* Plans Grid */}
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Monthly Plan */}
                <div
                  style={{
                    border: '2px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--bg-card)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Monthly Pass
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginTop: 2 }}>
                      ₹20 <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/ month</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      30 days full access
                    </div>
                  </div>

                  <button
                    onClick={() => handleSubscribe('monthly')}
                    disabled={!!loadingPlan}
                    className="btn-primary"
                    style={{ padding: '10px 16px', fontSize: 13 }}
                  >
                    {loadingPlan === 'monthly' ? (
                      <i className="fas fa-spinner fa-spin" />
                    ) : (
                      'Subscribe'
                    )}
                  </button>
                </div>

                {/* Yearly Plan (BEST VALUE) */}
                <div
                  style={{
                    border: '2px solid #6366f1',
                    borderRadius: 'var(--radius-lg)',
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(124,58,237,0.06) 100%)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      right: 16,
                      background: '#6366f1',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 99,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Best Value &middot; Save ₹90
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>
                      Annual Saver
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginTop: 2 }}>
                      ₹150 <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/ year</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      365 days full access (just ₹12.5/mo)
                    </div>
                  </div>

                  <button
                    onClick={() => handleSubscribe('yearly')}
                    disabled={!!loadingPlan}
                    className="btn-primary"
                    style={{
                      padding: '10px 16px',
                      fontSize: 13,
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    }}
                  >
                    {loadingPlan === 'yearly' ? (
                      <i className="fas fa-spinner fa-spin" />
                    ) : (
                      'Subscribe'
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          <div
            style={{
              textAlign: 'center',
              marginTop: 16,
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <i className="fas fa-lock" style={{ fontSize: 9 }} />
            256-bit encrypted checkout by Razorpay (UPI, GPay, PhonePe, Cards, NetBanking)
          </div>
        </div>
      </div>
    </div>
  )
}
