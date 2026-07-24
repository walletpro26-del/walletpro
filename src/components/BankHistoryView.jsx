import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { db, auth } from '../firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { saveSnapshot, loadSnapshot } from '../api/localCache'

/**
 * BankHistoryView — Inline bank transaction list with live search.
 * Mirrors the Lend/Borrow "BY PERSON + Search" UX style, shown directly
 * inside the main content area without opening a separate modal.
 */
export default function BankHistoryView({ uid, onOpenImport }) {
  const [allRecords, setAllRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const currentUid = uid || auth?.currentUser?.uid || ''

  // Load from cache first, then Firestore
  useEffect(() => {
    async function load() {
      // Instant cache display
      const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
      if (cached && cached.length > 0) {
        const rehydrated = cached.map((r) => {
          let dObj = r.dateObj ? new Date(r.dateObj) : new Date(r.date)
          if (isNaN(dObj.getTime())) dObj = new Date()
          return { ...r, date: dObj }
        })
        setAllRecords(rehydrated)
        setLoading(false)
      }

      // Fetch from Firestore
      try {
        let snap
        if (currentUid) {
          const q = query(collection(db, 'bankTransactions'), where('userId', '==', currentUid))
          snap = await getDocs(q)
        }
        if (!snap || snap.empty) {
          const qAll = query(collection(db, 'bankTransactions'))
          snap = await getDocs(qAll)
        }

        const records = snap.docs.map((d) => {
          const data = d.data()
          let dateObj = new Date()
          if (data.date) {
            if (typeof data.date.toDate === 'function') dateObj = data.date.toDate()
            else if (typeof data.date === 'string') dateObj = new Date(data.date.replace(' ', 'T'))
            else dateObj = new Date(data.date)
            if (isNaN(dateObj.getTime())) dateObj = new Date()
          }
          return {
            id: d.id,
            bank: data.bank || '',
            date: dateObj,
            description: data.description || '',
            debit: data.debit || 0,
            credit: data.credit || 0,
            balance: data.balance || 0,
          }
        }).sort((a, b) => b.date - a.date)

        setAllRecords(records)
        saveSnapshot('bank', records, currentUid)
      } catch (err) {
        // Already shown cached above
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentUid])

  // Filter records by search
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return allRecords
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
    return allRecords.filter((r) => {
      const str = [
        r.bank, r.description,
        r.debit ? String(r.debit) : '',
        r.credit ? String(r.credit) : '',
        r.date instanceof Date ? r.date.toLocaleDateString('en-IN') : '',
      ].join(' ').toLowerCase()
      return terms.every((t) => str.includes(t))
    })
  }, [allRecords, searchTerm])

  function formatDate(d) {
    if (!d) return '—'
    const dt = d instanceof Date ? d : new Date(d)
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ paddingBottom: 12 }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          🏦 Bank History
          {allRecords.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, background: 'var(--accent-50)', color: 'var(--accent-600)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--accent-200)' }}>
              {allRecords.length} txns
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search bank..."
            style={{
              paddingLeft: 26, paddingRight: searchTerm ? 26 : 10,
              paddingTop: 5, paddingBottom: 5,
              fontSize: 11, fontWeight: 500,
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              background: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: 135,
              transition: 'all 0.2s ease',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 10 }}
            >✕</button>
          )}
        </div>
      </div>

      {/* Import button */}
      <button
        onClick={onOpenImport}
        style={{
          width: '100%', marginBottom: 10, padding: '8px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
          border: '1.5px dashed var(--accent-300)',
          borderRadius: 10, color: 'var(--accent-600)',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <i className="fas fa-file-import" style={{ fontSize: 12 }} />
        Import Bank Statement (PDF / CSV)
      </button>

      {/* Loading */}
      {loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} /> Loading bank transactions…
        </div>
      )}

      {/* Empty */}
      {!loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--slate-50)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
          <i className="fas fa-university" style={{ fontSize: 28, color: 'var(--accent-300)', marginBottom: 10, display: 'block' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No Bank Transactions Yet</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Import a PDF or CSV bank statement to get started.</div>
        </div>
      )}

      {/* No search results */}
      {!loading && allRecords.length > 0 && filtered.length === 0 && searchTerm && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
          No results for "<strong>{searchTerm}</strong>"
        </div>
      )}

      {/* Transaction list */}
      {filtered.length > 0 && (
        <ul className="txn-list">
          {filtered.map((r) => {
            const isCredit = (r.credit || 0) > 0 && !(r.debit || 0 > 0)
            const amount = isCredit ? r.credit : r.debit
            const amtCls = isCredit ? 'positive' : 'negative'
            const amtSign = isCredit ? '+' : '-'
            const amtStr = `${amtSign}₹${Number(amount || 0).toLocaleString('en-IN')}`

            return (
              <li key={r.id} className="txn-item" style={{ cursor: 'default' }}>
                <div className={`txn-icon ${isCredit ? 'positive' : 'expense'}`} style={{ background: isCredit ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)', color: isCredit ? '#10b981' : '#ef4444' }}>
                  <i className={`fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                </div>

                <div className="txn-info">
                  <div className="txn-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                      {r.description || '—'}
                    </span>
                    {r.bank && (
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 700, border: '1px solid rgba(99,102,241,0.18)', flexShrink: 0 }}>
                        {r.bank}
                      </span>
                    )}
                  </div>
                  <div className="txn-sub">
                    {formatDate(r.date)}
                    {r.balance ? ` · Bal: ₹${Number(r.balance).toLocaleString('en-IN')}` : ''}
                  </div>
                </div>

                <div className={`txn-amount ${amtCls}`} style={{ textAlign: 'right', flexShrink: 0 }}>
                  {amtStr}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
