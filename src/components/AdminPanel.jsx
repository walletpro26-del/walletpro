import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { extractValidGeminiKeys } from '../api/pdfExtractor'
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
  deleteSubscriptionAccount,
  backfillUserProfiles,
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

  // Subscriptions list & filter state
  const [allSubscriptions, setAllSubscriptions] = useState([])
  const [searchFilter, setSearchFilter] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'regular' | 'admin' | 'pending' | 'inactive'
  const [refreshing, setRefreshing] = useState(false)

  // Manual User Lookup & Activation State
  const [manualUser, setManualUser] = useState('')
  const [manualPlan, setManualPlan] = useState('yearly')
  const [manualSubmitting, setManualSubmitting] = useState(false)

  // Editable fields for Settings tab
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [yearlyPrice, setYearlyPrice] = useState('')
  const [ultraMonthlyPrice, setUltraMonthlyPrice] = useState('49')
  const [ultraYearlyPrice, setUltraYearlyPrice] = useState('399')
  const [ultraEnabled, setUltraEnabled] = useState(false)
  const [ultraComingSoon, setUltraComingSoon] = useState(true)
  const [hideUltraBanner, setHideUltraBanner] = useState(false)
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
  const [allowNonCsvImport, setAllowNonCsvImport] = useState(true)
  const [geminiApiKeys, setGeminiApiKeys] = useState('')

  // Sync/Backfill Firebase Auth Users State
  const [syncEmails, setSyncEmails] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [showQuickActivate, setShowQuickActivate] = useState(false)

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
      setUltraMonthlyPrice(String(cfg.ultraMonthlyPrice || 49))
      setUltraYearlyPrice(String(cfg.ultraYearlyPrice || 399))
      setUltraEnabled(!!cfg.ultraEnabled)
      setUltraComingSoon(cfg.ultraComingSoon !== false)
      setHideUltraBanner(!!cfg.hideUltraBanner)
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
      setAllowNonCsvImport(cfg.allowNonCsvImport !== false)
      setGeminiApiKeys(cfg.geminiApiKeys || '')
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
      const [expensesSnap, lendingSnap, usersSnap, subsSnap, bankSnap, reviewsSnap, remindersSnap] = await Promise.all([
        getDocs(collection(db, 'expenses')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'lending')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'userProfiles')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'subscriptions')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'bankTransactions')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'appReviews')).catch(() => ({ size: 0, forEach: () => {} })),
        getDocs(collection(db, 'scheduledReminders')).catch(() => ({ size: 0, forEach: () => {} })),
      ])

      let totalBytes = 0
      let totalDocs = 0

      const processSnap = (snap) => {
        if (!snap || !snap.forEach) return
        snap.forEach((docSnap) => {
          totalDocs++
          const dataStr = JSON.stringify(docSnap.data() || {})
          const idStr = docSnap.id || ''
          // Firestore document overhead spec: doc ID length + data string length + 64 bytes index overhead
          totalBytes += dataStr.length + idStr.length + 64
        })
      }

      processSnap(expensesSnap)
      processSnap(lendingSnap)
      processSnap(usersSnap)
      processSnap(subsSnap)
      processSnap(bankSnap)
      processSnap(reviewsSnap)
      processSnap(remindersSnap)

      const calculatedMB = parseFloat((totalBytes / (1024 * 1024)).toFixed(3))
      setCalcStats({
        expensesCount: expensesSnap.size || 0,
        lendingCount: lendingSnap.size || 0,
        usersCount: usersSnap.size || 0,
        subsCount: subsSnap.size || 0,
        bankCount: bankSnap.size || 0,
        reviewsCount: reviewsSnap.size || 0,
        remindersCount: remindersSnap.size || 0,
        totalDocs,
        totalBytes,
        calculatedMB,
      })
      showToast(`⚡ Real-time scan complete: ${totalDocs} documents analyzed across 7 collections!`)
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
      const ump = parseFloat(ultraMonthlyPrice) || 49
      const uyp = parseFloat(ultraYearlyPrice) || 399
      const td = parseInt(trialDays) || 0
      const parsedLimit = parseInt(subscriberLimit, 10)
      const sl = isNaN(parsedLimit) ? 10 : Math.max(0, parsedLimit)

      if (mp <= 0 || yp <= 0 || ump <= 0 || uyp <= 0) {
        setError('Prices must be greater than 0')
        setSaving(false)
        return
      }

      const counts = getSubscriberCounts(allSubscriptions)
      await updateAppConfig(auth?.email, {
        monthlyPrice: mp,
        yearlyPrice: yp,
        ultraMonthlyPrice: ump,
        ultraYearlyPrice: uyp,
        ultraEnabled,
        ultraComingSoon,
        hideUltraBanner,
        trialDays: td,
        subscriberLimit: sl,
        activeSubscriberCount: counts.regularActiveCount,
        announcement,
        announcementType,
        maintenanceMode,
        razorpayEnabled,
        razorpayMode,
        razorpayKeyId,
        cashfreeEnabled,
        cashfreeMode,
        cashfreeAppId,
        allowNonCsvImport,
        geminiApiKeys,
      })

      showToast('✅ Configuration & AI API Keys saved successfully!')
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

  async function handleDeleteAccount(targetEmailOrUid) {
    const target = String(targetEmailOrUid || '').trim()
    if (!target) return
    if (!window.confirm(`⚠️ Permanently delete account "${target}" from Firestore?\n\nThis will remove both subscriptions and userProfiles documents associated with this email/UID.`)) {
      return
    }
    setPurging(true)
    setError('')
    try {
      const res = await deleteSubscriptionAccount(auth?.email, target)
      showToast(`🗑️ Permanently deleted account ${target} (${res.deletedCount} document(s) purged from Firestore)!`)
      await handleRefresh()
    } catch (err) {
      setError(err?.message || 'Failed to delete account')
    } finally {
      setPurging(false)
    }
  }

  async function handleSyncUsers() {
    const emails = syncEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes('@'))

    if (!emails.length) {
      setError('Paste at least one valid email address')
      return
    }

    setSyncing(true)
    setError('')
    try {
      const res = await backfillUserProfiles(auth?.email, emails)
      if (res.addedCount > 0) {
        showToast(`✅ Synced ${res.addedCount} new user(s) to Firestore! (${res.skippedCount} already existed)`)
      } else {
        showToast(`✨ All ${res.skippedCount} email(s) already exist in Firestore — nothing to sync.`)
      }
      if (res.errors.length) {
        setError(`Errors: ${res.errors.join(', ')}`)
      }
      setSyncEmails('')
      setShowSyncPanel(false)
      await handleRefresh()
    } catch (err) {
      setError(err?.message || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // Deduplicate allSubscriptions by unique email address
  const uniqueSubscriptions = deduplicateSubscriptions(allSubscriptions)

  // Filter deduplicated subscriptions by Search Query and Hyperlink Stat Card Filter
  const filteredSubscriptions = uniqueSubscriptions.filter((s) => {
    // 1. Text Search Filter
    if (searchFilter.trim()) {
      const term = searchFilter.toLowerCase().trim()
      const matches = (s.email || '').toLowerCase().includes(term) || (s.userId || s.id || '').toLowerCase().includes(term) || (s.utr || '').toLowerCase().includes(term)
      if (!matches) return false
    }

    // 2. Stat Card Hyperlink Filter — Only walletpro26@gmail.com is "Admin"
    const expiresAt = s.expiresAt?.toDate ? s.expiresAt.toDate() : (s.expiresAt ? new Date(s.expiresAt) : null)
    const isSuperAdmin = isAdminEmail(s.email)
    const isAdminActivatedUser = !isSuperAdmin && (s.gateway === 'admin_granted' || s.adminActivated || s.plan === 'lifetime_admin')
    const isActive = (s.status === 'active' || isSuperAdmin || isAdminActivatedUser) && (!expiresAt || expiresAt > new Date())

    if (filterTab === 'regular') return isActive && !isSuperAdmin
    if (filterTab === 'admin') return isSuperAdmin
    if (filterTab === 'pending') return !isSuperAdmin && (s.status === 'pending_verification' || s.status === 'registered')
    if (filterTab === 'inactive') return !isActive && !isSuperAdmin && s.status !== 'pending_verification' && s.status !== 'registered'

    return true
  })

  const { totalAccounts, adminActivatedCount, regularActiveCount, pendingCount: pendingSubsCount, inactiveCount: revokedSubsCount } = getSubscriberCounts(uniqueSubscriptions)
  const parsedLimit = parseInt(subscriberLimit, 10)
  const limitNum = isNaN(parsedLimit) ? (config?.subscriberLimit ?? 10) : Math.max(0, parsedLimit)

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
              color: '#fff', width: 32, height: 32, borderRadius: '50%', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
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
          <div style={{ display: 'flex', gap: 4, marginTop: 12, background: 'rgba(0,0,0,0.3)', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => { setActiveTab('users'); setFilterTab('all'); }}
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
              {/* Quick Status Stats Bar (Clickable Hyperlink Filters) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: 10 }}>
                {/* 1. All Accounts Stat Card */}
                <div
                  onClick={() => setFilterTab('all')}
                  style={{
                    background: filterTab === 'all' ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.06)',
                    border: `1.5px solid ${filterTab === 'all' ? '#4f46e5' : '#818cf8'}`,
                    borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                    boxShadow: filterTab === 'all' ? '0 0 0 2px rgba(99,102,241,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Show All Registered Accounts"
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#4f46e5' }}>
                    {uniqueSubscriptions.length}
                  </div>
                  <div style={{ fontSize: 8, color: '#4338ca', fontWeight: 800 }}>
                    👥 All ({uniqueSubscriptions.length})
                  </div>
                </div>

                {/* 2. Regular Active Subscribers Stat Card */}
                <div
                  onClick={() => setFilterTab(filterTab === 'regular' ? 'all' : 'regular')}
                  style={{
                    background: filterTab === 'regular' ? 'rgba(16,185,129,0.18)' : (regularActiveCount >= limitNum ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'),
                    border: `1.5px solid ${filterTab === 'regular' ? '#059669' : (regularActiveCount >= limitNum ? '#ef4444' : '#10b981')}`,
                    borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                    boxShadow: filterTab === 'regular' ? '0 0 0 2px rgba(16,185,129,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to filter by Regular Active Subscribers"
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: regularActiveCount >= limitNum ? '#ef4444' : '#059669' }}>
                    {regularActiveCount} / {limitNum}
                  </div>
                  <div style={{ fontSize: 8, color: regularActiveCount >= limitNum ? '#b91c1c' : '#047857', fontWeight: 800 }}>
                    {regularActiveCount >= limitNum ? '🔴 Limit' : '🟢 Regular'}
                  </div>
                </div>

                {/* 3. Admin Granted Stat Card */}
                <div
                  onClick={() => setFilterTab(filterTab === 'admin' ? 'all' : 'admin')}
                  style={{
                    background: filterTab === 'admin' ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)',
                    border: `1.5px solid ${filterTab === 'admin' ? '#4338ca' : '#6366f1'}`,
                    borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                    boxShadow: filterTab === 'admin' ? '0 0 0 2px rgba(99,102,241,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to filter by Admin Granted (Exempt) accounts"
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#4f46e5' }}>{adminActivatedCount}</div>
                  <div style={{ fontSize: 8, color: '#4338ca', fontWeight: 800 }}>👑 Admin</div>
                </div>

                {/* 4. Pending Verification Stat Card */}
                <div
                  onClick={() => setFilterTab(filterTab === 'pending' ? 'all' : 'pending')}
                  style={{
                    background: filterTab === 'pending' ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.08)',
                    border: `1.5px solid ${filterTab === 'pending' ? '#b45309' : '#f59e0b'}`,
                    borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                    boxShadow: filterTab === 'pending' ? '0 0 0 2px rgba(245,158,11,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to filter by Pending Verification accounts"
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#d97706' }}>{pendingSubsCount}</div>
                  <div style={{ fontSize: 8, color: '#b45309', fontWeight: 800 }}>⏳ Pending</div>
                </div>

                {/* 5. Inactive Stat Card */}
                <div
                  onClick={() => setFilterTab(filterTab === 'inactive' ? 'all' : 'inactive')}
                  style={{
                    background: filterTab === 'inactive' ? 'rgba(100,116,139,0.18)' : 'var(--bg-subtle, #f8fafc)',
                    border: `1.5px solid ${filterTab === 'inactive' ? '#334155' : 'var(--border-color, #e2e8f0)'}`,
                    borderRadius: 8, padding: '6px 2px', textAlign: 'center', cursor: 'pointer',
                    boxShadow: filterTab === 'inactive' ? '0 0 0 2px rgba(100,116,139,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="Click to filter by Inactive / Registered accounts"
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#64748b' }}>{revokedSubsCount}</div>
                  <div style={{ fontSize: 8, color: '#64748b', fontWeight: 800 }}>🔴 Inactive</div>
                </div>
              </div>

              {/* Active Filter Clear Chip */}
              {filterTab !== 'all' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 10, fontWeight: 700, color: '#6366f1' }}>
                  <span>Filtered by: <strong style={{ textTransform: 'uppercase' }}>{filterTab} accounts ({filteredSubscriptions.length})</strong></span>
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    style={{ background: 'rgba(99,102,241,0.1)', border: 'none', color: '#4f46e5', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 9, fontWeight: 800 }}
                  >
                    Clear Filter ×
                  </button>
                </div>
              )}

              {/* Collapsible Quick Manual Access Tool */}
              {showQuickActivate && (
                <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1.5px solid #6366f1', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span><i className="fas fa-user-plus" /> Activate / Deactivate Any Account</span>
                    <button type="button" onClick={() => setShowQuickActivate(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>×</button>
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
                      <option value="monthly">Pro Monthly Pass</option>
                      <option value="yearly">Pro Yearly Saver</option>
                      <option value="ultra_monthly">👑 Ultra Monthly</option>
                      <option value="ultra_yearly">👑 Ultra Yearly</option>
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
              )}

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
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowQuickActivate(!showQuickActivate)}
                    style={{ background: showQuickActivate ? '#6366f1' : 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: showQuickActivate ? '#fff' : '#6366f1', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    title="Toggle manual account activation form"
                  >
                    <i className="fas fa-user-plus" style={{ marginRight: 4 }} />
                    {showQuickActivate ? 'Close Form' : 'Activate User'}
                  </button>
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
                    onClick={() => setShowSyncPanel(!showSyncPanel)}
                    style={{ background: showSyncPanel ? '#6366f1' : 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: showSyncPanel ? '#fff' : '#6366f1', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    title="Import Firebase Auth users into Firestore (paste emails from Firebase Console)"
                  >
                    <i className={`fas ${showSyncPanel ? 'fa-chevron-up' : 'fa-cloud-download-alt'}`} style={{ marginRight: 4 }} />
                    {showSyncPanel ? 'Close Sync' : 'Sync Users'}
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

              {/* Sync Firebase Auth Users Panel */}
              {showSyncPanel && (
                <div style={{ padding: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>
                    🔄 Import Firebase Auth Users
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b', marginBottom: 6 }}>
                    Paste emails from <strong>Firebase Console → Authentication</strong> (one per line, comma, or semicolon separated).
                    Users already in Firestore will be skipped. New ones appear under <strong>⏳ Pending</strong>.
                  </div>
                  <textarea
                    value={syncEmails}
                    onChange={(e) => setSyncEmails(e.target.value)}
                    placeholder={'daraehsan199@gmail.com\nsameerqasmi5@gmail.com\njawharwani09@gmail.com\n...paste all emails here'}
                    style={{
                      width: '100%', minHeight: 80, padding: 8, borderRadius: 6,
                      border: '1px solid var(--border-color, #e2e8f0)', fontSize: 10,
                      fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                      background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1e293b)',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>
                      {syncEmails.split(/[\n,;]+/).filter((e) => e.trim() && e.includes('@')).length} valid email(s) detected
                    </span>
                    <button
                      type="button"
                      onClick={handleSyncUsers}
                      disabled={syncing}
                      style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                    >
                      <i className={`fas ${syncing ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} style={{ marginRight: 4 }} />
                      {syncing ? 'Syncing...' : 'Sync to Firestore'}
                    </button>
                  </div>
                </div>
              )}
              {/* Registered Accounts Cards List */}
              {filteredSubscriptions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 8, fontSize: 11, color: '#64748b' }}>
                  No registered account records found matching query.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: showQuickActivate || showSyncPanel ? 290 : 440, overflowY: 'auto' }} className="custom-scrollbar">
                  {filteredSubscriptions.map((sub, idx) => {
                    const expiresDate = sub.expiresAt?.toDate ? sub.expiresAt.toDate() : (sub.expiresAt ? new Date(sub.expiresAt) : null)

                    const isSuperAdmin = isAdminEmail(sub.email)
                    const isAdminActivatedUser = !isSuperAdmin && (sub.gateway === 'admin_granted' || sub.adminActivated === true || sub.plan === 'lifetime_admin')

                    const isActive = (sub.status === 'active' || isSuperAdmin || isAdminActivatedUser) && (!expiresDate || expiresDate > new Date())
                    const isPending = !isSuperAdmin && (sub.status === 'pending_verification' || sub.status === 'registered')
                    const isRevoked = !isSuperAdmin && !isAdminActivatedUser && !isPending && (sub.status === 'revoked' || sub.status === 'expired' || sub.status === 'inactive')

                    return (
                      <div
                        key={sub.id || sub.userId}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: isActive ? (isSuperAdmin ? '1px solid #a5b4fc' : '1px solid #a7f3d0') : isPending ? '1.5px solid #f59e0b' : '1px solid var(--border-color, #e2e8f0)',
                          background: isActive ? (isSuperAdmin ? 'rgba(99,102,241,0.04)' : 'rgba(16,185,129,0.03)') : isPending ? 'rgba(245,158,11,0.05)' : 'var(--bg-subtle, #f8fafc)',
                          fontSize: 11,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 900, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                                Sl. {idx + 1}
                              </span>
                              <strong style={{ color: 'var(--text-primary, #1e293b)', fontSize: 11 }}>{sub.email || sub.userId}</strong>
                              {isActive && isAdminEmail(sub.email) && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: 'rgba(99,102,241,0.2)', color: '#4338ca', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  👑 Super Admin
                                </span>
                              )}
                              {isActive && isAdminActivatedUser && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: 'rgba(16,185,129,0.15)', color: '#047857', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  ⚡ Admin Activated
                                </span>
                              )}
                              {isActive && !isSuperAdmin && !isAdminActivatedUser && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: sub.plan === 'trial' ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.15)', color: sub.plan === 'trial' ? '#047857' : '#0284c7', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  {sub.plan === 'trial' ? '🎁 Free Trial' : '💳 Paid Sub'}
                                </span>
                              )}
                              {(!isActive && (sub.hadPaidSubscription || sub.paidAmount || sub.paymentId)) && (
                                <span style={{ fontSize: 7.5, fontWeight: 900, background: 'rgba(16,185,129,0.15)', color: '#047857', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  💳 Paid Record (₹{sub.paidAmount || 150})
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                              Plan: <strong style={{ color: '#6366f1' }}>{(sub.plan || 'NONE').toUpperCase()}</strong>
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
                            {isActive ? '🟢 Active' : isPending ? (sub.status === 'registered' ? '📋 Registered' : '⏳ Pending') : '🔴 Inactive'}
                          </span>
                        </div>

                        {/* Inline Actions */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {!isActive ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleManualSet('active', sub.email || sub.userId, 'yearly')}
                                  style={{ padding: '3px 8px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                                  title="Activate 1-Year Pro Subscription"
                                >
                                  ⚡ Activate 1Yr
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleManualSet('active', sub.email || sub.userId, 'monthly')}
                                  style={{ padding: '3px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                                  title="Activate 30-Day Pro Subscription"
                                >
                                  ⚡ Activate 30D
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const rawMobile = sub.mobile || sub.mobileNo || ''
                                    const cleanPhone = rawMobile.replace(/[^0-9]/g, '')
                                    const targetPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone
                                    const msg = encodeURIComponent(
                                      `Hi! 👋 Welcome to WalletVibe Pro — the premier personal finance manager.\n\n` +
                                      `Track your daily expenses, lend/borrow ledgers, and bank statements automatically with AI.\n\n` +
                                      `Start your trial or activate Pro access here: ${window.location.origin}`
                                    )
                                    window.open(targetPhone ? `https://wa.me/${targetPhone}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank')
                                  }}
                                  style={{ padding: '3px 8px', background: 'rgba(37, 211, 102, 0.15)', color: '#15803d', border: '1px solid rgba(37, 211, 102, 0.3)', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                                  title="Send WhatsApp Nudge to user to try WalletVibe Personal Finance"
                                >
                                  <i className="fab fa-whatsapp" style={{ marginRight: 3 }} /> Nudge
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
                                {!isSuperAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleManualSet('revoked', sub.email || sub.userId)}
                                    style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                                  >
                                    ⛔ Deactivate
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {!isAdminEmail(sub.email) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(sub.email || sub.userId || sub.id)}
                              style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                              title="Permanently Delete Account from Firestore (Both subscriptions & userProfiles)"
                            >
                              🗑️ Delete Account
                            </button>
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
              {/* Pricing section: Pro & Ultra Tiers */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 6 }}>
                  💰 Subscription Pricing Configuration (₹ INR)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Pro Monthly Price (₹)</label>
                    <input
                      type="number"
                      value={monthlyPrice}
                      onChange={(e) => setMonthlyPrice(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Pro Yearly Price (₹)</label>
                    <input
                      type="number"
                      value={yearlyPrice}
                      onChange={(e) => setYearlyPrice(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Ultra Tier Settings */}
                <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1.5px solid rgba(139, 92, 246, 0.25)', borderRadius: 8, padding: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#7c3aed', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>👑 Ultra Tier (Auto Bank Sync via Setu)</span>
                    <span style={{ fontSize: 8, background: ultraEnabled ? '#10b981' : '#f59e0b', color: '#fff', padding: '1px 5px', borderRadius: 99 }}>
                      {ultraEnabled ? 'ACTIVE' : 'SETUP / COMING SOON'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 8.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Ultra Monthly (₹)</label>
                      <input
                        type="number"
                        value={ultraMonthlyPrice}
                        onChange={(e) => setUltraMonthlyPrice(e.target.value)}
                        style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 8.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>Ultra Yearly (₹)</label>
                      <input
                        type="number"
                        value={ultraYearlyPrice}
                        onChange={(e) => setUltraYearlyPrice(e.target.value)}
                        style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 700, color: '#4c1d95', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={ultraEnabled}
                        onChange={(e) => setUltraEnabled(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: '#8b5cf6' }}
                      />
                      Enable Ultra Tier Purchase (Turn ON after Setu AA keys are configured)
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 700, color: '#6b21a8', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={ultraComingSoon}
                        onChange={(e) => setUltraComingSoon(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: '#ec4899' }}
                      />
                      Show "Coming Soon" badge on Ultra tier in Subscription modal
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hideUltraBanner}
                        onChange={(e) => setHideUltraBanner(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: '#4f46e5' }}
                      />
                      Hide "Coming Soon" Bank Sync banner completely in Bank History view
                    </label>
                  </div>
                </div>
              </div>

              {/* Subscriber Limit Section */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i className="fas fa-users-cog" /> Subscriber Limit Control</span>
                  <span style={{ fontSize: 8.5, color: limitNum <= 0 ? '#059669' : (regularActiveCount >= limitNum ? '#ef4444' : '#10b981'), background: limitNum <= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.08)', padding: '2px 8px', borderRadius: 99, fontWeight: 800 }}>
                    {limitNum <= 0 ? '♾️ Unlimited Allowed' : `Regular Active: ${regularActiveCount} / ${limitNum}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      value={subscriberLimit}
                      onChange={(e) => setSubscriberLimit(e.target.value)}
                      style={{ width: 75, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color, #cbd5e1)', fontSize: 12, fontWeight: 800, boxSizing: 'border-box', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #1e293b)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setSubscriberLimit(subscriberLimit === '0' ? '10' : '0')}
                      style={{
                        padding: '5px 10px',
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 6,
                        border: '1px solid #6366f1',
                        background: subscriberLimit === '0' ? '#6366f1' : 'rgba(99,102,241,0.08)',
                        color: subscriberLimit === '0' ? '#fff' : '#4f46e5',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {subscriberLimit === '0' ? '♾️ Unlimited Set' : 'Set Unlimited (0)'}
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 180, fontSize: 9.5, color: '#64748b', lineHeight: 1.35 }}>
                    Max regular subscribers allowed (enter <strong>0</strong> for Unlimited). Admin-activated accounts are <strong>exempt</strong>.
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

              {/* Gemini AI Multi-Key Setup */}
              <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary, #1e293b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-brain" style={{ color: '#6366f1' }} />
                    <span>🤖 Multiple Gemini AI API Keys (Auto-Rotation &amp; Failover)</span>
                  </div>
                  {(() => {
                    const validCount = extractValidGeminiKeys(geminiApiKeys).length
                    return (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800,
                        background: validCount > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                        color: validCount > 0 ? '#10b981' : '#d97706',
                        padding: '2px 8px', borderRadius: 99,
                        border: validCount > 0 ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                      }}>
                        {validCount > 0 ? `🟢 ${validCount} API Keys Configured` : '⚡ Using App Fallback Keys'}
                      </span>
                    )
                  })()}
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
                  Setup multiple Google Gemini API keys (comma or newline separated). If Key #1 hits rate limits (429) or quota errors, the app automatically switches to Key #2, Key #3, etc. for seamless AI parsing!
                </p>
                <textarea
                  rows={3}
                  value={geminiApiKeys}
                  onChange={(e) => setGeminiApiKeys(e.target.value)}
                  placeholder="Paste multiple Google AI Studio keys here (e.g. AIzaSyA123..., AIzaSyB456..., AIzaSyC789...)"
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
                    borderRadius: 8, border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #ffffff)', color: 'var(--text-primary, #1e293b)',
                    boxSizing: 'border-box', resize: 'vertical',
                  }}
                />
              </div>

              {/* Maintenance & Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>📄 Allow Non-CSV Imports (PDF Statements & AI Extraction)</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>Toggle whether users can upload PDF bank statements or non-CSV files using AI document extraction</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowNonCsvImport}
                    onChange={(e) => setAllowNonCsvImport(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </label>

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

              {/* Privacy Guard Notice Banner */}
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-user-shield" /> 🔒 User Privacy & Data Protection Active
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary, #475569)', marginTop: 4, lineHeight: 1.4 }}>
                  All user transactions (Expenses, Lending, Bank Statements) are stored in isolated documents scoped by User ID. Personal transaction descriptions, remarks, narration text, and proof attachments are strictly private and never rendered or exposed in admin tools.
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
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      Expenses: <strong>{calcStats.expensesCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      Lending: <strong>{calcStats.lendingCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      User Profiles: <strong>{calcStats.usersCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      Subscriptions: <strong>{calcStats.subsCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      Bank Sync: <strong>{calcStats.bankCount} docs</strong>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #1e293b)' }}>
                      Reviews &amp; Reminders: <strong>{(calcStats.reviewsCount || 0) + (calcStats.remindersCount || 0)} docs</strong>
                    </div>
                    <div style={{ gridColumn: 'span 2', padding: '8px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span>✔ Scanned {calcStats.totalDocs} docs (~{calcStats.calculatedMB} MiB payload)</span>
                      <button
                        type="button"
                        onClick={() => {
                          const val = calcStats.calculatedMB || 0.1
                          setStorageBytes(val)
                          setCloudMetricInput(String(val))
                          localStorage.setItem('wv_firestore_occupancy_mb', String(val))
                          showToast(`✔ Applied scanned payload (${val} MiB) to Storage Occupancy!`)
                        }}
                        style={{ padding: '4px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 9.5, fontWeight: 800, cursor: 'pointer' }}
                      >
                        ⚡ Apply to Gauge
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic' }}>
                    Click "Run Real-Time Scan" to query live document byte sizes across expenses, lending, user accounts, bank transactions, and reviews.
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
