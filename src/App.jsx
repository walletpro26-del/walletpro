import { useEffect, useMemo, useState } from 'react'
import { gasFetch } from './api/gas'
import InstallBanner from './components/InstallBanner'

const VITE_GAS_BASE_URL = import.meta.env.VITE_GAS_BASE_URL

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initialValue
      return JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore
    }
  }, [key, value])

  return [value, setValue]
}

export default function App() {
  const [route, setRoute] = useState('login') // login | dashboard | expense
  const [auth, setAuth] = useLocalStorageState('walletpro_auth', {
    loggedIn: false,
    name: '',
    role: '',
  })

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw, setLoginPw] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [expenseForm, setExpenseForm] = useState({
    date: '',
    forWhom: '',
    category: '',
    details: '',
    amount: '',
    paymentMode: 'Cash',
    remarks: '',
    fileData: null,
    fileName: '',
    mimeType: '',
  })

  const missingGasUrl = useMemo(() => !VITE_GAS_BASE_URL, [])
  useEffect(() => {
    if (missingGasUrl) {
      setError('Missing VITE_GAS_BASE_URL. Set it in Netlify build environment variables.')
      return
    }
    if (auth.loggedIn) setRoute('dashboard')
  }, [auth.loggedIn, missingGasUrl])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const out = await gasFetch('verifyUser', { email: loginEmail, password: loginPw })
      if (!out?.success) {
        setError(out?.message || 'Login failed')
        return
      }
      setAuth({ loggedIn: true, name: out.name || '', role: out.role || '' })
      setRoute('dashboard')
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  async function loadDashboard() {
    setError('')
    setLoading(true)
    try {
      const out = await gasFetch('getDashboardData')
      if (out?.error) setError(out.message || 'Please run setup first.')
      else setDashboard(out)
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (route === 'dashboard') loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  async function handleSaveExpense(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const payload = {
        formType: 'expense',
        date: expenseForm.date,
        forWhom: expenseForm.forWhom,
        category: expenseForm.category,
        details: expenseForm.details,
        amount: expenseForm.amount,
        paymentMode: expenseForm.paymentMode,
        remarks: expenseForm.remarks,
        fileData: expenseForm.fileData,
        fileName: expenseForm.fileName,
        mimeType: expenseForm.mimeType,
      }
      const out = await gasFetch('saveData', payload)
      if (out?.success) {
        setRoute('dashboard')
      } else {
        setError(out?.message || 'Save failed')
      }
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    setAuth({ loggedIn: false, name: '', role: '' })
    setRoute('login')
    setDashboard(null)
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
      <InstallBanner />

      <header style={{ padding: 16, borderBottom: '1px solid #eee', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong>Wallet Pro</strong>
          <span style={{ fontSize: 12, color: '#666' }}>{auth.loggedIn ? `Hi, ${auth.name}` : 'Sign in to continue'}</span>
        </div>
        {auth.loggedIn ? (
          <button onClick={handleLogout} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}>
            Logout
          </button>
        ) : null}
      </header>

      {error ? (
        <div style={{ margin: 16, padding: 12, borderRadius: 12, background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      ) : null}

      {loading ? <div style={{ padding: 16 }}>Loading...</div> : null}

      {route === 'login' ? (
        <main style={{ maxWidth: 520, margin: '24px auto', padding: 16 }}>
          <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Email</label>
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} type="email" required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Password</label>
              <input value={loginPw} onChange={(e) => setLoginPw(e.target.value)} type="password" required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            </div>
            <button type="submit" style={{ padding: 12, borderRadius: 12, border: 0, background: '#4f46e5', color: 'white', fontWeight: 800 }}>
              Access Wallet
            </button>
          </form>
        </main>
      ) : null}

      {route === 'dashboard' && dashboard ? (
        <main style={{ maxWidth: 980, margin: '24px auto', padding: 16 }}>
          <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setRoute('expense')} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #ddd', background: '#fff' }}>
              + Add Expense
            </button>
            <button onClick={() => loadDashboard()} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #ddd', background: '#fff' }}>
              Refresh
            </button>
          </nav>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Today Expense</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>₹{dashboard.expense.today || 0}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>This Month Expense</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>₹{dashboard.expense.month || 0}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Total Receivable</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>₹{dashboard.lending.receivable || 0}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#666', fontWeight: 700 }}>Total Payable</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>₹{dashboard.lending.payable || 0}</div>
            </div>
          </section>

          <section style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent Expenses</div>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {dashboard.recentExpenses?.slice(0, 10).map((x, idx) => (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{x.cat}</span> — {x.detail} — ₹{x.amt}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ border: '1px solid #eee', borderRadius: 16, padding: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent Lending</div>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {dashboard.recentLending?.slice(0, 10).map((x, idx) => (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{x.cat}</span> — {x.detail} — ₹{x.amt}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>
      ) : null}

      {route === 'expense' ? (
        <main style={{ maxWidth: 700, margin: '24px auto', padding: 16 }}>
          <button onClick={() => setRoute('dashboard')} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd', background: '#fff', marginBottom: 14 }}>
            ← Back
          </button>

          <form onSubmit={handleSaveExpense} style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Add Expense</h2>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Date</label>
                <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((s) => ({ ...s, date: e.target.value }))} required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Amount</label>
                <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((s) => ({ ...s, amount: e.target.value }))} required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>For Whom</label>
              <input value={expenseForm.forWhom} onChange={(e) => setExpenseForm((s) => ({ ...s, forWhom: e.target.value }))} required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            </div>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Category</label>
                <input value={expenseForm.category} onChange={(e) => setExpenseForm((s) => ({ ...s, category: e.target.value }))} required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Payment Mode</label>
                <select value={expenseForm.paymentMode} onChange={(e) => setExpenseForm((s) => ({ ...s, paymentMode: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }}>
                  <option value="Cash">Cash</option>
                  <option value="Online/UPI">Online/UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Details</label>
              <input value={expenseForm.details} onChange={(e) => setExpenseForm((s) => ({ ...s, details: e.target.value }))} required style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Remarks</label>
              <input value={expenseForm.remarks} onChange={(e) => setExpenseForm((s) => ({ ...s, remarks: e.target.value }))} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #ddd' }} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Optional Attachment (PDF/Image)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) {
                    setExpenseForm((s) => ({ ...s, fileData: null, fileName: '', mimeType: '' }))
                    return
                  }
                  const buf = await f.arrayBuffer()
                  const bytes = new Uint8Array(buf)
                  let binary = ''
                  bytes.forEach((b) => (binary += String.fromCharCode(b)))
                  const base64 = btoa(binary)
                  setExpenseForm((s) => ({
                    ...s,
                    fileData: base64,
                    fileName: f.name,
                    mimeType: f.type || 'application/octet-stream',
                  }))
                }}
                style={{ width: '100%' }}
              />
            </div>

            <button type="submit" style={{ padding: 12, borderRadius: 12, border: 0, background: '#4f46e5', color: 'white', fontWeight: 800 }}>
              Save Expense
            </button>
          </form>
        </main>
      ) : null}
    </div>
  )
}
