import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { onAuthChange, signOut } from './api/auth'
import {
  addExpense, updateExpense, deleteExpense,
  getAllExpenses, computeSuggestions, computeExpenseStatsLocally,
} from './api/expenses'
import {
  addLending, updateLending, deleteLending,
  getAllLending, computeLendingStatsLocally,
} from './api/lending'

import { getSubscriptionStatus, listenSubscriptionStatus, isAdminEmail, ensureUserProfile } from './api/subscription'
import { getAppConfig, listenAppConfig } from './api/appConfig'
import { loadSnapshot } from './api/localCache'
import { fetchBankTransactionsFromFirestore, deleteBankTransaction, parseSafeDate } from './api/bankTransactions'
import { formatUserFriendlyError } from './utils/userFriendlyError'

import LoginScreen from './components/LoginScreen'
import InstallBanner from './components/InstallBanner'
import UpdateBanner from './components/UpdateBanner'
import OfflineSyncBanner from './components/OfflineSyncBanner'
import Header from './components/Header'
import ExpenseForm from './components/ExpenseForm'
import LendingForm from './components/LendingForm'
import TransactionList from './components/TransactionList'
import TransactionModal from './components/TransactionModal'
import WalletVibeLogo from './components/WalletVibeLogo'
import CustomDialogModal from './components/CustomDialogModal'

// Code-split heavy views & modals for ultra-fast mobile initial page load
const SubscriptionModal = lazy(() => import('./components/SubscriptionModal'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const PersonMergeModal = lazy(() => import('./components/PersonMergeModal'))
const ReportsView = lazy(() => import('./components/ReportsView'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))
const CsvImportModal = lazy(() => import('./components/CsvImportModal'))
const BankSearchModal = lazy(() => import('./components/BankSearchModal'))
const BankHistoryView = lazy(() => import('./components/BankHistoryView'))
const MigrationTool = lazy(() => import('./components/MigrationTool'))
const LegalModal = lazy(() => import('./components/LegalModal'))
const RatingModal = lazy(() => import('./components/RatingModal'))
const AboutModal = lazy(() => import('./components/AboutModal'))

function LazyLoader({ isView = false }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isView ? '60px 20px' : '40px 20px',
      gap: '12px',
      color: 'var(--text-muted, #64748b)',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid rgba(99, 102, 241, 0.2)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: '12px', fontWeight: 600 }}>Loading view...</span>
    </div>
  )
}


// Record when the app opened (for update banner age check)
window.__wv_open_time = Date.now()

