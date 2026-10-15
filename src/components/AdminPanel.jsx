import { useState, useEffect } from 'react'
import AdminPanelView from './AdminPanelView'
import { db } from '../firebase'
import { collection, getDocs } from 'firebase/firestore'
import { getAppConfig, updateAppConfig, invalidateConfigCache } from '../api/appConfig'
import { showConfirm } from './CustomDialogModal'
import {
  isAdminEmail,
  getAllSubscriptions,
  revokeSubscription,
  reactivateSubscription,
  adminSetSubscriptionByEmailOrUid,
  listenAllSubscriptions,
  purgeDuplicateSubscriptions,
  deleteSubscriptionAccount,
  backfillUserProfiles,
  deduplicateSubscriptions,
  getSubscriberCounts,
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
  const [geminiModels, setGeminiModels] = useState('gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro')

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
      setGeminiModels(cfg.geminiModels || 'gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro')
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
        geminiModels,
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
    const confirmed = await showConfirm({
      title: 'Purge Duplicate Subscriptions',
      message: 'Scan Firestore and permanently delete duplicate subscription documents for the same email?',
      confirmText: 'Purge Duplicates',
      cancelText: 'Cancel',
      variant: 'danger',
      icon: '🧹',
    })
    if (!confirmed) return
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
    const confirmed = await showConfirm({
      title: 'Delete Account',
      message: `⚠️ Permanently delete account "${target}" from Firestore?\n\nThis will remove both subscriptions and userProfiles documents associated with this email/UID.`,
      confirmText: 'Permanently Delete',
      cancelText: 'Cancel',
      variant: 'danger',
      icon: '⚠️',
    })
    if (!confirmed) return
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

  const settings = { monthlyPrice, yearlyPrice, ultraMonthlyPrice, ultraYearlyPrice, ultraEnabled, ultraComingSoon, hideUltraBanner, subscriberLimit, announcement, announcementType, maintenanceMode, razorpayEnabled, razorpayMode, razorpayKeyId, cashfreeEnabled, cashfreeMode, cashfreeAppId, allowNonCsvImport, geminiApiKeys, geminiModels }
  const setters = { monthlyPrice: setMonthlyPrice, yearlyPrice: setYearlyPrice, ultraMonthlyPrice: setUltraMonthlyPrice, ultraYearlyPrice: setUltraYearlyPrice, ultraEnabled: setUltraEnabled, ultraComingSoon: setUltraComingSoon, hideUltraBanner: setHideUltraBanner, subscriberLimit: setSubscriberLimit, announcement: setAnnouncement, announcementType: setAnnouncementType, maintenanceMode: setMaintenanceMode, razorpayEnabled: setRazorpayEnabled, razorpayMode: setRazorpayMode, razorpayKeyId: setRazorpayKeyId, cashfreeEnabled: setCashfreeEnabled, cashfreeMode: setCashfreeMode, cashfreeAppId: setCashfreeAppId, allowNonCsvImport: setAllowNonCsvImport, geminiApiKeys: setGeminiApiKeys, geminiModels: setGeminiModels }
  function updateSetting(key, value) {
    setters[key]?.(value)
    if (key === 'razorpayEnabled' && value) setCashfreeEnabled(false)
    if (key === 'cashfreeEnabled' && value) setRazorpayEnabled(false)
  }

  const accounts = filteredSubscriptions.map(sub => {
    const expiresDate = sub.expiresAt?.toDate ? sub.expiresAt.toDate() : (sub.expiresAt ? new Date(sub.expiresAt) : null)
    const isSuperAdmin = isAdminEmail(sub.email)
    const isAdminActivatedUser = !isSuperAdmin && (sub.gateway === 'admin_granted' || sub.adminActivated === true || sub.plan === 'lifetime_admin')
    const isActive = (sub.status === 'active' || isSuperAdmin || isAdminActivatedUser) && (!expiresDate || expiresDate > new Date())
    return { ...sub, expiresDate: expiresDate && !isNaN(expiresDate) ? expiresDate : null, isSuperAdmin, isActive, isPending: !isSuperAdmin && !isActive && (sub.status === 'pending_verification' || sub.status === 'registered') }
  })

  function accountAction(action, account) {
    const target = account.email || account.userId || account.id
    if (action === 'monthly' || action === 'yearly') handleManualSet('active', target, action)
    if (action === 'deactivate') handleManualSet('revoked', target)
    if (action === 'delete') handleDeleteAccount(target)
    if (action === 'custom') {
      const days = window.prompt('Number of days to add:', '30')
      if (days && Number.isFinite(Number(days)) && Number(days) > 0) handleManualSet('active', target, String(Number(days)))
    }
    if (action === 'nudge') {
      const phone = String(account.mobile || account.mobileNo || '').replace(/[^0-9]/g, '')
      const targetPhone = phone.length === 10 ? '91' + phone : phone
      const message = encodeURIComponent('Hi! You can review your WalletVibe access here: ' + window.location.origin)
      window.open('https://wa.me/' + targetPhone + '?text=' + message, '_blank', 'noopener,noreferrer')
    }
  }

  function saveMetric() {
    const value = Number(cloudMetricInput)
    if (!cloudMetricInput.trim() || !Number.isFinite(value) || value < 0) { setError('Enter a valid storage value in MiB.'); return }
    setStorageBytes(value)
    localStorage.setItem('wv_firestore_occupancy_mb', String(value))
    showToast('Storage value updated.')
  }

  return <AdminPanelView
    auth={auth} onClose={onClose} activeTab={activeTab} onTabChange={setActiveTab}
    loading={loading} saving={saving} toast={toast} error={error} onDismissError={() => setError('')}
    accounts={accounts} counts={{ totalAccounts, adminActivatedCount, regularActiveCount, pendingSubsCount, revokedSubsCount }}
    filterTab={filterTab} onFilterChange={setFilterTab} search={searchFilter} onSearchChange={setSearchFilter}
    refreshing={refreshing} onRefresh={handleRefresh}
    showQuickActivate={showQuickActivate} onToggleActivate={() => setShowQuickActivate(!showQuickActivate)}
    manualUser={manualUser} onManualUserChange={setManualUser} manualPlan={manualPlan} onManualPlanChange={setManualPlan} manualSubmitting={manualSubmitting} onManualSet={handleManualSet}
    showSyncPanel={showSyncPanel} onToggleSync={() => setShowSyncPanel(!showSyncPanel)} syncEmails={syncEmails} onSyncEmailsChange={setSyncEmails} syncing={syncing} onSyncUsers={handleSyncUsers}
    purging={purging} onPurge={handlePurgeDuplicates} onAccountAction={accountAction}
    settings={settings} onSettingChange={updateSetting} onSaveSettings={handleSaveConfig}
    storageBytes={storageBytes} cloudMetricInput={cloudMetricInput} onCloudMetricChange={setCloudMetricInput} onSaveMetric={saveMetric}
    calculatingStorage={calculatingStorage} onScan={calculateRealtimeStorage} calcStats={calcStats}
  />
}
