import { useState, useMemo } from 'react'
import { db } from '../firebase'
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

export default function BankSearchModal({ uid, onClose }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [allRecords, setAllRecords] = useState(null)
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadRecords() {
    if (allRecords) return allRecords
    setLoading(true)
    setError('')
    try {
      // 1. Fetch user-scoped bank transactions
      const qScoped = query(collection(db, 'bankTransactions'), where('userId', '==', uid || ''))
      const snapScoped = await getDocs(qScoped)
      let records = snapScoped.docs.map((d) => {
        const data = d.data()
        const dateObj = data.date?.toDate?.() || new Date(data.date)
        return {
          id: d.id,
          bank: data.bank || '',
          date: dateObj,
          description: data.description || '',
          debit: data.debit || 0,
          credit: data.credit || 0,
          balance: data.balance || 0,
          searchStr: `${dateObj.toLocaleDateString('en-IN')} ${data.description || ''} ${data.bank || ''} ${data.debit || ''} ${data.credit || ''} ${data.balance || ''}`.toLowerCase(),
        }
      })

      // 2. Fetch all bank transactions to find legacy records to migrate
      const qAll = query(collection(db, 'bankTransactions'))
      const snapAll = await getDocs(qAll)
      const legacyDocs = snapAll.docs.filter((d) => !d.data().userId)
      if (legacyDocs.length > 0) {
        legacyDocs.forEach((d) => {
          const ref = doc(db, 'bankTransactions', d.id)
          updateDoc(ref, { userId: uid || '' }).catch((err) => console.error('Migration error:', err))
          const data = d.data()
          const dateObj = data.date?.toDate?.() || new Date(data.date)
          records.push({
            id: d.id,
            bank: data.bank || '',
            date: dateObj,
            description: data.description || '',
            debit: data.debit || 0,
            credit: data.credit || 0,
            balance: data.balance || 0,
            searchStr: `${dateObj.toLocaleDateString('en-IN')} ${data.description || ''} ${data.bank || ''} ${data.debit || ''} ${data.credit || ''} ${data.balance || ''}`.toLowerCase(),
          })
        })
      }

      records.sort((a, b) => b.date - a.date)
      setAllRecords(records)
      setLoading(false)
      return records
    } catch (err) {
      setError('Failed to load bank records: ' + (err?.message || ''))
      setLoading(false)
      return []
    }
  }

  async function handleSearch() {
    const records = await loadRecords()
    if (!searchTerm.trim()) {
      setFiltered(records.slice(0, 50))
      return
    }
    const terms = searchTerm.toLowerCase().split(/\s+/)
    const results = records.filter((r) => terms.every((t) => r.searchStr.includes(t)))
    setFiltered(results.slice(0, 100))
  }

  function formatDate(d) {
    try { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) }
    catch { return '' }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-container" style={{ maxWidth: 520, maxHeight: '85vh' }}>
        {/* Header */}
        <div className="bank-search-header">
          <h3 style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <i className="fas fa-university" style={{ fontSize: 12 }}></i>
            </div>
            Bank Search
          </h3>
          <button className="modal-close" style={{ background: 'rgba(255,255,255,0.1)', color: '#a5b4fc' }} onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Search */}
        <div className="bank-search-input-area">
          <div style={{ position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}></i>
            <input
              type="text"
              placeholder="Search amount, date, desc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                width: '100%', padding: '12px 90px 12px 38px', border: '2px solid var(--border-color)',
                borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
                color: 'var(--text-primary)', background: 'var(--bg-input)', outline: 'none',
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent-600)', color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Search
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bank-search-results custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
          {error && <div className="error-banner" style={{ margin: 12 }}>{error}</div>}
          {loading && (
            <div className="loader-wrap">
              <div className="loader-spinner"></div>
              <div className="loader-text">Loading</div>
            </div>
          )}
          {!loading && filtered.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--accent-100)' }}>
                <i className="fas fa-search-dollar" style={{ fontSize: 28 }}></i>
              </div>
              <p style={{ fontSize: 12, fontWeight: 500 }}>Enter keywords to search bank history</p>
            </div>
          )}
          {filtered.map((r, i) => (
            <div key={i} className="bank-txn-item">
              <div>
                <div className="bank-txn-date">{formatDate(r.date)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-500)', textTransform: 'uppercase' }}>{r.bank}</div>
              </div>
              <div className="bank-txn-desc">{r.description}</div>
              <div>
                {r.debit > 0 && <div className="bank-txn-amount debit">-₹{r.debit.toLocaleString('en-IN')}</div>}
                {r.credit > 0 && <div className="bank-txn-amount credit">+₹{r.credit.toLocaleString('en-IN')}</div>}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>Bal: ₹{r.balance.toLocaleString('en-IN')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
