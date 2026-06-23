import { useState, useEffect } from 'react'

export default function SettingsModal({ onClose, onSave, onMigrate }) {
  const [theme, setTheme] = useState(localStorage.getItem('wp_theme') || 'light')
  const [currency, setCurrency] = useState(localStorage.getItem('wp_currency') || '₹')
  const [startScreen, setStartScreen] = useState(localStorage.getItem('wp_startScreen') || 'expense')
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('wp_gas_url') || import.meta.env.VITE_GAS_URL || '')
  
  // Confirmations
  const [confirmStep, setConfirmStep] = useState(0) // 0: none, 1: warn 1, 2: warn 2, 3: type text
  const [confirmInput, setConfirmInput] = useState('')

  function handleSave() {
    localStorage.setItem('wp_theme', theme)
    localStorage.setItem('wp_currency', currency)
    localStorage.setItem('wp_startScreen', startScreen)
    localStorage.setItem('wp_gas_url', gasUrl)
    document.documentElement.setAttribute('data-theme', theme)
    onSave?.({ theme, currency, startScreen, gasUrl })
    onClose()
  }

  function handleClearCache() {
    localStorage.clear()
    location.reload()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-header-icon" style={{ background: 'var(--accent-50)', color: 'var(--accent-500)' }}>
              <i className="fas fa-sliders-h"></i>
            </div>
            <h3>App Settings</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Theme */}
          <div className="settings-section">
            <h4><i className="fas fa-palette" style={{ color: 'var(--slate-300)' }}></i> Appearance</h4>
            <div style={{ background: 'var(--slate-50)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Theme Style</div>
              <div className="theme-toggle" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} style={{ flex: 1, minWidth: 100 }}>Standard Light</button>
                <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} style={{ flex: 1, minWidth: 100 }}>Deep Dark</button>
                <button className={theme === 'midnight' ? 'active' : ''} onClick={() => setTheme('midnight')} style={{ flex: 1, minWidth: 100 }}>Midnight Blue</button>
                <button className={theme === 'forest' ? 'active' : ''} onClick={() => setTheme('forest')} style={{ flex: 1, minWidth: 100 }}>Forest Green</button>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="settings-section">
            <h4><i className="fas fa-cog" style={{ color: 'var(--slate-300)' }}></i> Preferences</h4>
            <div className="float-group">
              <select className="float-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="₹">Indian Rupee (₹)</option>
                <option value="$">US Dollar ($)</option>
                <option value="€">Euro (€)</option>
                <option value="£">British Pound (£)</option>
                <option value="¥">Japanese Yen (¥)</option>
              </select>
              <label className="float-label active">Currency Symbol</label>
              <i className="select-chevron fas fa-chevron-down"></i>
            </div>
            <div className="float-group">
              <select className="float-input" value={startScreen} onChange={(e) => setStartScreen(e.target.value)}>
                <option value="expense">Expenses Form</option>
                <option value="lending">Lending Form</option>
                <option value="reports">Reports View</option>
              </select>
              <label className="float-label active">Start Screen</label>
              <i className="select-chevron fas fa-chevron-down"></i>
            </div>
          </div>

          {/* Data */}
          <div className="settings-section">
            <h4><i className="fas fa-database" style={{ color: 'var(--slate-300)' }}></i> Data Management</h4>
            
            <div className="float-group" style={{ marginBottom: 12 }}>
              <input
                type="text"
                className="float-input"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
              />
              <label className="float-label active">Google Apps Script Exec URL</label>
            </div>

            <button 
              onClick={() => {
                if (!gasUrl.trim()) {
                  alert('Please enter a valid Google Apps Script Exec URL first!')
                  return
                }
                setConfirmStep(1)
              }} 
              style={{
                width: '100%', padding: 12, borderRadius: 'var(--radius-md)',
                background: 'var(--accent-50)', color: 'var(--accent-600)', border: '1px solid var(--accent-200)',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', marginBottom: 16
              }}
            >
              <i className="fas fa-file-import"></i> Import Legacy Data
            </button>

            <button onClick={handleClearCache} style={{
              width: '100%', padding: 12, border: '2px solid #fecaca', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--red-500)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s',
            }}>
              <i className="fas fa-eraser"></i> Clear App Cache
            </button>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
              Clears local settings and login session. Data on server is safe.
            </p>
          </div>
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border-color)' }}>
          <button className="btn-primary" onClick={handleSave} style={{ background: 'linear-gradient(135deg, var(--slate-800), var(--slate-900))', boxShadow: 'none' }}>
            <i className="fas fa-check" style={{ marginRight: 6 }}></i> Save Changes
          </button>
        </div>
      </div>

      {/* Nested Confirmations */}
      {confirmStep > 0 && (
        <div className="modal-overlay" style={{ zIndex: 150 }}>
          <div className="modal-backdrop" onClick={() => setConfirmStep(0)}></div>
          <div className="modal-container" style={{ maxWidth: 360, padding: 20 }}>
            {confirmStep === 1 && (
              <div style={{ textAlign: 'center' }}>
                <i className="fas fa-exclamation-triangle" style={{ fontSize: 40, color: 'var(--amber-500)', marginBottom: 12 }}></i>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Warning: Data Import</h3>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  This will pull records from your Google Apps Script and write them to Firestore. This could create duplicates if you have already started using the new Firebase DB.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '10px 0' }} onClick={() => setConfirmStep(0)}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 1, padding: '10px 0', background: 'var(--amber-500)' }} onClick={() => setConfirmStep(2)}>I Understand</button>
                </div>
              </div>
            )}

            {confirmStep === 2 && (
              <div style={{ textAlign: 'center' }}>
                <i className="fas fa-radiation" style={{ fontSize: 40, color: 'var(--red-500)', marginBottom: 12 }}></i>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Are you absolutely sure?</h3>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  This action is irreversible and should only be performed once to migrate legacy data.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '10px 0' }} onClick={() => setConfirmStep(0)}>Cancel</button>
                  <button className="btn-primary danger" style={{ flex: 1, padding: '10px 0' }} onClick={() => setConfirmStep(3)}>Continue</button>
                </div>
              </div>
            )}

            {confirmStep === 3 && (
              <div style={{ textAlign: 'center' }}>
                <i className="fas fa-shield-alt" style={{ fontSize: 40, color: 'var(--accent-600)', marginBottom: 12 }}></i>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Type Confirmation</h3>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Please type <strong style={{ color: 'var(--red-600)' }}>IMPORT</strong> to confirm the operation.
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type IMPORT here"
                  style={{
                    width: '100%', padding: '10px 12px', border: '2px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)', fontSize: 12, textAlign: 'center', marginBottom: 16,
                    outline: 'none', background: 'var(--bg-input)', color: 'var(--text-primary)'
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '10px 0' }} onClick={() => { setConfirmStep(0); setConfirmInput(''); }}>Cancel</button>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, padding: '10px 0', background: confirmInput === 'IMPORT' ? 'var(--accent-600)' : 'var(--slate-300)', cursor: confirmInput === 'IMPORT' ? 'pointer' : 'not-allowed' }} 
                    disabled={confirmInput !== 'IMPORT'}
                    onClick={() => {
                      setConfirmStep(0)
                      setConfirmInput('')
                      onMigrate?.(gasUrl)
                    }}
                  >
                    Confirm Import
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
