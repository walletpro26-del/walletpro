import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import WalletVibeLogo from './WalletVibeLogo'
import { isAdminEmail } from '../api/subscription'
import { importTaskQueue } from '../api/importTaskQueue'

export default function Header({
  auth, stats, activeTab, searchIndex, subscription,
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
  let s1 = { label: 'Today', value: `₹${(stats?.expense?.today || 0).toLocaleString('en-IN')}` }
  let s2 = { label: 'Month', value: `₹${(stats?.expense?.month || 0).toLocaleString('en-IN')}` }
  let s3 = { label: 'Total', value: `₹${(stats?.expense?.total || 0).toLocaleString('en-IN')}` }

  if (activeTab === 'lending') {
    s1 = { label: 'Receivable', value: `₹${(stats?.lending?.receivable || 0).toLocaleString('en-IN')}` }
    s2 = { label: 'Payable', value: `₹${(stats?.lending?.payable || 0).toLocaleString('en-IN')}` }
    s3 = { label: 'Net', value: `₹${(stats?.lending?.net || 0).toLocaleString('en-IN')}` }
  }

  function handleSearch(term) {
    setSearchTerm(term)
    if (!term.trim() || !searchIndex?.length) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    const lc = term.toLowerCase().trim()
    const terms = lc.split(/\s+/)
    
    const scoredResults = searchIndex.map(t => {
      const str = `${t.category || ''} ${t.details || ''} ${t.person || ''} ${t.forWhom || ''} ${t.remarks || ''} ${t.amount || ''}`.toLowerCase()
      
      let match = true
      let score = 0
      
      for (const keyword of terms) {
        if (!str.includes(keyword)) {
          match = false
          break
        }
        
        // Exact match of a word
        if (str.includes(` ${keyword} `) || str.startsWith(`${keyword} `) || str.endsWith(` ${keyword}`) || str === keyword) {
          score += 2
        } else {
          score += 1
        }
      }
      
      if (!match) return null
      
      // Bonus points for full exact string match
      if (str.includes(lc)) {
        score += 5
      }
      
      // Bonus points if it's matching the amount exactly
      if (terms.includes(String(t.amount))) {
        score += 3
      }
      
      return { item: t, score }
    }).filter(Boolean)
    
    scoredResults.sort((a, b) => b.score - a.score)
    const results = scoredResults.slice(0, 15).map(r => r.item)
    
    setSearchResults(results)
    setShowDropdown(results.length > 0)
  }

  function handleResultClick(item) {
    setShowDropdown(false)
    setSearchTerm('')
    onSearchSelect?.(item)
  }

  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuRef = useRef(null)
  const portalMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        portalMenuRef.current && !portalMenuRef.current.contains(e.target)
      ) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
            <WalletVibeLogo size={28} variant="light" animate={false} />
            <span className="brand-name">Wallet<span>Vibe</span></span>
          </h1>
          <div className="header-date">{dateStr}</div>
        </div>

        {/* ── Compact Header Actions Bar (Subscription Badge + Quick Menu Dropdown) ── */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 50 }}>
          {/* Subscription Status Pill */}
          <button
            type="button"
            onClick={onManageSubscription}
            title={subscription?.isAdmin ? 'Admin Account (Free Lifetime)' : (subscription?.active ? 'Pro Active' : 'Subscribe Now')}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxSizing: 'border-box',
              background: subscription?.isAdmin
                ? 'rgba(16, 185, 129, 0.25)'
                : (subscription?.active ? 'rgba(99, 102, 241, 0.25)' : 'rgba(239, 68, 68, 0.25)'),
              color: subscription?.isAdmin
                ? '#6ee7b7'
                : (subscription?.active ? '#a5b4fc' : '#fca5a5'),
              border: `1px solid ${subscription?.isAdmin
                ? 'rgba(16, 185, 129, 0.4)'
                : (subscription?.active ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.5)')}`,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{subscription?.isAdmin ? '👑' : (subscription?.active ? '⭐' : '⚡')}</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {subscription?.isAdmin ? 'Admin' : (subscription?.active ? 'Pro' : 'Upgrade')}
            </span>
          </button>

          {/* Quick Tools Dropdown Menu Button */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              className="header-btn"
              onClick={(e) => {
                if (!showMenu) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
                }
                setShowMenu((prev) => !prev)
              }}
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
              <i className={showMenu ? 'fas fa-times' : 'fas fa-ellipsis-v'} />
            </button>

            {/* Fixed-position Dropdown Menu (rendered into document.body via Portal to escape all stacking contexts) */}
            {showMenu && createPortal(
              <>
                {/* Invisible overlay to close menu on outside click */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 999998 }}
                  onClick={() => setShowMenu(false)}
                />
                <div
                  ref={portalMenuRef}
                  style={{
                    position: 'fixed',
                    top: menuPos.top,
                    right: menuPos.right,
                    width: 220,
                    background: '#0f172a',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 12,
                    padding: '6px',
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)',
                    zIndex: 999999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {/* User email info */}
                  {auth?.email && (
                    <div style={{ padding: '8px 10px', fontSize: 10, color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: 2 }}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Signed in as</div>
                      <div style={{ color: '#f8fafc', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {auth.email}
                      </div>
                    </div>
                  )}

                  {/* Admin Control Panel item */}
                  {isAdminEmail(auth?.email) && (
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); onAdminPanel?.() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                        background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)',
                        color: '#c4b5fd', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <i className="fas fa-crown" style={{ color: '#fbbf24', fontSize: 12 }} />
                      Admin Control Panel
                    </button>
                  )}

                  {/* Import Data item */}
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onOpenCsvImport?.('expense') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                      background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', borderRadius: 8,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                    }}
                  >
                    <i className="fas fa-file-import" style={{ color: '#818cf8', width: 14 }} />
                    Import Data (CSV / PDF)
                  </button>

                  {/* App Settings item */}
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onSettings?.() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                      background: 'transparent', border: 'none', color: '#e2e8f0', borderRadius: 8,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <i className="fas fa-cog" style={{ color: '#fbbf24', width: 14 }} />
                    App Settings
                  </button>

                  {/* Rate & Review App item */}
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onOpenRatingModal?.() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                      background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#fbbf24', borderRadius: 8,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'left', marginTop: 2,
                    }}
                  >
                    <i className="fas fa-star" style={{ color: '#f59e0b', width: 14 }} />
                    Rate &amp; Review App
                  </button>

                  {/* Refresh Data item */}
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onRefresh?.() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                      background: 'transparent', border: 'none', color: '#e2e8f0', borderRadius: 8,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <i className="fas fa-sync-alt" style={{ color: '#34d399', width: 14 }} />
                    Refresh Data
                  </button>

                  {/* Logout item */}
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onLogout?.() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5',
                      borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'left', marginTop: 4,
                    }}
                  >
                    <i className="fas fa-power-off" style={{ color: '#ef4444', width: 14 }} />
                    Log Out
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>

      <div className="header-search" ref={searchRef}>
        <i className="fas fa-search"></i>
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />
        {showDropdown && (
          <div className="search-dropdown custom-scrollbar">
            {searchResults.map((item, i) => (
              <div key={i} className="search-dropdown-item" onMouseDown={() => handleResultClick(item)}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {item.category || item.label || item.type || ''}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {item.details || item.person || item.forWhom || item.remarks || ''}
                  </div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13 }}>₹{item.amount}</span>
              </div>
            ))}
          </div>
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
