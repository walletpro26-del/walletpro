import { useEffect, useState, useCallback } from 'react'
import { onAuthChange, signOut } from './api/auth'
import {
  addExpense, updateExpense, deleteExpense,
  getRecentExpenses, getAllExpenses, getExpenseStats, computeSuggestions,
} from './api/expenses'
import {
  addLending, updateLending, deleteLending,
  getRecentLending, getAllLending, getLendingStats,
} from './api/lending'

import LoginScreen from './components/LoginScreen'
import InstallBanner from './components/InstallBanner'
import Header from './components/Header'
import ExpenseForm from './components/ExpenseForm'
import LendingForm from './components/LendingForm'
import TransactionList from './components/TransactionList'
import TransactionModal from './components/TransactionModal'
import ReportsView from './components/ReportsView'
import SettingsModal from './components/SettingsModal'
import BankSearchModal from './components/BankSearchModal'
import MigrationTool from './components/MigrationTool'

export default function App() {
  // Auth
  const [authState, setAuthState] = useState({ loggedIn: false, uid: null, email: '', name: '' })
  const [authReady, setAuthReady] = useState(false)

  // Navigation
  const startScreen = localStorage.getItem('wp_startScreen') || 'expense'
  const [activeTab, setActiveTab] = useState(startScreen)

  // Data
  const [stats, setStats] = useState({ expense: { today: 0, month: 0, total: 0 }, lending: { receivable: 0, payable: 0, net: 0 } })
  const [recentExpenses, setRecentExpenses] = useState([])
  const [recentLending, setRecentLending] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [allLending, setAllLending] = useState([])
  const [suggestions, setSuggestions] = useState(null)
  const [searchIndex, setSearchIndex] = useState([])

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
    const theme = localStorage.getItem('wp_theme') || 'light'
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
      const [expStats, lendStats, recent, recentL, allExp, allL] = await Promise.all([
        getExpenseStats(),
        getLendingStats(),
        getRecentExpenses(20),
        getRecentLending(20),
        getAllExpenses(),
        getAllLending(),
      ])
      setStats({ expense: expStats, lending: lendStats })
      setRecentExpenses(recent)
      setRecentLending(recentL)
      setAllExpenses(allExp)
      setAllLending(allL)
      setSuggestions(computeSuggestions(allExp))

      // Build search index
      const idx = [
        ...allExp.map((e) => ({ ...e, sheet: 'expense', isLend: false })),
        ...allL.map((l) => ({ ...l, sheet: 'lending', isLend: true })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
      setSearchIndex(idx)
    } catch (err) {
      setError(err?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Expense save
  async function handleSaveExpense(data) {
    setLoading(true)
    setError('')
    try {
      if (data.id) {
        await updateExpense(data.id, data)
        showToast('Expense updated!')
      } else {
        await addExpense(data)
        showToast('Expense saved!')
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
        await updateLending(data.id, data)
        showToast('Record updated!')
      } else {
        await addLending(data)
        showToast('Record saved!')
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
  }

  // Not ready yet
  if (!authReady) {
    return (
      <div className="app-shell">
        <div className="loader-wrap" style={{ minHeight: '100vh' }}>
          <div className="loader-spinner"></div>
          <div className="loader-text">Loading</div>
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
          <button className={`tab-btn ${activeTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveTab('expense')}>
            Expenses
          </button>
          <button className={`tab-btn ${activeTab === 'lending' ? 'active' : ''}`} onClick={() => setActiveTab('lending')}>
            Lend/Borrow
          </button>
          <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            Reports
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <div className="error-banner">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="loader-wrap" style={{ padding: '24px 0' }}>
          <div className="loader-spinner"></div>
          <div className="loader-text">Syncing</div>
        </div>
      )}

      {/* Content */}
      <div className="content-area custom-scrollbar">
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
              onSave={handleSaveLending}
              loading={loading}
              editData={editLending}
              onCancelEdit={() => setEditLending(null)}
            />
            <TransactionList
              items={recentLending}
              title="Recent Transactions"
              onSelect={(item) => setSelectedTxn(item)}
            />
          </>
        )}

        {activeTab === 'reports' && (
          <ReportsView allExpenses={allExpenses} allLending={allLending} />
        )}

        <div className="app-footer">
          <p>© NextLifTechnologies (<a href="mailto:sheikhgulfam91@gmail.com">sheikhgulfam91@gmail.com</a>)</p>
        </div>
      </div>

      {/* Modals */}
      {selectedTxn && (
        <TransactionModal
          item={selectedTxn}
          onClose={() => setSelectedTxn(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
      {showSettings && (
        <SettingsModal
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
        <BankSearchModal onClose={() => setShowBankSearch(false)} />
      )}
      {showMigration && (
        <MigrationTool
          gasUrl={migrationUrl}
          onClose={() => setShowMigration(false)}
          onComplete={loadDashboard}
        />
      )}

      {/* Toast */}
      {toast && <div className="success-toast">{toast}</div>}
    </div>
  )
}
