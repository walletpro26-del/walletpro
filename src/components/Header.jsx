import { useState, useRef, useEffect } from 'react'
import WalletVibeLogo from './WalletVibeLogo'

export default function Header({
  auth, stats, activeTab, searchIndex, subscription,
  onLogout, onRefresh, onSettings, onBankSearch,
  onSearchSelect, onManageSubscription,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const searchRef = useRef(null)

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

  return (
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
        <div className="header-actions">
          <button
            className="header-btn"
            onClick={onManageSubscription}
            title={subscription?.isAdmin ? 'Admin Account (Free Lifetime)' : (subscription?.active ? 'Pro Active' : 'Subscribe Now')}
            style={{
              background: subscription?.isAdmin
                ? 'rgba(16, 185, 129, 0.2)'
                : (subscription?.active ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.25)'),
              color: subscription?.isAdmin
                ? '#6ee7b7'
                : (subscription?.active ? '#a5b4fc' : '#fca5a5'),
              borderColor: subscription?.isAdmin
                ? 'rgba(16, 185, 129, 0.4)'
                : (subscription?.active ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.5)'),
            }}
          >
            {subscription?.isAdmin ? '👑' : (subscription?.active ? '⭐' : '⚡')}
          </button>
          <button className="header-btn" onClick={onBankSearch} title="Bank Search">
            <i className="fas fa-university"></i>
          </button>
          <button className="header-btn text-amber" onClick={onSettings} title="Settings">
            <i className="fas fa-cog"></i>
          </button>
          <button className="header-btn" onClick={onLogout} title="Logout">
            <i className="fas fa-power-off"></i>
          </button>
          <button className="header-btn text-emerald" onClick={onRefresh} title="Refresh">
            <i className="fas fa-sync-alt"></i>
          </button>
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
  )
}
