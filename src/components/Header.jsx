import { useState, useRef, useEffect } from 'react'

export default function Header({
  auth, stats, activeTab, searchIndex,
  onLogout, onRefresh, onSettings, onBankSearch,
  onSearchSelect,
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
    const lc = term.toLowerCase()
    const results = searchIndex.filter((t) => {
      const str = `${t.category || ''} ${t.details || ''} ${t.person || ''} ${t.forWhom || ''} ${t.remarks || ''} ${t.amount}`.toLowerCase()
      return str.includes(lc)
    }).slice(0, 15)
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
            <i className="fas fa-wallet"></i> Wallet<span>Vibe</span>
            <span className={`net-indicator ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Online — Synced' : 'Offline — Auto-syncing in background'}>
              <i className={isOnline ? "fas fa-circle" : "fas fa-exclamation-circle"}></i>
            </span>
          </h1>
          <div className="header-date">{dateStr}</div>
        </div>
        <div className="header-actions">
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
          placeholder="Search..."
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
          <div className="stat-value">{s1.value}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{s2.label}</div>
          <div className="stat-value">{s2.value}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{s3.label}</div>
          <div className="stat-value">{s3.value}</div>
        </div>
      </div>
    </header>
  )
}
