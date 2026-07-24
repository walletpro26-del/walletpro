import { useState, useEffect, useMemo } from 'react'
import { auth } from '../firebase'
import { loadSnapshot } from '../api/localCache'
import { fetchBankTransactionsFromFirestore, deleteBankTransaction, parseSafeDate } from '../api/bankTransactions'
import { downloadBankCsvTemplate } from '../utils/csvTemplate'

/**
 * BankHistoryView — Inline bank transaction list with live search,
 * bank filter chips, deletion capabilities, and instant mobile-first performance.
 */
export default function BankHistoryView({ uid, isAdmin = false, allowNonCsvImport = true, onOpenImport, onOpenMerge }) {
  const currentUid = uid || auth?.currentUser?.uid || ''

  // Instant cache state initialization (zero loading flash on tab switch)
  const [allRecords, setAllRecords] = useState(() => {
    const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
    if (cached && cached.length > 0) {
      return cached.map((r) => ({
        ...r,
        date: parseSafeDate(r.dateObj || r.date),
      }))
    }
    return []
  })
  const [loading, setLoading] = useState(() => allRecords.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBankFilter, setSelectedBankFilter] = useState('ALL')
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [showLlmGuideModal, setShowLlmGuideModal] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Load records from local cache first, then Firestore
  async function loadData(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true)
    else if (allRecords.length === 0) setLoading(true)

    setError('')
    try {
      const records = await fetchBankTransactionsFromFirestore(currentUid, isAdmin)
      if (records && records.length > 0) {
        setAllRecords(records)
      } else {
        const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
        if (cached && cached.length > 0) {
          setAllRecords(cached.map((r) => ({ ...r, date: parseSafeDate(r.dateObj || r.date) })))
        }
      }
    } catch (err) {
      console.warn('[BankHistoryView] Load error:', err?.message)
      if (allRecords.length === 0) {
        setError('Could not sync bank transactions. Showing cached data if available.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [currentUid, isAdmin])

  // Extract unique bank names for filter pill bar
  const uniqueBanks = useMemo(() => {
    const set = new Set()
    allRecords.forEach((r) => {
      if (r.bank) set.add(r.bank)
    })
    return Array.from(set).sort()
  }, [allRecords])

  const [visibleCount, setVisibleCount] = useState(30)

  // Filter records by search term & bank name
  const filtered = useMemo(() => {
    return allRecords.filter((r) => {
      // Bank filter
      if (selectedBankFilter !== 'ALL' && r.bank !== selectedBankFilter) {
        return false
      }

      // Search term
      if (searchTerm.trim()) {
        const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
        const str = [
          r.bank,
          r.description,
          r.debit ? String(r.debit) : '',
          r.credit ? String(r.credit) : '',
          r.date instanceof Date ? r.date.toLocaleDateString('en-IN') : '',
        ].join(' ').toLowerCase()

        return terms.every((t) => str.includes(t))
      }

      return true
    })
  }, [allRecords, searchTerm, selectedBankFilter])

  // Reset pagination on filter change
  useEffect(() => {
    setVisibleCount(30)
  }, [searchTerm, selectedBankFilter])

  const visibleRecords = useMemo(() => {
    return filtered.slice(0, visibleCount)
  }, [filtered, visibleCount])

  // Summary metrics for current filtered view
  const metrics = useMemo(() => {
    let totalDebit = 0
    let totalCredit = 0
    filtered.forEach((r) => {
      totalDebit += parseFloat(r.debit || 0)
      totalCredit += parseFloat(r.credit || 0)
    })
    return {
      totalDebit,
      totalCredit,
      net: totalCredit - totalDebit,
    }
  }, [filtered])

  async function handleDelete(r) {
    if (!r || !r.id) return
    if (!window.confirm(`Delete bank entry "${r.description || 'Transaction'}"?`)) return

    setDeletingId(r.id)
    try {
      await deleteBankTransaction(r.id)
      const updated = allRecords.filter((item) => item.id !== r.id)
      setAllRecords(updated)
    } catch (err) {
      alert('Failed to delete transaction: ' + (err?.message || 'Unknown error'))
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(d) {
    const dt = parseSafeDate(d)
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header & Controls Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🏦 Bank History</span>
            {allRecords.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-50)', color: 'var(--accent-600)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--accent-200)' }}>
                {allRecords.length}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Sync / Refresh Button */}
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              title="Refresh Bank Transactions"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                borderRadius: 20,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} style={{ fontSize: 10 }} />
              <span className="hidden-xs">{refreshing ? 'Syncing...' : 'Sync'}</span>
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by amount, bank, remarks..."
              style={{
                width: '100%',
                paddingLeft: 28,
                paddingRight: searchTerm ? 28 : 10,
                paddingTop: 7,
                paddingBottom: 7,
                fontSize: 12,
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                borderRadius: 20,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 11 }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Unique Banks Filter Bar */}
        {uniqueBanks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSelectedBankFilter('ALL')}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 10.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                border: selectedBankFilter === 'ALL' ? '1px solid var(--accent-500)' : '1px solid var(--border-color)',
                background: selectedBankFilter === 'ALL' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-subtle)',
                color: selectedBankFilter === 'ALL' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              All Banks ({allRecords.length})
            </button>

            {uniqueBanks.map((bName) => {
              const count = allRecords.filter((r) => r.bank === bName).length
              const isActive = selectedBankFilter === bName
              return (
                <button
                  key={bName}
                  onClick={() => setSelectedBankFilter(bName)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 10.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    border: isActive ? '1px solid var(--accent-500)' : '1px solid var(--border-color)',
                    background: isActive ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-subtle)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  🏦 {bName} ({count})
                </button>
              )
            })}

            {onOpenMerge && (
              <button
                type="button"
                onClick={() => onOpenMerge('bank')}
                title="Merge duplicate bank names"
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 10.5,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(2, 132, 199, 0.4)',
                  background: 'rgba(2, 132, 199, 0.1)',
                  color: '#0284c7',
                  cursor: 'pointer',
                }}
              >
                🔀 Merge Bank Names
              </button>
            )}
          </div>
        )}

        {/* Summary Card Banner */}
        {filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            fontSize: 11,
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Spent (Debits)</div>
              <div style={{ color: '#ef4444', fontWeight: 800 }}>-₹{metrics.totalDebit.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Credits</div>
              <div style={{ color: '#10b981', fontWeight: 800 }}>+₹{metrics.totalCredit.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Net Cash Flow</div>
              <div style={{ color: metrics.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                {metrics.net >= 0 ? '+' : ''}₹{metrics.net.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import Action & Template Bar */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onOpenImport}
          style={{
            flex: 1,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
            border: '1.5px dashed var(--accent-300)',
            borderRadius: 12, color: 'var(--accent-600)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          <i className="fas fa-file-import" style={{ fontSize: 13 }} />
          {allowNonCsvImport ? 'Import Statement (PDF/CSV)' : 'Import Statement (CSV Only)'}
        </button>

        <button
          type="button"
          onClick={downloadBankCsvTemplate}
          style={{
            height: 38,
            padding: '0 11px',
            borderRadius: 10,
            border: '1px solid rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#059669',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease',
          }}
          title="Download Standard CSV Template"
        >
          <i className="fas fa-download" style={{ fontSize: 10, color: '#059669' }} />
          Template CSV
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ margin: '8px 0', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: 6, fontSize: 16, color: '#6366f1' }} />
          Loading bank transactions...
        </div>
      )}

      {/* Empty State */}
      {!loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border-color)', margin: '10px 0' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <i className="fas fa-university" style={{ fontSize: 22, color: '#6366f1' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>No Bank Statements Imported Yet</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280, margin: '6px auto 14px' }}>
            Import your PDF or CSV bank statement to search across bank history and auto-verify payment proofs.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={onOpenImport}
              style={{
                padding: '9px 20px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-file-import" style={{ fontSize: 13 }} />
              {allowNonCsvImport ? 'Import PDF / CSV Statement' : 'Import CSV Statement'}
            </button>
          </div>
        </div>
      )}

      {/* No search results */}
      {!loading && allRecords.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
          No bank transactions match filter criteria.
          {searchTerm && <div>Searching for "<strong>{searchTerm}</strong>"</div>}
          <button
            onClick={() => { setSearchTerm(''); setSelectedBankFilter('ALL') }}
            style={{ marginTop: 8, background: 'none', border: 'none', color: '#6366f1', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Transaction List */}
      {filtered.length > 0 && (
        <>
          <ul className="txn-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {visibleRecords.map((r) => {
              const isCredit = (r.credit || 0) > 0 && !(r.debit || 0 > 0)
              const amount = isCredit ? r.credit : r.debit
              const amtCls = isCredit ? 'positive' : 'negative'
              const amtSign = isCredit ? '+' : '-'
              const amtStr = `${amtSign}₹${Number(amount || 0).toLocaleString('en-IN')}`

              return (
                <li key={r.id} className="txn-item" style={{ position: 'relative', cursor: 'default', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  {/* Icon */}
                  <div
                    className={`txn-icon ${isCredit ? 'positive' : 'expense'}`}
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isCredit ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
                      color: isCredit ? '#10b981' : '#ef4444',
                      fontSize: 12,
                    }}
                  >
                    <i className={`fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                  </div>

                  {/* Main Info */}
                  <div className="txn-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="txn-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                        {r.description || '—'}
                      </span>
                      {r.bank && (
                        <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 700, border: '1px solid rgba(99,102,241,0.18)', flexShrink: 0 }}>
                          {r.bank}
                        </span>
                      )}
                    </div>
                    <div className="txn-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDate(r.date)}
                      {r.balance ? ` · Bal: ₹${Number(r.balance).toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>

                  {/* Amount & Delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div className={`txn-amount ${amtCls}`} style={{ textAlign: 'right', fontWeight: 800, fontSize: 12.5 }}>
                      {amtStr}
                    </div>

                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      title="Delete Bank Entry"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        padding: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        borderRadius: 4,
                        opacity: 0.6,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      {deletingId === r.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash-alt" />}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Load More Button */}
          {visibleCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--accent-600)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              ▼ Load More Transactions (Showing {visibleCount} of {filtered.length})
            </button>
          )}
        </>
      )}
    </div>
  )
}
