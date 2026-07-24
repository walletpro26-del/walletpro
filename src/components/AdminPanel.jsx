import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../firebase'
import { collection, getDocs } from 'firebase/firestore'
import { getAppConfig, updateAppConfig, invalidateConfigCache } from '../api/appConfig'
import {
  isAdminEmail,
  ADMIN_EMAILS,
  getAllSubscriptions,
  revokeSubscription,
  reactivateSubscription,
  adminSetSubscriptionByEmailOrUid,
  listenAllSubscriptions,
  getSubscriberCounts,
  deduplicateSubscriptions,
  purgeDuplicateSubscriptions,
} from '../api/subscription'

export default function AdminPanel({ auth, onClose }) {
  const [activeTab, setActiveTab] = useState('users') // 'users' | 'settings' | 'storage'

  // Firestore Real-Time Storage Monitor State
  const [storageBytes, setStorageBytes] = useState(() => {
    const saved = localStorage.getItem('wv_firestore_occupancy_mb')
    return saved ? parseFloat(saved) : 17.01 // default 17.01 MiB from GCP Metrics
  })
  const [calculatingStorage, setCalculatingStorage] = useState(false)
  const [calcStats, setCalcStats] = useState(null)
  const [cloudMetricInput, setCloudMetricInput] = useState('17.01')

  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [purging, setPurging] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  // Subscriptions list
  const [allSubscriptions, setAllSubscriptions] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Manual User Lookup & Activation State
  const [manualUser, setManualUser] = useState('')
  const [manualPlan, setManualPlan] = useState('yearly')
  const [manualSubmitting, setManualSubmitting] = useState(false)

  // Editable fields for Settings tab
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [yearlyPrice, setYearlyPrice] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [subscriberLimit, setSubscriberLimit] = useState('10')
  const [announcement, setAnnouncement] = useState('')
  const [announcementType, setAnnouncementType] = useState('info')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [razorpayEnabled, setRazorpayEnabled] = useState(false)
  const [razorpayMode, setRazorpayMode] = useState('test')
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [cashfreeEnabled, setCashfreeEnabled] = useState(false)
  const [cashfreeMode, setCashfreeMode] = useState('sandbox')
  const [cashfreeAppId, setCashfreeAppId] = useState('')

  useEffect(() => {
    loadConfig()

    // Real-time listener for all user subscriptions
    const unsubSubs = listenAllSubscriptions((subs) => {
      setAllSubscriptions(subs)
    })

    return () => {
      unsubSubs?.()
    }
  }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      invalidateConfigCache()
      const cfg = await getAppConfig()
      setConfig(cfg)
      setMonthlyPrice(String(cfg.monthlyPrice || 20))
      setYearlyPrice(String(cfg.yearlyPrice || 150))
      setTrialDays(String(cfg.trialDays || 0))
      setSubscriberLimit(String(cfg.subscriberLimit ?? 10))
      setAnnouncement(cfg.announcement || '')
      setAnnouncementType(cfg.announcementType || 'info')
      setMaintenanceMode(cfg.maintenanceMode || false)
      setRazorpayEnabled(cfg.razorpayEnabled !== false)
      setRazorpayMode(cfg.razorpayMode || 'test')
      setRazorpayKeyId(cfg.razorpayKeyId || '')
      setCashfreeEnabled(cfg.cashfreeEnabled || false)
      setCashfreeMode(cfg.cashfreeMode || 'sandbox')
      setCashfreeAppId(cfg.cashfreeAppId || '')
    } catch (err) {
      console.warn('[AdminPanel] loadConfig warning:', err?.message)
    }
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await loadConfig()
      const subs = await getAllSubscriptions()
      if (subs && subs.length > 0) setAllSubscriptions(subs)
      showToast('🔄 Accounts refreshed successfully!')
    } catch (err) {
      console.warn('[AdminPanel] Refresh warning:', err?.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function calculateRealtimeStorage() {
    setCalculatingStorage(true)
    try {
      const expensesSnap = await getDocs(collection(db, 'expenses'))
      const lendingSnap = await getDocs(collection(db, 'lending'))
      const usersSnap = await getDocs(collection(db, 'userProfiles'))
      const remindersSnap = await getDocs(collection(db, 'scheduledReminders'))

      let totalBytes = 0
      let totalDocs = 0

      expensesSnap.forEach((docSnap) => {
        totalDocs++
        const str = JSON.stringify(docSnap.data() || {})
        totalBytes += str.length + 64
      })
      lendingSnap.forEach((docSnap) => {
        totalDocs++
        const str = JSON.stringify(docSnap.data() || {})
        totalBytes += str.length + 64
      })
      usersSnap.forEach((docSnap) => {
        totalDocs++
        const str = JSON.stringify(docSnap.data() || {})
        totalBytes += str.length + 64
      })
      remindersSnap.forEach((docSnap) => {
        totalDocs++
        const str = JSON.stringify(docSnap.data() || {})
        totalBytes += str.length + 64
      })

      const calculatedMB = parseFloat((totalBytes / (1024 * 1024)).toFixed(3))
      setCalcStats({
        expensesCount: expensesSnap.size,
        lendingCount: lendingSnap.size,
        usersCount: usersSnap.size,
        remindersCount: remindersSnap.size,
        totalDocs,
        totalBytes,
        calculatedMB,
      })
      showToast(`⚡ Real-time scan complete: ${totalDocs} documents analyzed!`)
    } catch (err) {
      console.warn('[AdminPanel] Storage calc warning:', err?.message)
    } finally {
      setCalculatingStorage(false)
    }
  }

  async function handleManualSet(status, targetInput = null, planOverride = null) {
    const input = String(targetInput || manualUser).trim()
    if (!input) {
      setError('Please enter a user Email or UID')
      return
    }

    setManualSubmitting(true)
    setError('')
    try {
      const planToUse = planOverride || manualPlan
      await adminSetSubscriptionByEmailOrUid(input, status, planToUse, auth?.email)
      showToast(
        status === 'active'
          ? `⚡ Access activated for ${input} (${planToUse.toUpperCase()})!`
          : `⛔ Account ${input} deactivated!`
      )
      if (!targetInput) setManualUser('')
    } catch (err) {
      setError(err?.message || 'Action failed')
    } finally {
      setManualSubmitting(false)
    }
  }

  async function handleRevoke(userId, orderId, userEmail) {
    if (!userId) return
    const reason = window.prompt(
      `Deactivate/Revoke subscription for ${userEmail || 'user'}? Enter reason:`,
      'Account deactivated by admin'
    )
    if (reason === null) return

    setSaving(true)
    setError('')
    try {
      await revokeSubscription(userId, orderId, auth?.email, reason)
      showToast('🚨 Subscription revoked & account deactivated!')
    } catch (err) {
      setError(err?.message || 'Revoke failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleReactivate(userId, orderId) {
    if (!userId) return
    setSaving(true)
    setError('')
    try {
      await reactivateSubscription(userId, orderId, auth?.email)
      showToast('✅ Subscription re-activated.')
    } catch (err) {
      setError(err?.message || 'Reactivation failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveConfig() {
    setSaving(true)
    setError('')
    try {
      const mp = parseFloat(monthlyPrice) || 20
      const yp = parseFloat(yearlyPrice) || 150
      const td = parseInt(trialDays) || 0
      const sl = parseInt(subscriberLimit) || 10

      if (mp <= 0 || yp <= 0) {
        setError('Prices must be greater than 0')
        setSaving(false)
        return
      }

      await updateAppConfig(auth?.email, {
        monthlyPrice: mp,
        yearlyPrice: yp,
        trialDays: td,
        subscriberLimit: sl,
        announcement,
        announcementType,
        maintenanceMode,
        razorpayEnabled,
        razorpayMode,
        razorpayKeyId,
        cashfreeEnabled,
        cashfreeMode,
        cashfreeAppId,
      })

      showToast('✅ Configuration saved successfully!')
    } catch (err) {
      setError(err?.message || 'Failed to save configuration')
    }
    setSaving(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  if (!isAdminEmail(auth?.email)) {
    return (
      <div className="modal-overlay" style={{ zIndex: 130 }}>
        <div className="modal-backdrop" onClick={onClose} />
        <div className="modal-container" style={{ maxWidth: 400, padding: 28, textAlign: 'center', borderRadius: 14 }}>
          <i className="fas fa-lock" style={{ fontSize: 36, color: '#ef4444', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Access Denied</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Logged in as: <strong>{auth?.email || 'Unauthenticated'}</strong></p>
          <button className="btn-primary" onClick={onClose} style={{ marginTop: 14 }}>Close</button>
        </div>
      </div>
    )
  }

  async function handlePurgeDuplicates() {
    if (!window.confirm('Scan Firestore and permanently delete duplicate subscription documents for the same email?')) return
    setPurging(true)
    setError('')
    try {
      const res = await purgeDuplicateSubscriptions(auth?.email)
      if (res.deletedCount > 0) {
        showToast(`🧹 Purged ${res.deletedCount} duplicate document(s) from Firestore!`)
      } else {
        showToast('✨ No duplicate records found in Firestore.')
      }
      await handleRefresh()
    } catch (err) {
      setError(err?.message || 'Purge failed')
    } finally {
      setPurging(false)
    }
  }

  // Deduplicate allSubscriptions by unique email address
  const uniqueSubscriptions = deduplicateSubscriptions(allSubscriptions)

  // Filter deduplicated subscriptions for Tab 1
  const filteredSubscriptions = uniqueSubscriptions.filter((s) => {
    if (!searchFilter.trim()) return true
    const term = searchFilter.toLowerCase().trim()
    return (s.email || '').toLowerCase().includes(term) || (s.userId || s.id || '').toLowerCase().includes(term) || (s.utr || '').toLowerCase().includes(term)
  })

  const { totalActive, adminActivatedCount, regularActiveCount } = getSubscriberCounts(allSubscriptions)
  const pendingSubsCount = uniqueSubscriptions.filter((s) => s.status === 'pending_verification').length
  const revokedSubsCount = uniqueSubscriptions.filter((s) => s.status === 'revoked' || s.status === 'expired').length
  const limitNum = parseInt(subscriberLimit) || config?.subscriberLimit || 10

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 130 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          maxWidth: 520,
          width: '95%',
          maxHeight: '94dvh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 14,
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '12px 16px',
            color: '#fff',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <button
            className="modal-close"
            style={{
              position: 'absolute', top: 10, right: 12, background: 'rgba(255,255,255,0.15)',
              color: '#fff', width: 26, height: 26, borderRadius: '50%', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            }}
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 40 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              👑
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>Admin Control Panel</h3>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: '#a5b4fc' }}>
                LoggedIn: <strong style={{ color: '#fff' }}>{auth?.email}</strong>
              </p>
            </div>
          </div>

          {/* Tab Switcher (Compact Header Navigation) */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12, background: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                background: activeTab === 'users' ? '#ffffff' : 'transparent',
                color: activeTab === 'users' ? '#312e81' : '#cbd5e1',
                fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'all 0.15s',
              }}
            >
              <i className="fas fa-users" /> Accounts ({uniqueSubscriptions.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                background: activeTab === 'settings' ? '#ffffff' : 'transparent',
                color: activeTab === 'settings' ? '#312e81' : '#cbd5e1',
                fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'all 0.15s',
              }}
            >
              <i className="fas fa-cog" /> Settings
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                background: activeTab === 'storage' ? '#ffffff' : 'transparent',
                color: activeTab === 'storage' ? '#312e81' : '#cbd5e1',
                fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'all 0.15s',
              }}
            >
              <i className="fas fa-database" /> 🔥 Storage Quota
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '12px 14px', flex: 1 }}>

          {/* Toast Notification Banner */}
          {toast && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
              <i className="fas fa-check-circle" /> {toast}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-exclamation-triangle" /> {error}
              <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 1: REGISTERED ACCOUNTS & USER MANAGEMENT
             ══════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <div>
              {/* Quick Status Stats Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                <div style={{ background: regularActiveCount >= limitNum ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${regularActiveCount >= limitNum ? '#ef4444' : '#10b981'}`, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: regularActiveCount >= limitNum ? '#ef4444' : '#059669' }}>
                    {regularActiveCount} / {limitNum}
                  </div>
                  <div style={{ fontSize: 8.5, color: regularActiveCount >= limitNum ? '#b91c1c' : '#047857', fontWeight: 700 }}>
                    {regularActiveCount >= limitNum ? '🔴 Regular Limit' : '🟢 Regular Subs'}
                  </div>
                </div>
                <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid #6366f1', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#4f46e5' }}>{adminActivatedCount}</div>
                  <div style={{ fontSize: 8.5, color: '#4338ca', fontWeight: 700 }}>👑 Admin Granted</div>
                </div>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#d97706' }}>{pendingSubsCount}</div>
                  <div style={{ fontSize: 8.5, color: '#b45309', fontWeight: 700 }}>⏳ Pending</div>
                </div>
                <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#64748b' }}>{revokedSubsCount}</div>
                  <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>🔴 Inactive</div>
                </div>
              </div>

              {/* Quick Manual Access Tool */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1.5px solid #6366f1', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fas fa-user-plus" /> Activate / Deactivate Any Account
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Enter email or UID (e.g. user@gmail.com)"
                    value={manualUser}
                    onChange={(e) => setManualUser(e.target.value)}
                    style={{
                      flex: 2, minWidth: 160, padding: '6px 9px', borderRadius: 6,
                      border: '1px solid var(--border-color, #e2e8f0)', fontSize: 11, fontWeight: 600,
                      background: '#fff', color: '#1e293b',
                    }}
                  />
                  <select
                    value={manualPlan}
                    onChange={(e) => setManualPlan(e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color, #e2e8f0)', fontSize: 10, fontWeight: 700, background: '#fff', color: '#1e293b' }}
                  >
                    <option value="monthly">30 Days Pass</option>
                    <option value="yearly">1 Year Saver</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleManualSet('active')}
                    disabled={manualSubmitting || !manualUser.trim()}
                    style={{ padding: '6px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ⚡ Activate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManualSet('revoked')}
                    disabled={manualSubmitting || !manualUser.trim()}
                    style={{ padding: '6px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ⛔ Deactivate
                  </button>
                </div>
              </div>

              {/* Registered Accounts Filter Input */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ position: 'relative', flex: 1, marginRight: 8 }}>
                  <i className="fas fa-search" style={{ position: 'absolute', left: 9, top: 8, fontSize: 10, color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search accounts by email or UID..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px 5px 26px', borderRadius: 6,
                      border: '1px solid var(--border-color, #e2e8f0)', fontSize: 11,
                      background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1e293b)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handlePurgeDuplicates}
                    disabled={purging}
                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    title="Scan Firestore and clean up duplicate documents for the same email"
                  >
                    <i className={`fas ${purging ? 'fa-spinner fa-spin' : 'fa-broom'}`} style={{ marginRight: 4 }} />
                    {purging ? 'Purging...' : 'Purge Duplicates'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} style={{ marginRight: 4 }} /> Refresh
                  </button>
                </div>
              </div>

              {/* Registered Accounts Cards List */}
              {filteredSubscriptions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
                  No registered account records found matching query.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 310, overflowY: 'auto' }} className="custom-scrollbar">
                  {filteredSubscriptions.map((sub) => {
                    const isActive = sub.status === 'active'
                    const isPending = sub.status === 'pending_verification'
                    const isRevoked = sub.status === 'revoked' || sub.status === 'expired'
                    const expiresDate = sub.expiresAt?.toDate ? sub.expiresAt.toDate() : (sub.expiresAt ? new Date(sub.expiresAt) : null)

                    const isAdminGranted =
                      sub.gateway === 'admin_granted' ||
                      sub.adminActivated === true ||
                      !!sub.updatedByAdmin ||
                      sub.plan === 'lifetime_admin' ||
                      isAdminEmail(sub.email)

                    return (
                      <div
                        key={sub.id || sub.userId}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: isActive ? (isAdminGranted ? '1px solid #a5b4fc' : '1px solid #a7f3d0') : isPending ? '1.5px solid #f59e0b' : '1px solid var(--border-color, #e2e8f0)',
                          background: isActive ? (isAdminGranted ? 'rgba(99,102,241,0.04)' : 'rgba(16,185,129,0.03)') : isPending ? 'rgba(245,158,11,0.05)' : 'var(--bg-subtle, #f8fafc)',
                          fontSize: 11,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ color: 'var(--text-primary, #1e293b)', fontSize: 11 }}>{sub.email || sub.userId}</strong>
                              {isActive && isAdminGranted && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: 'rgba(99,102,241,0.15)', color: '#4f46e5', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  👑 Admin Granted (Exempt)
                                </span>
                              )}
                              {isActive && !isAdminGranted && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: sub.plan === 'trial' ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.15)', color: sub.plan === 'trial' ? '#047857' : '#0284c7', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  {sub.plan === 'trial' ? '🎁 Free Trial' : '💳 Paid Sub'}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              Plan: <strong style={{ color: '#6366f1' }}>{(sub.plan || 'monthly').toUpperCase()}</strong>
                              {expiresDate && (
                                <> &bull; Expires: <span>{expiresDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></>
                              )}
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: 8, fontWeight: 900, padding: '2px 6px', borderRadius: 99, textTransform: 'uppercase', flexShrink: 0,
                              background: isActive ? 'rgba(16,185,129,0.15)' : isPending ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.12)',
                              color: isActive ? '#059669' : isPending ? '#d97706' : '#ef4444',
                            }}
                          >
                            {isActive ? '🟢 Active' : isPending ? '⏳ Pending' : '🔴 Inactive'}
                          </span>
                        </div>

                        {/* Inline Actions */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          {!isActive ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleManualSet('active', sub.email || sub.userId, 'monthly')}
                                style={{ padding: '3px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                              >
                                ⚡ Activate 30D
                              </button>
                              <button
                                type="button"
                                onClick={() => handleManualSet('active', sub.email || sub.userId, 'yearly')}
                                style={{ padding: '3px 8px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                              >
                                ⚡ Activate 1Yr
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleManualSet('active', sub.email || sub.userId, 'monthly')}
                                style={{ padding: '3px 8px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                              >
                                ➕ +30 Days
                              </button>
                              <button
                                type="button"
                                onClick={() => handleManualSet('revoked', sub.email || sub.userId)}
                                style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                              >
                                ⛔ Deactivate
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}



          {/* ══════════════════════════════════════════════════════════
              TAB 3: CONFIGURATION & SETTINGS
             ══════════════════════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Pricing section */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>
                  💰 Subscription Pricing (₹ INR)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Monthly Price (₹)</label>
                    <input
                      type="number"
                      value={monthlyPrice}
                      onChange={(e) => setMonthlyPrice(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Yearly Price (₹)</label>
                    <input
                      type="number"
                      value={yearlyPrice}
                      onChange={(e) => setYearlyPrice(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
                    />
                  </div>
                </div>
              </div>

              {/* Subscriber Limit Section */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>👥 Subscriber Limit Control</span>
                  <span style={{ fontSize: 8.5, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4, textTransform: 'none', fontWeight: 700 }}>
                    Admin-granted accounts exempt
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 110 }}>
                    <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Max Regular Subs</label>
                    <input
                      type="number"
                      min="1"
                      value={subscriberLimit}
                      onChange={(e) => setSubscriberLimit(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 800, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, fontSize: 9, color: '#64748b', lineHeight: 1.35 }}>
                    Controls maximum regular subscribers allowed (default: 10). Accounts activated directly by Admin from this portal will <strong>NOT</strong> be counted in this limit.
                  </div>
                </div>
              </div>

              {/* Announcement Banner Editor */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>
                  📢 Global App Announcement Banner
                </div>
                <input
                  type="text"
                  placeholder="e.g. 🎉 Limited Offer: Upgrade now to Pro!"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {['info', 'warning', 'success'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAnnouncementType(t)}
                      style={{
                        padding: '3px 8px', borderRadius: 99,
                        border: announcementType === t ? '2px solid #6366f1' : '1px solid #cbd5e1',
                        background: announcementType === t ? 'rgba(99,102,241,0.1)' : '#fff',
                        color: announcementType === t ? '#4f46e5' : '#64748b',
                        fontSize: 9, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer',
                      }}
                    >
                      {t === 'info' ? '🔵 Info' : t === 'warning' ? '🟡 Warning' : '🟢 Success'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Razorpay Payment Gateway Settings */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: `1px solid ${razorpayEnabled ? '#6366f1' : 'var(--border-color, #e2e8f0)'}`, borderRadius: 8, padding: 10, transition: 'border-color 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase' }}>
                      ⚡ Razorpay Payment Gateway
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>
                      Enable Razorpay PG (Cards, Netbanking, UPI, Wallets)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={razorpayEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setRazorpayEnabled(checked)
                      if (checked) setCashfreeEnabled(false) // Exclusive: disable Cashfree
                    }}
                    style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>

                {razorpayEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #cbd5e1' }}>
                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                        Environment Mode
                      </label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setRazorpayMode('test')}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                            border: razorpayMode === 'test' ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                            background: razorpayMode === 'test' ? 'rgba(245, 158, 11, 0.15)' : '#fff',
                            color: razorpayMode === 'test' ? '#b45309' : '#64748b',
                          }}
                        >
                          🟡 TEST Mode (rzp_test_...)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRazorpayMode('live')}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                            border: razorpayMode === 'live' ? '2px solid #10b981' : '1px solid #cbd5e1',
                            background: razorpayMode === 'live' ? 'rgba(16, 185, 129, 0.15)' : '#fff',
                            color: razorpayMode === 'live' ? '#047857' : '#64748b',
                          }}
                        >
                          🟢 LIVE Mode (rzp_live_...)
                        </button>
                      </div>
                      <div style={{ fontSize: 8, color: razorpayMode === 'test' ? '#d97706' : '#059669', marginTop: 3 }}>
                        {razorpayMode === 'test'
                          ? '⚡ Test mode: Use rzp_test_... key for sandbox payments.'
                          : '🚀 Live mode: Processes real money using rzp_live_... key.'}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                        Razorpay Key ID
                      </label>
                      <input
                        type="text"
                        placeholder={razorpayMode === 'test' ? 'rzp_test_...' : 'rzp_live_...'}
                        value={razorpayKeyId}
                        onChange={(e) => setRazorpayKeyId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Cashfree Payment Gateway Settings */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: `1px solid ${cashfreeEnabled ? '#0284c7' : 'var(--border-color, #e2e8f0)'}`, borderRadius: 8, padding: 10, transition: 'border-color 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>
                      💳 Cashfree Payment Gateway Integration
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>
                      Enable Cashfree PG (Cards, Netbanking, UPI, Wallets)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cashfreeEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setCashfreeEnabled(checked)
                      if (checked) setRazorpayEnabled(false) // Exclusive: disable Razorpay
                    }}
                    style={{ width: 16, height: 16, accentColor: '#0284c7', cursor: 'pointer' }}
                  />
                </div>

                {cashfreeEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #cbd5e1' }}>
                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                        Environment Mode
                      </label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setCashfreeMode('sandbox')}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                            border: cashfreeMode === 'sandbox' ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                            background: cashfreeMode === 'sandbox' ? 'rgba(245, 158, 11, 0.15)' : '#fff',
                            color: cashfreeMode === 'sandbox' ? '#b45309' : '#64748b',
                          }}
                        >
                          🟡 TEST / Sandbox (Immediate)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCashfreeMode('production')}
                          style={{
                            flex: 1, padding: '5px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                            border: cashfreeMode === 'production' ? '2px solid #10b981' : '1px solid #cbd5e1',
                            background: cashfreeMode === 'production' ? 'rgba(16, 185, 129, 0.15)' : '#fff',
                            color: cashfreeMode === 'production' ? '#047857' : '#64748b',
                          }}
                        >
                          🟢 PROD / Live (After KYC)
                        </button>
                      </div>
                      <div style={{ fontSize: 8, color: cashfreeMode === 'sandbox' ? '#d97706' : '#059669', marginTop: 3 }}>
                        {cashfreeMode === 'sandbox'
                          ? '⚡ Sandbox active: Can be used immediately right now for testing payments!'
                          : '🚀 Live active: Processes real money payments once Cashfree KYC is approved.'}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                        Cashfree App ID / Client ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1048473TEST..."
                        value={cashfreeAppId}
                        onChange={(e) => setCashfreeAppId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Maintenance & Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Maintenance Mode</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>Show maintenance banner to all users</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={maintenanceMode}
                    onChange={(e) => setMaintenanceMode(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#ef4444' }}
                  />
                </label>
              </div>

              {/* Save Settings Button */}
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                style={{
                  width: '100%', padding: '10px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.3)', marginTop: 4,
                }}
              >
                {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} /> Saving...</> : <><i className="fas fa-save" style={{ marginRight: 6 }} /> Save Configuration</>}
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 3: FIRESTORE DATABASE STORAGE & QUOTA MONITOR
             ══════════════════════════════════════════════════════════ */}
          {activeTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Live Storage Gauge Card */}
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#a5b4fc', letterSpacing: 0.5 }}>
                    🔥 FIRESTORE STORAGE OCCUPANCY (1.0 GB FREE SPARK PLAN)
                  </div>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 800,
                    background: storageBytes > 900 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                    color: storageBytes > 900 ? '#ef4444' : '#10b981',
                    padding: '2px 8px',
                    borderRadius: 99,
                    border: storageBytes > 900 ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.4)',
                  }}>
                    {storageBytes > 900 ? '⚠️ WARNING: 90% THRESHOLD' : '🟢 SAFE & OPTIMAL'}
                  </span>
                </div>

                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                  {storageBytes.toFixed(2)} MiB <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600 }}>/ 1,024 MiB</span>
                </div>

                {/* Progress Bar */}
                <div style={{ background: 'rgba(255,255,255,0.1)', height: 9, borderRadius: 6, overflow: 'hidden', margin: '8px 0 6px' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (storageBytes / 1024) * 100).toFixed(2)}%`,
                    background: storageBytes > 900 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #6366f1)',
                    borderRadius: 6,
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
                  <span>Occupied: {((storageBytes / 1024) * 100).toFixed(2)}%</span>
                  <span>Available Free: {(1024 - storageBytes).toFixed(2)} MiB (98.34%)</span>
                </div>
              </div>

              {/* GCP Metrics Sync Box */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 10, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)', marginBottom: 4 }}>
                  📡 Google Cloud Monitoring Metric Sync (data_and_index_storage_bytes):
                </div>
                <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 6 }}>
                  Directly enter exact MiB metric from Google Cloud Console Metrics Explorer:
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    step="0.01"
                    value={cloudMetricInput}
                    onChange={(e) => setCloudMetricInput(e.target.value)}
                    placeholder="e.g. 17.01"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: 11,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(cloudMetricInput) || 17.01
                      setStorageBytes(val)
                      localStorage.setItem('wv_firestore_occupancy_mb', String(val))
                      showToast(`✔ Firestore Occupancy updated to ${val} MiB!`)
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Save GCP Metric
                  </button>
                </div>
              </div>

              {/* Real-time Collection Scanner Section */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 10, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                    ⚡ Real-Time Collection Document Byte Scanner:
                  </div>
                  <button
                    type="button"
                    onClick={calculateRealtimeStorage}
                    disabled={calculatingStorage}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: calculatingStorage ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {calculatingStorage ? 'Scanning...' : '🔄 Run Real-Time Scan'}
                  </button>
                </div>

                {calcStats ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1' }}>
                      Expenses: <strong>{calcStats.expensesCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1' }}>
                      Lending: <strong>{calcStats.lendingCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1' }}>
                      User Profiles: <strong>{calcStats.usersCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1' }}>
                      Reminders: <strong>{calcStats.remindersCount} docs</strong>
                    </div>
                    <div style={{ gridColumn: 'span 2', padding: '6px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669', fontWeight: 800 }}>
                      ✔ Total Scanned: {calcStats.totalDocs} docs (~{calcStats.calculatedMB} MB estimated JSON footprint)
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic' }}>
                    Click "Run Real-Time Scan" to query live document byte sizes across expenses, lending, user accounts, and reminders.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin emails footer */}
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 9, color: '#64748b' }}>
            Whitelisted Admins: {ADMIN_EMAILS.join(', ')}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
