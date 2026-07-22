import { useEffect, useState, useCallback, useMemo } from 'react'
import { onAuthChange, signOut } from './api/auth'
import {
  addExpense, updateExpense, deleteExpense,
  getAllExpenses, computeSuggestions, computeExpenseStatsLocally,
} from './api/expenses'
import {
  addLending, updateLending, deleteLending,
  getAllLending, computeLendingStatsLocally,
} from './api/lending'

import LoginScreen from './components/LoginScreen'
import InstallBanner from './components/InstallBanner'
import UpdateBanner from './components/UpdateBanner'
import OfflineSyncBanner from './components/OfflineSyncBanner'
import Header from './components/Header'
import ExpenseForm from './components/ExpenseForm'
import LendingForm from './components/LendingForm'
import TransactionList from './components/TransactionList'
import TransactionModal from './components/TransactionModal'
import ReportsView from './components/ReportsView'
import SettingsModal from './components/SettingsModal'
import BankSearchModal from './components/BankSearchModal'
import MigrationTool from './components/MigrationTool'
import WalletVibeLogo from './components/WalletVibeLogo'

// Record when the app opened (for update banner age check)
window.__wv_open_time = Date.now()

export default function App() {
  // Auth
  const [authState, setAuthState] = useState({ loggedIn: false, uid: null, email: '', name: '' })
  const [authReady, setAuthReady] = useState(false)

  // Navigation
  const startScreen = localStorage.getItem('wv_startScreen') || localStorage.getItem('wp_startScreen') || 'expense'
  const [activeTab, setActiveTab] = useState(startScreen)
  const [tabTransition, setTabTransition] = useState(false)

  // Data
  const [stats, setStats] = useState({ expense: { today: 0, month: 0, total: 0 }, lending: { receivable: 0, payable: 0, net: 0 } })
  const [recentExpenses, setRecentExpenses] = useState([])
  const [recentLending, setRecentLending] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [allLending, setAllLending] = useState([])

  // Memoized derived calculations
  const suggestions = useMemo(() => computeSuggestions(allExpenses), [allExpenses])

  const searchIndex = useMemo(() => {
    return [
      ...allExpenses.map((e) => ({ ...e, sheet: 'expense', isLend: false })),
      ...allLending.map((l) => ({ ...l, sheet: 'lending', isLend: true })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [allExpenses, allLending])

  // UI State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Modals
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showBankSearch, setShowBankSearch] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [migrationUrl, setMigrationUrl] = useState('')

  // Edit state
  const [editExpense, setEditExpense] = useState(null)
  const [editLending, setEditLending] = useState(null)

  // Auth listener
  useEffect(() => {
    const unsub = onAuthChange((state) => {
      setAuthState(state)
      setAuthReady(true)
    })
    return unsub
  }, [])

  // Apply saved theme
  useEffect(() => {
    const theme = localStorage.getItem('wv_theme') || localStorage.getItem('wp_theme') || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  // Load data when logged in
  useEffect(() => {
    if (authState.loggedIn) loadDashboard()
  }, [authState.loggedIn])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [allExp, allL] = await Promise.all([
        getAllExpenses(),
        getAllLending(),
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
    } catch (err) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  function showToast(msg, isOffline = false) {
    setToast({ msg, isOffline })
    setTimeout(() => setToast(''), 3000)
  }

  // Animated tab switch
  function switchTab(tab) {
    if (tab === activeTab) return
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
    if (item.sheet === 'lending' || item.isLend) {
      setEditLending(item)
      setActiveTab('lending')
    } else {
      setEditExpense(item)
      setActiveTab('expense')
    }
  }

  // Delete from modal
  async function handleDelete(item) {
    setSelectedTxn(null)
    setLoading(true)
    try {
      if (item.sheet === 'lending' || item.isLend) {
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
          <WalletVibeLogo size={72} variant="icon" animate={true} />
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
    return <LoginScreen onLogin={() => {}} />
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
        onLogout={handleLogout}
        onRefresh={loadDashboard}
        onSettings={() => setShowSettings(true)}
        onBankSearch={() => setShowBankSearch(true)}
        onSearchSelect={(item) => setSelectedTxn(item)}
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
            className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => switchTab('reports')}
          >
            <i className="fas fa-chart-bar" style={{ marginRight: 5, fontSize: 10 }}></i>
            Reports
          </button>
        </div>
      </div>

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

        {activeTab === 'reports' && (
          <ReportsView
            allExpenses={allExpenses}
            allLending={allLending}
            onSelectTxn={setSelectedTxn}
          />
        )}

        <div className="app-footer">
          <p>© NextLifTechnologies (<a href="mailto:walletpro26@gmail.com">walletpro26@gmail.com</a>)</p>
        </div>
      </div>

      {/* Modals */}
      {selectedTxn && (
        <TransactionModal
          item={selectedTxn}
          allLending={allLending}
          onClose={() => setSelectedTxn(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {showSettings && (
        <SettingsModal
          auth={authState}
          onClose={() => setShowSettings(false)}
          onSave={() => {}}
          onMigrate={(url) => {
            setMigrationUrl(url)
            setShowSettings(false)
            setShowMigration(true)
          }}
        />
      )}
      {showBankSearch && (
        <BankSearchModal uid={authState.uid} onClose={() => setShowBankSearch(false)} />
      )}
      {showMigration && (
        <MigrationTool
          uid={authState.uid}
          gasUrl={migrationUrl}
          onClose={() => setShowMigration(false)}
          onComplete={loadDashboard}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`success-toast ${toast.isOffline ? 'toast-offline' : ''}`}>
          {toast.msg || toast}
        </div>
      )}
    </div>
  )
}