export default function App() {
  // Auth
  const [authState, setAuthState] = useState({ loggedIn: false, uid: null, email: '', name: '' })
  const [authReady, setAuthReady] = useState(false)

  // Navigation
  const savedLastTab = localStorage.getItem('wv_last_active_tab')
  const startScreen = localStorage.getItem('wv_startScreen') || localStorage.getItem('wp_startScreen') || 'expense'
  const [activeTab, setActiveTabState] = useState(savedLastTab || startScreen)
  const [tabTransition, setTabTransition] = useState(false)

  function setActiveTab(tab) {
    setActiveTabState(tab)
    try {
      localStorage.setItem('wv_last_active_tab', tab)
    } catch (e) {}
  }

  // Data — Instant 0ms Initial Paint from Offline Snapshot Cache
  const [allExpenses, setAllExpenses] = useState(() => {
    const cached = loadSnapshot('expenses') || []
    return cached.map((e) => ({
      ...e,
      dateObj: parseSafeDate(e.dateObj || e.date),
      amount: parseFloat(e.amount) || 0,
    })).sort((a, b) => b.dateObj - a.dateObj)
  })
  const [allLending, setAllLending] = useState(() => {
    const cached = loadSnapshot('lending') || []
    return cached.map((l) => ({
      ...l,
      dateObj: parseSafeDate(l.dateObj || l.date),
      amount: parseFloat(l.amount) || 0,
    })).sort((a, b) => b.dateObj - a.dateObj)
  })
  const [stats, setStats] = useState(() => {
    const exp = loadSnapshot('expenses') || []
    const lend = loadSnapshot('lending') || []
    return {
      expense: computeExpenseStatsLocally(exp),
      lending: computeLendingStatsLocally(lend),
    }
  })
  const [recentExpenses, setRecentExpenses] = useState(() => {
    const cached = loadSnapshot('expenses') || []
    return cached.slice(0, 20).map((e) => ({ ...e, dateObj: parseSafeDate(e.dateObj || e.date) }))
  })
  const [recentLending, setRecentLending] = useState(() => {
    const cached = loadSnapshot('lending') || []
    return cached.slice(0, 20).map((l) => ({ ...l, dateObj: parseSafeDate(l.dateObj || l.date) }))
  })
  const [bankRecords, setBankRecords] = useState(() => {
    const cachedBank = loadSnapshot('bank') || []
    return cachedBank.map((b) => ({
      ...b,
      sheet: 'bank',
      isLend: false,
      amount: parseFloat(b.debit || b.credit || 0),
      category: b.bank || 'Bank',
      details: b.description || b.narration || '',
      dateObj: parseSafeDate(b.dateObj || b.date),
    }))
  })

  // Memoized derived calculations
  const suggestions = useMemo(() => computeSuggestions(allExpenses), [allExpenses])

  const searchIndex = useMemo(() => {
    const expenseItems = allExpenses.map((e) => ({
      ...e,
      sheet: 'expense',
      isLend: false,
      dateObj: parseSafeDate(e.dateObj || e.date),
    }))

    const lendingItems = allLending.map((l) => ({
      ...l,
      sheet: 'lending',
      isLend: true,
      dateObj: parseSafeDate(l.dateObj || l.date),
    }))

    return [...expenseItems, ...lendingItems, ...bankRecords].sort((a, b) => b.dateObj - a.dateObj)
  }, [allExpenses, allLending, bankRecords])

  // UI State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [registrationError, setRegistrationError] = useState('')

  // Modals
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [csvImportModalType, setCsvImportModalType] = useState(null) // 'expense' | 'lending' | null
  const [showBankSearch, setShowBankSearch] = useState(false)
  const [showBankMergeModal, setShowBankMergeModal] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [migrationUrl, setMigrationUrl] = useState('')
  const [legalModalTab, setLegalModalTab] = useState(null)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showAboutModal, setShowAboutModal] = useState(false)

  function closeLegalModal() {
    setLegalModalTab(null)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  // URL Hash or Query parameter listener for legal documents & notification deep links
  useEffect(() => {
    function handleHashOrQuery() {
      const searchParams = new URLSearchParams(window.location.search)
      const hash = window.location.hash.replace('#', '').toLowerCase()
      const pageTarget = searchParams.get('page')
      const actionTarget = searchParams.get('action')

      const legalTarget = hash || pageTarget
      if (['privacy', 'terms', 'refund', 'contact'].includes(legalTarget)) {
        setLegalModalTab(legalTarget)
        if (hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }

      if (actionTarget) {
        const act = actionTarget.toLowerCase()
        if (['subscription', 'upgrade', 'pro', 'plan'].includes(act)) {
          setShowSubscriptionModal(true)
        } else if (['admin', 'adminpanel'].includes(act)) {
          setShowAdminPanel(true)
        } else if (['bank', 'ifsc'].includes(act)) {
          setShowBankSearch(true)
        } else if (['settings', 'config'].includes(act)) {
          setShowSettings(true)
        }
        // Clean query parameter after triggering action cleanly
        window.history.replaceState(null, '', window.location.pathname)
      }
    }
    handleHashOrQuery()
    window.addEventListener('hashchange', handleHashOrQuery)
    return () => window.removeEventListener('hashchange', handleHashOrQuery)
  }, [])

  // Edit state
  const [editExpense, setEditExpense] = useState(null)
  const [editLending, setEditLending] = useState(null)

  // Subscription state
  const [subscriptionState, setSubscriptionState] = useState({ active: true, isAdmin: false, status: 'checking', plan: 'none' })
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)

  // App configuration (dynamic pricing, announcement, etc.)
  const [appConfig, setAppConfig] = useState(null)

  // Auth listener
  useEffect(() => {
    const unsub = onAuthChange((state) => {
      setAuthState(state)
      setAuthReady(true)
      if (state.loggedIn && state.uid) {
        // Fast instant local snapshot re-hydration for the logged in user
        const cachedExp = loadSnapshot('expenses', state.uid)
        const cachedLend = loadSnapshot('lending', state.uid)
        const cachedBank = loadSnapshot('bank', state.uid)
        if (cachedExp && cachedExp.length > 0) {
          const parsedExp = cachedExp.map((e) => ({ ...e, dateObj: parseSafeDate(e.dateObj || e.date) })).sort((a, b) => b.dateObj - a.dateObj)
          setAllExpenses(parsedExp)
          setRecentExpenses(parsedExp.slice(0, 20))
          setStats((prev) => ({ ...prev, expense: computeExpenseStatsLocally(parsedExp) }))
        }
        if (cachedLend && cachedLend.length > 0) {
          const parsedLend = cachedLend.map((l) => ({ ...l, dateObj: parseSafeDate(l.dateObj || l.date) })).sort((a, b) => b.dateObj - a.dateObj)
          setAllLending(parsedLend)
          setRecentLending(parsedLend.slice(0, 20))
          setStats((prev) => ({ ...prev, lending: computeLendingStatsLocally(parsedLend) }))
        }
        if (cachedBank && cachedBank.length > 0) {
          setBankRecords(cachedBank.map((b) => ({
            ...b,
            sheet: 'bank',
            isLend: false,
            amount: parseFloat(b.debit || b.credit || 0),
            category: b.bank || 'Bank',
            details: b.description || b.narration || '',
            dateObj: parseSafeDate(b.dateObj || b.date),
          })))
        }

        ensureUserProfile(state).catch((err) => {
          if (err?.code === 'REGISTRATION_CLOSED_LIMIT_REACHED' || err?.message?.includes('REGISTRATION_CLOSED_LIMIT_REACHED')) {
            signOut().catch(() => {})
            setAuthState({ loggedIn: false, uid: null, email: '', name: '' })
            const limitVal = err?.message?.split(':')[1] || '30'
            setRegistrationError(
              `🚫 Registration Paused: Online subscriber capacity is full (${limitVal} active accounts max). Brand new account registrations are currently paused. Please contact admin (walletpro26@gmail.com) for direct account access.`
            )
          }
        })
      }
    })
    return unsub
  }, [])

  // Apply saved theme
  useEffect(() => {
    const theme = localStorage.getItem('wv_theme') || localStorage.getItem('wp_theme') || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const isSubscriptionBlocking = !subscriptionState.active && !subscriptionState.isAdmin

  const activeModalName = useMemo(() => {
    if (selectedTxn) return 'selectedTxn'
    if (showSettings) return 'showSettings'
    if (csvImportModalType) return 'csvImportModalType'
    if (showBankSearch) return 'showBankSearch'
    if (showBankMergeModal) return 'showBankMergeModal'
    if (showMigration) return 'showMigration'
    if (legalModalTab) return 'legalModalTab'
    if (showRatingModal) return 'showRatingModal'
    if (showAboutModal) return 'showAboutModal'
    if (showSubscriptionModal) return 'showSubscriptionModal'
    if (showAdminPanel) return 'showAdminPanel'
    return null
  }, [
    selectedTxn, showSettings, csvImportModalType, showBankSearch,
    showBankMergeModal, showMigration, legalModalTab, showRatingModal,
    showAboutModal, showSubscriptionModal, showAdminPanel
  ])

  const closeAllModals = useCallback(() => {
    setSelectedTxn(null)
    setShowSettings(false)
    setCsvImportModalType(null)
    setShowBankSearch(false)
    setShowBankMergeModal(false)
    setShowMigration(false)
    setLegalModalTab(null)
    setShowRatingModal(false)
    setShowAboutModal(false)
    setShowSubscriptionModal(false)
    setShowAdminPanel(false)
  }, [])

  const lastModalRef = useRef(null)
  const isProgrammaticBackRef = useRef(false)

  // Push synthetic history state when any modal opens so phone back button closes modal instead of exiting app
  useEffect(() => {
    if (activeModalName && !lastModalRef.current) {
      window.history.pushState({ wvModalOpen: true, modalName: activeModalName }, '')
      lastModalRef.current = activeModalName
    } else if (!activeModalName && lastModalRef.current) {
      if (window.history.state?.wvModalOpen) {
        isProgrammaticBackRef.current = true
        window.history.back()
      }
      lastModalRef.current = null
    } else if (activeModalName) {
      lastModalRef.current = activeModalName
    }
  }, [activeModalName])

  // Mobile / Android Phone Back Button Handler — works for ALL modals & tabs across app
  useEffect(() => {
    function handlePopState(e) {
      if (isProgrammaticBackRef.current) {
        isProgrammaticBackRef.current = false
        return
      }

      if (activeModalName || lastModalRef.current) {
        closeAllModals()
        lastModalRef.current = null
      } else if (activeTab !== 'expense') {
        setActiveTab('expense')
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [activeModalName, activeTab, closeAllModals])

  // Load data & subscription when logged in, and subscribe to real-time appConfig & subscription changes
  useEffect(() => {
    const unsubConfig = listenAppConfig((cfg) => {
      setAppConfig(cfg)
    })

    let unsubSub = null

    if (authState.loggedIn) {
      checkSubscription(authState)
      loadDashboard()

      unsubSub = listenSubscriptionStatus(authState.uid, authState.email, (sub) => {
        setSubscriptionState(sub)
        if (sub.active || sub.isAdmin) {
          setShowSubscriptionModal(false)
        }
      })
    }

    return () => {
      unsubConfig?.()
      unsubSub?.()
    }
  }, [authState.loggedIn, authState.uid, authState.email])

  const checkSubscription = useCallback(async (user) => {
    try {
      const sub = await getSubscriptionStatus(user)
      setSubscriptionState(sub)
      // If non-admin and inactive/expired/pending, show subscription modal automatically
      if (!sub.active && !sub.isAdmin) {
        setShowSubscriptionModal(true)
      } else {
        setShowSubscriptionModal(false)
      }
    } catch (err) {
      console.warn('[App] Check subscription failed:', err?.message)
    }
  }, [])

  const loadDashboard = useCallback(async (forceRefresh = true) => {
    // Only show blocking loading state if there's currently zero cached data
    if (allExpenses.length === 0 && allLending.length === 0) {
      setLoading(true)
    }
    setError('')
    try {
      const activeUid = authState.uid || auth?.currentUser?.uid || ''
      const [allExp, allL, bankRaw] = await Promise.all([
        getAllExpenses(forceRefresh, activeUid),
        getAllLending(forceRefresh, activeUid),
        fetchBankTransactionsFromFirestore(activeUid, subscriptionState?.isAdmin || isAdminEmail(authState?.email), forceRefresh).catch(() => []),
      ])
      const expStats = computeExpenseStatsLocally(allExp)
      const lendStats = computeLendingStatsLocally(allL)
      const recent = allExp.slice(0, 20)
      const recentL = allL.slice(0, 20)

      setStats({ expense: expStats, lending: lendStats })
      setRecentExpenses(recent)
      setRecentLending(recentL)
      setAllExpenses(allExp)
      setAllLending(allL)

      setBankRecords(
        (Array.isArray(bankRaw) ? bankRaw : []).map((b) => ({
          ...b,
          sheet: 'bank',
          isLend: false,
          amount: parseFloat(b.debit || b.credit || 0),
          category: b.bank || 'Bank',
          details: b.description || b.narration || '',
          dateObj: parseSafeDate(b.dateObj || b.date),
        }))
      )
    } catch (err) {
      setError(formatUserFriendlyError(err, 'Failed to load transaction data. Please refresh.'))
    } finally {
      setLoading(false)
    }
  }, [authState.uid, authState.email, subscriptionState?.isAdmin, allExpenses.length, allLending.length])

  function showToast(msg, isOffline = false) {
    setToast({ msg, isOffline })
    setTimeout(() => setToast(''), 3000)
  }

  // Animated tab switch with mobile back button history support
  function switchTab(tab) {
    if (tab === activeTab) return
    if (activeTab === 'expense' && tab !== 'expense') {
      window.history.pushState({ wvTabOpen: true, tab }, '')
    }
    setTabTransition(true)
    setTimeout(() => {
      setActiveTab(tab)
      setTabTransition(false)
    }, 150)
  }

  // Expense save
  async function handleSaveExpense(data) {
    setLoading(true)
    setError('')
    try {
      if (data.id) {
        const result = await updateExpense(data.id, data)
        showToast(result.offline ? '✔ Saved offline — will sync when online' : 'Expense updated!', result.offline)
      } else {
        const result = await addExpense(data)
        showToast(result.offline ? '✔ Saved offline — will sync when online' : 'Expense saved!', result.offline)
      }
      setEditExpense(null)
      await loadDashboard()
    } catch (err) {
      setError(err?.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  // Lending save
  async function handleSaveLending(data) {
    setLoading(true)
    setError('')
    try {
      if (data.id) {
        const result = await updateLending(data.id, data)
        showToast(result.offline ? '✔ Saved offline — will sync when online' : 'Record updated!', result.offline)
      } else {
        const result = await addLending(data)
        showToast(result.offline ? '✔ Saved offline — will sync when online' : 'Record saved!', result.offline)
      }
      setEditLending(null)
      await loadDashboard()
    } catch (err) {
      setError(err?.message || 'Save failed')
    } finally {
      setLoading(false)
    }
  }

  // Edit from modal
  function handleEdit(item) {
    setSelectedTxn(null)
    const isLend = Boolean(item.sheet === 'lending' || item.isLend || item.person || item.formType === 'lending')
    const isBank = Boolean(item.sheet === 'bank' || item.bank)

    if (isBank) {
      switchTab('bank')
    } else if (isLend) {
      setEditLending(item)
      switchTab('lending')
    } else {
      setEditExpense(item)
      switchTab('expense')
    }
  }

  // Delete from modal
  async function handleDelete(item) {
    setSelectedTxn(null)
    setLoading(true)
    const isLend = Boolean(item.sheet === 'lending' || item.isLend || item.person || item.formType === 'lending')
    const isBank = Boolean(item.sheet === 'bank' || item.bank)

    try {
      if (isBank) {
        await deleteBankTransaction(item.id)
      } else if (isLend) {
        await deleteLending(item.id)
      } else {
        await deleteExpense(item.id)
      }
      showToast('Deleted!')
      await loadDashboard()
    } catch (err) {
      setError(err?.message || 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await signOut()
    setAuthState({ loggedIn: false, uid: null, email: '', name: '' })
    setRecentExpenses([])
    setRecentLending([])
    setAllExpenses([])
    setAllLending([])
    // Security: Purge sensitive cached data on logout
    localStorage.removeItem('wv_cache_expenses')
    localStorage.removeItem('wv_cache_lending')
    localStorage.removeItem('wv_cache_bank')
    localStorage.removeItem('wv_pending_queue')
  }

  // ─── Splash screen (auth not ready) ────────────────────────────────────────
  if (!authReady) {
    return (
      <div className="splash-screen">
        <div className="splash-orb splash-orb-1" />
        <div className="splash-orb splash-orb-2" />
        <div className="splash-content">
          {/* Glowing Orbital Spinning Circle Around Logo */}
          <div className="splash-logo-orbit-wrapper">
            <div className="splash-spinner-ring" />
            <div className="splash-spinner-ring-reverse" />
            <div className="splash-glow-pulse" />
            <div className="splash-logo-core">
              <WalletVibeLogo size={76} variant="icon" animate={false} />
            </div>
          </div>
          <div className="splash-name">
            <span className="splash-wallet">Wallet</span>
            <span className="splash-vibe">Vibe</span>
          </div>
          <div className="splash-tagline">Personal Finance, Simplified</div>
          <div className="splash-loader">
            <div className="splash-loader-bar" />
          </div>
        </div>
      </div>
    )
  }

  // Login screen
  if (!authState.loggedIn) {
    return <LoginScreen registrationError={registrationError} appConfig={appConfig} />
  }

  return (
    <div className="app-shell">
      {/* Banners */}
      <UpdateBanner />
      <OfflineSyncBanner onSyncComplete={loadDashboard} />
      <InstallBanner />

      <Header
        auth={authState}
        stats={stats}
        activeTab={activeTab}
        searchIndex={searchIndex}
        subscription={subscriptionState}
        allowNonCsvImport={(subscriptionState?.isAdmin || isAdminEmail(authState?.email)) || (appConfig?.allowNonCsvImport !== false)}
        onLogout={handleLogout}
        onRefresh={loadDashboard}
        onSettings={() => setShowSettings(true)}
        onBankSearch={() => setShowBankSearch(true)}
        onSearchSelect={(item) => setSelectedTxn(item)}
        onManageSubscription={() => setShowSubscriptionModal(true)}
        onAdminPanel={() => setShowAdminPanel(true)}
        onOpenCsvImport={(mode) => setCsvImportModalType(mode)}
        onOpenRatingModal={() => setShowRatingModal(true)}
      />

      {/* Tab Bar */}
      <div className="tab-bar">
        <div className="tab-bar-inner">
          <button
            className={`tab-btn ${activeTab === 'expense' ? 'active' : ''}`}
            onClick={() => switchTab('expense')}
          >
            <i className="fas fa-receipt" style={{ marginRight: 5, fontSize: 10 }}></i>
            Expenses
          </button>
          <button
            className={`tab-btn ${activeTab === 'lending' ? 'active' : ''}`}
            onClick={() => switchTab('lending')}
          >
            <i className="fas fa-handshake" style={{ marginRight: 5, fontSize: 10 }}></i>
            Lend/Borrow
          </button>
          <button
            className={`tab-btn ${activeTab === 'bank' ? 'active' : ''}`}
            onClick={() => switchTab('bank')}
          >
            <i className="fas fa-university" style={{ marginRight: 5, fontSize: 10 }}></i>
            Bank History
          </button>
          <button
            className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => switchTab('reports')}
          >
            <i className="fas fa-chart-bar" style={{ marginRight: 5, fontSize: 10 }}></i>
            Reports
          </button>
        </div>
      </div>

      {/* Global App Announcement Banner (Rendered below Tab Bar for clean un-cropped view) */}
      {appConfig?.announcement && (
        <div
          onClick={() => {
            const text = (appConfig.announcement || '').toLowerCase()
            if (text.includes('pro') || text.includes('upgrade') || text.includes('offer') || text.includes('subscription')) {
              setShowSubscriptionModal(true)
            } else if (text.includes('bank') || text.includes('ifsc')) {
              setShowBankSearch(true)
            } else if (text.includes('admin')) {
              setShowAdminPanel(true)
            }
          }}
          style={{
            margin: '8px 12px 2px 12px',
            padding: '6px 12px',
            borderRadius: '10px',
            background: appConfig.announcementType === 'warning'
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.22))'
              : appConfig.announcementType === 'success'
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.22))'
              : 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(139, 92, 246, 0.22))',
            border: `1px solid ${
              appConfig.announcementType === 'warning' ? 'rgba(245, 158, 11, 0.35)' : appConfig.announcementType === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.35)'
            }`,
            color: appConfig.announcementType === 'warning' ? '#f59e0b' : appConfig.announcementType === 'success' ? '#34d399' : '#818cf8',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>
              {appConfig.announcementType === 'warning' ? '⚠️' : appConfig.announcementType === 'success' ? '✅' : '⚡'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appConfig.announcement.replace('Ugrade', 'Upgrade').replace('Limit offer', 'Limited Time Offer')}
            </span>
          </div>
          {(appConfig.announcement.toLowerCase().includes('pro') || appConfig.announcement.toLowerCase().includes('upgrade') || appConfig.announcement.toLowerCase().includes('offer')) && (
            <span style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: '99px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#fff',
              fontWeight: 800,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
              whiteSpace: 'nowrap',
            }}>
              Upgrade &rarr;
            </span>
          )}
        </div>
      )}

      {/* Targeted Pending / Registered User Personal Finance Nudge Banner */}
      {!appConfig?.announcement && (!subscriptionState?.status || subscriptionState?.status === 'registered' || subscriptionState?.status === 'pending_verification' || subscriptionState?.status === 'none') && !subscriptionState?.isAdmin && (
        <div
          onClick={() => setShowSubscriptionModal(true)}
          style={{
            margin: '8px 12px 2px 12px',
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.12))',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: 'var(--text-primary, #1e293b)',
            fontSize: '11.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>📊</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Master your personal finances! Start your trial or activate Pro to unlock AI bank statement parsing.
            </span>
          </div>
          <span style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: '99px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
            whiteSpace: 'nowrap',
          }}>
            Try Pro ⚡
          </span>
        </div>
      )}

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="loading-strip">
          <div className="loading-strip-bar" />
        </div>
      )}

      {/* Content */}
      <div className={`content-area custom-scrollbar${tabTransition ? ' tab-exit' : ' tab-enter'}`}>
        {activeTab === 'expense' && (
          <>
            <ExpenseForm
              key={editExpense?.id || 'new'}
              suggestions={suggestions}
              onSave={handleSaveExpense}
              loading={loading}
              editData={editExpense}
              onCancelEdit={() => setEditExpense(null)}
            />
            <TransactionList
              items={recentExpenses}
              title="Recent Expenses"
              onSelect={(item) => setSelectedTxn(item)}
            />
          </>
        )}

        {activeTab === 'lending' && (
          <>
            <LendingForm
              key={editLending?.id || 'new'}
              suggestions={{ persons: [...new Set(allLending.map((l) => l.person).filter(Boolean))] }}
              allLending={allLending}
              onSave={handleSaveLending}
              loading={loading}
              editData={editLending}
              onCancelEdit={() => setEditLending(null)}
            />
            <TransactionList
              items={recentLending}
              allLending={allLending}
              title="Recent Lend / Borrow"
              onSelect={(item) => setSelectedTxn(item)}
            />
          </>
        )}

        {activeTab === 'bank' && (
          <Suspense fallback={<LazyLoader isView={true} />}>
            <BankHistoryView
              bankRecords={bankRecords}
              uid={authState.uid}
              isAdmin={subscriptionState.isAdmin || isAdminEmail(authState?.email)}
              allowNonCsvImport={appConfig?.allowNonCsvImport !== false}
              subscription={subscriptionState}
              appConfig={appConfig}
              onOpenSubscriptionModal={() => setShowSubscriptionModal(true)}
              onOpenImport={() => setShowBankSearch(true)}
              onOpenMerge={() => setShowBankMergeModal(true)}
            />
          </Suspense>
        )}

        {activeTab === 'reports' && (
          <Suspense fallback={<LazyLoader isView={true} />}>
            <ReportsView
              bankRecords={bankRecords}
              allExpenses={allExpenses}
              allLending={allLending}
              uid={authState.uid}
              isAdmin={subscriptionState.isAdmin || isAdminEmail(authState?.email)}
              onSelectTxn={setSelectedTxn}
              onMergeComplete={loadDashboard}
            />
          </Suspense>
        )}

        <div className="app-footer">
          <p>© {new Date().getFullYear()} <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer">NextLifTechnologies</a> (<a href="mailto:walletpro26@gmail.com">walletpro26@gmail.com</a>)</p>
          <div style={{ marginBottom: 6 }}>
            <a href="#about" onClick={(e) => { e.preventDefault(); setShowAboutModal(true) }} style={{ fontWeight: 700, color: 'var(--accent-600, #4f46e5)', fontSize: 11.5 }}>
              ℹ️ About App &amp; Features (How to Use Guide)
            </a>
          </div>
          <div className="footer-legal-links" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
            <a href="#privacy" onClick={(e) => { e.preventDefault(); setLegalModalTab('privacy') }}>Privacy Policy</a>
            <span className="footer-divider">•</span>
            <a href="#terms" onClick={(e) => { e.preventDefault(); setLegalModalTab('terms') }}>Terms &amp; Conditions</a>
            <span className="footer-divider">•</span>
            <a href="#refund" onClick={(e) => { e.preventDefault(); setLegalModalTab('refund') }}>Refund Policy</a>
            <span className="footer-divider">•</span>
            <a href="#contact" onClick={(e) => { e.preventDefault(); setLegalModalTab('contact') }}>Contact Us</a>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Suspense fallback={<LazyLoader />}>
        {showAboutModal && (
          <AboutModal onClose={() => setShowAboutModal(false)} />
        )}
        {selectedTxn && (() => {
          const activeTxnList = (selectedTxn.sheet === 'bank' || selectedTxn.bank !== undefined)
            ? (bankRecords || [])
            : (selectedTxn.isLend || selectedTxn.sheet === 'lending')
            ? (allLending || [])
            : (allExpenses || [])

          const selectedTxnIndex = activeTxnList.findIndex((t) => (t.id && t.id === selectedTxn.id) || t === selectedTxn)
          const handlePrevTxn = selectedTxnIndex > 0 ? () => setSelectedTxn(activeTxnList[selectedTxnIndex - 1]) : null
          const handleNextTxn = selectedTxnIndex >= 0 && selectedTxnIndex < activeTxnList.length - 1 ? () => setSelectedTxn(activeTxnList[selectedTxnIndex + 1]) : null

          return (
            <TransactionModal
              item={selectedTxn}
              allLending={allLending}
              onClose={() => setSelectedTxn(null)}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPrev={handlePrevTxn}
              onNext={handleNextTxn}
            />
          )
        })()}
        {showSettings && (
          <SettingsModal
            auth={authState}
            subscription={subscriptionState}
            onClose={() => setShowSettings(false)}
            onSave={() => {}}
            onOpenCsvImport={(type) => setCsvImportModalType(type)}
            onOpenRatingModal={() => setShowRatingModal(true)}
            onMigrate={(url) => {
              setMigrationUrl(url)
              setShowSettings(false)
              setShowMigration(true)
            }}
            onManageSubscription={() => setShowSubscriptionModal(true)}
          />
        )}
        {showRatingModal && (
          <RatingModal
            user={authState}
            onClose={() => setShowRatingModal(false)}
          />
        )}
        {csvImportModalType && (
          <CsvImportModal
            type={csvImportModalType}
            isAdmin={subscriptionState.isAdmin || isAdminEmail(authState?.email)}
            allowNonCsvImport={appConfig?.allowNonCsvImport !== false}
            onClose={() => setCsvImportModalType(null)}
            onImportComplete={loadDashboard}
          />
        )}
        {showSubscriptionModal && (
          <SubscriptionModal
            user={authState}
            subscription={subscriptionState}
            appConfig={appConfig}
            isBlocking={!subscriptionState.active && !subscriptionState.isAdmin}
            onClose={() => setShowSubscriptionModal(false)}
            onLogout={handleLogout}
            onSubscriptionSuccess={() => {
              checkSubscription(authState)
              setToast('🎉 Subscription activated successfully!')
              setTimeout(() => setToast(''), 4000)
            }}
          />
        )}
        {showAdminPanel && (
          <AdminPanel
            auth={authState}
            onClose={() => setShowAdminPanel(false)}
          />
        )}
        {showBankSearch && (
          <BankSearchModal
            uid={authState.uid}
            isAdmin={subscriptionState.isAdmin || isAdminEmail(authState?.email)}
            allowNonCsvImport={appConfig?.allowNonCsvImport !== false}
            onClose={() => setShowBankSearch(false)}
            onMergeComplete={loadDashboard}
          />
        )}
        {showBankMergeModal && (
          <PersonMergeModal
            allExpenses={allExpenses}
            allLending={allLending}
            uid={authState.uid}
            initialEntityType="bank"
            onClose={() => setShowBankMergeModal(false)}
            onMergeComplete={loadDashboard}
          />
        )}
        {showMigration && (
          <MigrationTool
            uid={authState.uid}
            gasUrl={migrationUrl}
            onClose={() => setShowMigration(false)}
            onComplete={loadDashboard}
          />
        )}
        {legalModalTab && (
          <LegalModal
            initialTab={legalModalTab}
            onClose={closeLegalModal}
          />
        )}
      </Suspense>

      {/* Global Custom Popup Dialog */}
      <CustomDialogModal />

      {/* Toast */}
      {toast && (
        <div className={`success-toast ${toast.isOffline ? 'toast-offline' : ''}`}>
          {toast.msg || toast}
        </div>
      )}
    </div>
  )
}
