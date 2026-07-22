import { useState, useEffect, useRef } from 'react'
import { getAppConfig, updateAppConfig, invalidateConfigCache } from '../api/appConfig'
import {
  isAdminEmail,
  ADMIN_EMAILS,
  getAllUpiPayments,
  getAllSubscriptions,
  revokeSubscription,
  reactivateSubscription,
  adminSetSubscriptionByEmailOrUid,
  approveUpiPayment,
  listenPendingPayments,
} from '../api/subscription'
import { requestNotificationPermission, sendNativeNotification } from '../utils/notification'

export default function AdminPanel({ auth, onClose }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  // UPI Payments state & Subscriptions list
  const [upiPayments, setUpiPayments] = useState([])
  const [allSubscriptions, setAllSubscriptions] = useState([])
  const [upiLoading, setUpiLoading] = useState(false)

  // Manual User Lookup & Activation State
  const [manualUser, setManualUser] = useState('')
  const [manualPlan, setManualPlan] = useState('yearly')
  const [manualSubmitting, setManualSubmitting] = useState(false)

  // Editable fields
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [yearlyPrice, setYearlyPrice] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [announcementType, setAnnouncementType] = useState('info')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [razorpayEnabled, setRazorpayEnabled] = useState(false)

  const prevPendingCountRef = useRef(0)

  useEffect(() => {
    loadConfig()
    loadUpiPayments()
    requestNotificationPermission()

    // Real-time listener for UPI payments — triggers native notification on new pending payments
    const unsub = listenPendingPayments((payments) => {
      const pendingCount = payments.filter(p => p.status === 'PENDING_VERIFICATION').length
      // If a NEW pending payment arrived (count went up), send native notification
      if (pendingCount > prevPendingCountRef.current && prevPendingCountRef.current >= 0) {
        const newest = payments.find(p => p.status === 'PENDING_VERIFICATION')
        if (newest) {
          sendNativeNotification('💳 New Payment Pending!', {
            body: `${newest.userEmail} submitted ₹${newest.amount} (${newest.plan?.toUpperCase()}) — UTR: ${newest.utr}. Tap to verify.`,
            tag: 'wv-admin-pending-' + newest.orderId,
          })
        }
      }
      prevPendingCountRef.current = pendingCount
      setUpiPayments(payments)
    })

    return () => unsub()
  }, [])

  async function loadUpiPayments() {
    setUpiLoading(true)
    try {
      const [payments, subs] = await Promise.all([
        getAllUpiPayments(),
        getAllSubscriptions(),
      ])
      setUpiPayments(payments)
      setAllSubscriptions(subs)
    } catch (err) {
      console.warn('[AdminPanel] Failed to load payments/subscriptions:', err?.message)
    } finally {
      setUpiLoading(false)
    }
  }

  async function handleApprove(pay) {
    if (!pay?.userId) return
    setSaving(true)
    try {
      await approveUpiPayment(pay.userId, pay.orderId, pay.plan, pay.amount, auth?.email)
      setToast(`✅ Payment approved & subscription activated for ${pay.userEmail}!`)
      setTimeout(() => setToast(''), 4000)
      await loadUpiPayments()
    } catch (err) {
      setError(err?.message || 'Approval failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleManualSet(status) {
    const input = manualUser.trim()
    if (!input) {
      setError('Please enter a user Email or UID')
      return
    }

    setManualSubmitting(true)
    setError('')
    try {
      await adminSetSubscriptionByEmailOrUid(input, status, manualPlan, auth?.email)
      setToast(status === 'active' ? `⚡ Access granted to ${input} (${manualPlan.toUpperCase()})!` : `⛔ Account ${input} deactivated!`)
      setManualUser('')
      setTimeout(() => setToast(''), 4000)
      await loadUpiPayments()
    } catch (err) {
      setError(err?.message || 'Action failed')
    } finally {
      setManualSubmitting(false)
    }
  }

  async function handleRevoke(userId, orderId, userEmail) {
    if (!userId) return
    const reason = window.prompt(`Deactivate/Revoke subscription for ${userEmail || 'user'}? Enter reason (e.g. Fake/unpaid UTR in bank statement):`, 'Fake or unpaid UTR submitted')
    if (reason === null) return

    setSaving(true)
    try {
      await revokeSubscription(userId, orderId, auth?.email, reason)
      setToast('🚨 Subscription revoked and user account deactivated!')
      setTimeout(() => setToast(''), 4000)
      await loadUpiPayments()
    } catch (err) {
      setError(err?.message || 'Revoke failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleReactivate(userId, orderId) {
    if (!userId) return
    setSaving(true)
    try {
      await reactivateSubscription(userId, orderId, auth?.email)
      setToast('✅ Subscription re-activated.')
      setTimeout(() => setToast(''), 3000)
      await loadUpiPayments()
    } catch (err) {
      setError(err?.message || 'Reactivation failed')
    } finally {
      setSaving(false)
    }
  }

  async function loadConfig() {
    setLoading(true)
    try {
      invalidateConfigCache()
      const cfg = await getAppConfig()
      setConfig(cfg)
      setMonthlyPrice(String(cfg.monthlyPrice || 20))
      setYearlyPrice(String(cfg.yearlyPrice || 150))
      setTrialDays(String(cfg.trialDays || 0))
      setAnnouncement(cfg.announcement || '')
      setAnnouncementType(cfg.announcementType || 'info')
      setMaintenanceMode(cfg.maintenanceMode || false)
      setRazorpayEnabled(cfg.razorpayEnabled !== false)
    } catch (err) {
      console.warn('[AdminPanel] loadConfig warning:', err?.message)
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const mp = parseFloat(monthlyPrice) || 20
      const yp = parseFloat(yearlyPrice) || 150
      const td = parseInt(trialDays) || 0

      if (mp <= 0 || yp <= 0) {
        setError('Prices must be greater than 0')
        setSaving(false)
        return
      }
      if (yp < mp) {
        setError('Yearly price should be greater than or equal to monthly price')
        setSaving(false)
        return
      }

      await updateAppConfig(auth?.email, {
        monthlyPrice: mp,
        yearlyPrice: yp,
        trialDays: td,
        announcement,
        announcementType,
        maintenanceMode,
        razorpayEnabled,
      })

      setToast('✅ Configuration saved successfully!')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setError(err?.message || 'Failed to save')
    }
    setSaving(false)
  }

  if (!isAdminEmail(auth?.email)) {
    return (
      <div className="modal-overlay">
        <div className="modal-backdrop" onClick={onClose} />
        <div className="modal-container" style={{ maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <i className="fas fa-lock" style={{ fontSize: 40, color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px' }}>Access Denied</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Only admin accounts can access this panel.</p>
          <button className="btn-primary" onClick={onClose} style={{ marginTop: 16 }}>Close</button>
        </div>
      </div>
    )
  }

  const savingsPercent = monthlyPrice > 0 ? Math.round((1 - (yearlyPrice / (monthlyPrice * 12))) * 100) : 0

  return (
    <div className="modal-overlay" style={{ zIndex: 130 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-container" style={{ maxWidth: 480, maxHeight: '94vh' }}>
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '20px',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                👑
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Admin Control Panel</h3>
                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Manage App Configuration</p>
              </div>
            </div>
            <button className="modal-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body custom-scrollbar" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: 'var(--accent-500)' }} />
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Loading configuration...</p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} />
                  {error}
                </div>
              )}

              {toast && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10b981',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {toast}
                </div>
              )}

              {/* Subscription Pricing */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-tag" style={{ color: 'var(--accent-500)' }} />
                  Subscription Pricing (₹ INR)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="compact-row">
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                      Monthly Price
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                      <input
                        type="number"
                        value={monthlyPrice}
                        onChange={(e) => setMonthlyPrice(e.target.value)}
                        min="1"
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 28px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>per month</span>
                  </div>

                  <div className="compact-row">
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                      Yearly Price
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                      <input
                        type="number"
                        value={yearlyPrice}
                        onChange={(e) => setYearlyPrice(e.target.value)}
                        min="1"
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 28px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      per year {savingsPercent > 0 && <strong style={{ color: '#10b981' }}>({savingsPercent}% off)</strong>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trial Period */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-clock" style={{ color: '#f59e0b' }} />
                  Free Trial
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    min="0"
                    max="365"
                    style={{
                      width: 80,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontSize: 15,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    days free trial for new users
                  </span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Set to 0 to disable free trial. New users will see the subscription popup immediately.
                </p>
              </div>

              {/* App Announcement */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-bullhorn" style={{ color: '#8b5cf6' }} />
                  App Announcement Banner
                </h4>

                <input
                  type="text"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="e.g. 🎉 Limited offer: 50% off yearly plan!"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                />

                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {['info', 'warning', 'success'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setAnnouncementType(t)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 99,
                        border: announcementType === t ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
                        background: announcementType === t ? 'var(--accent-50)' : 'transparent',
                        color: announcementType === t ? 'var(--accent-600)' : 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      {t === 'info' ? '🔵' : t === 'warning' ? '🟡' : '🟢'} {t}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Leave blank to hide the banner. This appears on the login and main screens.
                </p>
              </div>

              {/* Direct Account Manager Tool */}
              <div style={{ background: 'var(--bg-subtle)', border: '1.5px solid #6366f1', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <h4 style={{ fontSize: 11, fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-user-shield" />
                  Direct Account Manager (Activate / Deactivate Any Account)
                </h4>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.3 }}>
                  Enter any user Email or UID below to grant full access or instantly deactivate their plan:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Enter user email or UID (e.g. user@gmail.com)"
                    value={manualUser}
                    onChange={(e) => setManualUser(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      fontSize: 12,
                      fontWeight: 600,
                      boxSizing: 'border-box',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                  />

                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={manualPlan}
                      onChange={(e) => setManualPlan(e.target.value)}
                      style={{
                        padding: '7px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="monthly">30 Days Pass</option>
                      <option value="yearly">1 Year Saver</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleManualSet('active')}
                      disabled={manualSubmitting || !manualUser.trim()}
                      style={{
                        flex: 1,
                        padding: '7px 8px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <i className="fas fa-bolt" />
                      ⚡ Activate
                    </button>

                    <button
                      type="button"
                      onClick={() => handleManualSet('revoked')}
                      disabled={manualSubmitting || !manualUser.trim()}
                      style={{
                        flex: 1,
                        padding: '7px 8px',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <i className="fas fa-ban" />
                      ⛔ Deactivate
                    </button>
                  </div>
                </div>
              </div>

              {/* UPI Payment Audit & Revocation Manager */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <i className="fas fa-qrcode" style={{ color: '#10b981' }} />
                    Direct UPI Payments Audit ({upiPayments.length} Total)
                  </h4>
                  <button
                    onClick={loadUpiPayments}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-500)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <i className={`fas fa-sync-alt ${upiLoading ? 'fa-spin' : ''}`} style={{ marginRight: 4 }} />
                    Refresh Logs
                  </button>
                </div>

                {upiPayments.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    No UPI payment submissions logged yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }} className="custom-scrollbar">
                    {upiPayments.map((pay) => {
                      const isPending = pay.status === 'PENDING_VERIFICATION'
                      const isRevoked = pay.status === 'REVOKED' || pay.status === 'REJECTED'
                      const isApproved = pay.status === 'APPROVED'

                      const borderColor = isPending ? '#f59e0b' : isRevoked ? 'rgba(239,68,68,0.4)' : isApproved ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'
                      const bgColor = isPending ? 'rgba(251,191,36,0.06)' : isRevoked ? 'rgba(239,68,68,0.06)' : isApproved ? 'rgba(16,185,129,0.04)' : 'var(--bg-subtle)'

                      return (
                        <div
                          key={pay.id || pay.orderId}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: `1.5px solid ${borderColor}`,
                            background: bgColor,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <div>
                              <strong style={{ color: 'var(--text-primary)' }}>{pay.userEmail}</strong>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                Plan: <strong>{pay.plan?.toUpperCase()}</strong> (₹{pay.amount}) &bull; Order: {pay.orderId}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 99,
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                background: isPending ? 'rgba(245,158,11,0.15)' : isRevoked ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                color: isPending ? '#d97706' : isRevoked ? '#ef4444' : '#10b981',
                              }}
                            >
                              {isPending && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />}
                              {isPending ? 'PENDING' : isRevoked ? 'REVOKED' : 'APPROVED ✅'}
                            </span>
                          </div>

                          <div style={{ background: 'var(--bg-card)', padding: '6px 8px', borderRadius: 6, fontSize: 11, margin: '6px 0', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>UTR: <strong style={{ letterSpacing: '0.5px', color: '#6366f1' }}>{pay.utr}</strong></span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {pay.submittedAt?.seconds ? new Date(pay.submittedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {isPending ? (
                              <>
                                {/* APPROVE Button */}
                                <button
                                  onClick={() => handleApprove(pay)}
                                  disabled={saving}
                                  className="btn-primary"
                                  style={{ padding: '5px 10px', fontSize: 11, background: 'linear-gradient(135deg, #10b981, #059669)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                >
                                  <i className="fas fa-check-circle" />
                                  ✅ Approve & Activate
                                </button>
                                {/* REJECT Button */}
                                <button
                                  onClick={() => handleRevoke(pay.userId, pay.orderId, pay.userEmail)}
                                  disabled={saving}
                                  className="btn-outline"
                                  style={{ padding: '5px 10px', fontSize: 11, color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                >
                                  <i className="fas fa-times-circle" />
                                  ❌ Reject
                                </button>
                              </>
                            ) : !isRevoked ? (
                              <button
                                onClick={() => handleRevoke(pay.userId, pay.orderId, pay.userEmail)}
                                disabled={saving}
                                className="btn-outline"
                                style={{ padding: '4px 10px', fontSize: 11, color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', flex: 1 }}
                                title="Deactivate user subscription"
                              >
                                <i className="fas fa-ban" style={{ marginRight: 4 }} />
                                Deactivate / Revoke
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReactivate(pay.userId, pay.orderId)}
                                disabled={saving}
                                className="btn-primary"
                                style={{ padding: '4px 10px', fontSize: 11, background: '#10b981', flex: 1 }}
                              >
                                <i className="fas fa-check-circle" style={{ marginRight: 4 }} />
                                Re-activate Access
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-sliders-h" style={{ color: '#06b6d4' }} />
                  Controls
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-subtle)',
                    cursor: 'pointer',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Razorpay Payments</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Enable/disable payment collection</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={razorpayEnabled}
                      onChange={(e) => setRazorpayEnabled(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366f1' }}
                    />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: maintenanceMode ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border-color)',
                    background: maintenanceMode ? 'rgba(239,68,68,0.06)' : 'var(--bg-subtle)',
                    cursor: 'pointer',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: maintenanceMode ? '#ef4444' : 'var(--text-primary)' }}>
                        Maintenance Mode
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {maintenanceMode ? '⚠️ App is currently in maintenance mode!' : 'Show maintenance notice to all users'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                    />
                  </label>
                </div>
              </div>

              {/* Admin Info */}
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>
                <strong>Admin Emails:</strong> {ADMIN_EMAILS.join(', ')}
                {config?.updatedAt && (
                  <div style={{ marginTop: 4 }}>
                    Last updated: {new Date(config.updatedAt?.seconds ? config.updatedAt.seconds * 1000 : config.updatedAt).toLocaleString('en-IN')} by {config.updatedBy || '—'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ minWidth: 120 }}
            >
              {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Saving...</> : <><i className="fas fa-save" style={{ marginRight: 6 }} />Save Changes</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
