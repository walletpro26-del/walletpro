import { useState, useRef, useEffect, useMemo } from 'react'
import FloatingPanel from './FloatingPanel.jsx'
import WalletVibeLogo from './WalletVibeLogo'
import { isAdminEmail } from '../api/subscription'
import { importTaskQueue } from '../api/importTaskQueue'

export default function Header({
  auth, stats, activeTab, searchIndex, subscription, allowNonCsvImport = true,
  onLogout, onRefresh, onSettings, onBankSearch,
  onSearchSelect, onManageSubscription, onAdminPanel, onOpenCsvImport, onOpenRatingModal,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [bgTask, setBgTask] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => {
    const unsubscribe = importTaskQueue.subscribe((task) => {
      setBgTask(task ? { ...task } : null)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  // Determine stat labels & values based on active tab
  const expToday = parseFloat(stats?.expense?.today) || 0
  const expMonth = parseFloat(stats?.expense?.month) || 0
  const expTotal = parseFloat(stats?.expense?.total) || 0

  let s1 = { label: 'Today', value: `₹${expToday.toLocaleString('en-IN')}` }
  let s2 = { label: 'Month', value: `₹${expMonth.toLocaleString('en-IN')}` }
  let s3 = { label: 'Total', value: `₹${expTotal.toLocaleString('en-IN')}` }

  if (activeTab === 'lending') {
    const lendRec = parseFloat(stats?.lending?.receivable) || 0
    const lendPay = parseFloat(stats?.lending?.payable) || 0
    const lendNet = parseFloat(stats?.lending?.net) || 0

    s1 = { label: 'Receivable', value: `₹${lendRec.toLocaleString('en-IN')}` }
    s2 = { label: 'Payable', value: `₹${lendPay.toLocaleString('en-IN')}` }
    s3 = { label: 'Net', value: `₹${lendNet.toLocaleString('en-IN')}` }
  }

  // Pre-index items once when searchIndex changes (eliminates thousands of Date & string operations per keystroke)
  const preparedSearchIndex = useMemo(() => {
    if (!searchIndex || !searchIndex.length) return []
    return searchIndex.map((t) => {
      const d = t.dateObj || (t.date ? new Date(t.date) : null)
      const time = d && !isNaN(d.getTime()) ? d.getTime() : 0
      const dStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      const str = `${t.category || ''} ${t.details || ''} ${t.person || ''} ${t.forWhom || ''} ${t.remarks || ''} ${t.description || ''} ${t.bank || ''} ${t.amount || ''} ${dStr}`.toLowerCase()
      const primaryFields = [t.category, t.person, t.forWhom, t.bank].filter(Boolean).map((f) => String(f).toLowerCase())
      const amtStr = String(t.amount || '')
      return { item: t, str, primaryFields, amtStr, time }
    })
  }, [searchIndex])

  function handleSearch(term) {
    setSearchTerm(term)
    if (!term.trim() || !preparedSearchIndex.length) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    const lc = term.toLowerCase().trim()
    const terms = lc.split(/\s+/).filter(Boolean)
    const scoredResults = []

    for (let i = 0; i < preparedSearchIndex.length; i++) {
      const entry = preparedSearchIndex[i]
      const { str, amtStr, primaryFields, time, item } = entry

      let match = true
      let score = 0

      for (let j = 0; j < terms.length; j++) {
        const kw = terms[j]
        if (!str.includes(kw)) {
          match = false
          break
        }
        if (str.includes(` ${kw} `) || str.startsWith(`${kw} `) || str.endsWith(` ${kw}`) || str === kw) {
          score += 2
        } else {
          score += 1
        }
      }

      if (!match) continue

      if (str.includes(lc)) score += 5
      if (terms.includes(amtStr)) score += 3

      for (let p = 0; p < primaryFields.length; p++) {
        const pf = primaryFields[p]
        if (pf === lc) score += 10
        else if (pf.includes(lc)) score += 4
      }

      scoredResults.push({ item, score, time })
    }

    scoredResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.time - a.time
    })

    const results = scoredResults.slice(0, 50).map((r) => r.item)

    setSearchResults(results)
    setShowDropdown(results.length > 0)
  }

  function formatSearchItemDate(item) {
    const d = item.dateObj || (item.date ? new Date(item.date) : null)
    if (!d || isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function handleResultClick(item) {
    setShowDropdown(false)
    setSearchTerm('')
    onSearchSelect?.(item)
  }

  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  return (
    <>
      {bgTask && !bgTask.isComplete && (
        <div style={{ background: 'linear-gradient(90deg, #4f46e5, #059669)', color: '#fff', padding: '8px 16px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-brain fa-spin" style={{ fontSize: 13 }} />
            <span>⚡ Background AI PDF Processing ({bgTask.filename}): {bgTask.status}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 99, fontSize: 10 }}>
              {bgTask.percent}%
            </span>
            <button
              onClick={() => {
                if (bgTask.mode === 'bank') {
                  onBankSearch?.()
                } else {
                  onOpenCsvImport?.(bgTask.mode)
                }
              }}
              style={{ background: '#fff', color: '#4f46e5', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 800 }}
            >
              Open Progress Modal
            </button>
          </div>
        </div>
      )}

      <header className="app-header">
      <div className="header-bg"></div>
      <div className="header-top">
        <div className="header-brand">
          <h1 className="brand-glow">
            <WalletVibeLogo size={24} variant="light" animate={false} />
            <span className="brand-name">Wallet<span>Vibe</span></span>
          </h1>
          <div className="header-date">{dateStr}</div>
        </div>

        {/* ── Compact Header Actions Bar (Subscription Badge + Quick Menu Dropdown) ── */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 50 }}>
          <button
            type="button"
            className="header-access-button"
            onClick={(subscription?.isAdmin || isAdminEmail(auth?.email)) ? onAdminPanel : onManageSubscription}
            aria-label={(subscription?.isAdmin || isAdminEmail(auth?.email)) ? 'Open administration' : 'Manage subscription'}
          >
            {(subscription?.isAdmin || isAdminEmail(auth?.email)) ? 'Admin' : subscription?.active ? 'Pro' : 'Upgrade'}
          </button>

          {/* Quick Tools Dropdown Menu Button */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              className="header-btn"
              type="button"
              aria-label="Menu and tools"
              aria-haspopup="menu"
              aria-expanded={showMenu}
              onClick={() => setShowMenu(previous => !previous)}
              title="Menu & Tools"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: showMenu ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span aria-hidden="true" style={{fontSize:20,lineHeight:1}}>{showMenu ? '×' : '⋮'}</span>
            </button>

            <FloatingPanel open={showMenu} anchorRef={menuRef} onDismiss={() => setShowMenu(false)} align="end" minWidth={232} maxHeight={400} className="tools-menu" role="menu" aria-label="Tools" onKeyDown={event => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]
              const current = items.indexOf(document.activeElement)
              const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
              items[index]?.focus()
            }}>
              {auth?.email && <div className="tools-menu-account"><span>Account</span><strong>{auth.email}</strong></div>}
              {[
                ...((subscription?.isAdmin || isAdminEmail(auth?.email)) ? [['Administration', onAdminPanel]] : []),
                [`Import ${allowNonCsvImport ? 'CSV / PDF' : 'CSV'}`, () => onOpenCsvImport?.('expense')],
                ['Settings', onSettings], ['Ratings & reviews', onOpenRatingModal], ['Refresh data', onRefresh], ['Log out', onLogout],
              ].map(([label, action]) => <button key={label} type="button" role="menuitem" className={label === 'Log out' ? 'tools-menu-logout' : ''} onClick={() => { setShowMenu(false); action?.() }}>{label}</button>)}
            </FloatingPanel>
          </div>
        </div>
      </div>

      <div className="header-search" ref={searchRef}>
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="Search transactions..."
          aria-label="Search transactions"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
        />
        {showDropdown && (
          <FloatingPanel open={showDropdown} anchorRef={searchRef} onDismiss={() => setShowDropdown(false)} className="search-results-panel custom-scrollbar" maxHeight={320}>
            {searchResults.map((item, i) => {
              const amtVal = item.amount || item.debit || item.credit || 0
              const isCreditBank = item.sheet === 'bank' && (item.credit || 0) > 0 && !(item.debit || 0 > 0)
              const formattedDateStr = formatSearchItemDate(item)

              return (
                <button type="button"
                  key={i}
                  className="search-dropdown-item"
                  onClick={() => handleResultClick(item)}
                  style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                      {/* Module Badge */}
                      <span style={{
                        fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0,
                        background: item.sheet === 'bank' ? 'rgba(139,92,246,0.12)' : item.sheet === 'lending' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                        color: item.sheet === 'bank' ? '#8b5cf6' : item.sheet === 'lending' ? '#10b981' : '#6366f1',
                        border: `1px solid ${item.sheet === 'bank' ? 'rgba(139,92,246,0.2)' : item.sheet === 'lending' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
                      }}>
                        {item.sheet === 'bank' ? (item.bank || 'Bank') : item.sheet === 'lending' ? (item.type || 'Lend') : 'Expense'}
                      </span>

                      {/* Category or Title */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.category || item.person || item.bank || item.label || item.type || 'Transaction'}
                      </span>

                      {/* Date Badge */}
                      {formattedDateStr && (
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                          📅 {formattedDateStr}
                        </span>
                      )}
                    </div>

                    {/* Subline Details */}
                    {(() => {
                      const whomFormatted = item.forWhom ? (item.forWhom.includes('|||') ? item.forWhom.split('|||').join(', ') : item.forWhom) : ''
                      return (
                        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.details || item.description || item.remarks || whomFormatted || ''}
                          {whomFormatted && item.details ? ` (${whomFormatted})` : ''}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Amount */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 12.5, color: isCreditBank || (item.sheet === 'lending' && item.type === 'They Return') ? '#10b981' : 'var(--text-primary)' }}>
                      ₹{Number(amtVal).toLocaleString('en-IN')}
                    </span>
                  </div>
                </button>
              )
            })}
          </FloatingPanel>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{s1.label}</div>
          <div className="stat-value" style={{ fontSize: s1.value.length > 13 ? '10px' : s1.value.length > 10 ? '11px' : '12px' }}>{s1.value}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{s2.label}</div>
          <div className="stat-value" style={{ fontSize: s2.value.length > 13 ? '10px' : s2.value.length > 10 ? '11px' : '12px' }}>{s2.value}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{s3.label}</div>
          <div className="stat-value" style={{ fontSize: s3.value.length > 13 ? '10px' : s3.value.length > 10 ? '11px' : '12px' }}>{s3.value}</div>
        </div>
      </div>
    </header>
    </>
  )
}
