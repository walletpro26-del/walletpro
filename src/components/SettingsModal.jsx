import { useState } from 'react'
import { isAdminEmail } from '../api/subscription'

export default function SettingsModal({ auth, subscription, onClose, onSave, onMigrate, onManageSubscription }) {
  const [theme, setTheme] = useState(localStorage.getItem('wv_theme') || localStorage.getItem('wp_theme') || 'light')
  const [currency, setCurrency] = useState(localStorage.getItem('wv_currency') || localStorage.getItem('wp_currency') || '₹')
  const [startScreen, setStartScreen] = useState(localStorage.getItem('wv_startScreen') || localStorage.getItem('wp_startScreen') || 'expense')
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('wv_gas_url') || localStorage.getItem('wp_gas_url') || import.meta.env.VITE_GAS_URL || '')
  
  const isAdmin = subscription?.isAdmin || isAdminEmail(auth?.email)

  // Confirmations
  const [confirmStep, setConfirmStep] = useState(0) // 0: none, 1: warn 1, 2: warn 2, 3: type text
  const [confirmInput, setConfirmInput] = useState('')

  function handleSave() {
    localStorage.setItem('wv_theme', theme)
    localStorage.setItem('wv_currency', currency)
    localStorage.setItem('wv_startScreen', startScreen)
    localStorage.setItem('wv_gas_url', gasUrl)
    document.documentElement.setAttribute('data-theme', theme)
    onSave?.({ theme, currency, startScreen, gasUrl })
    onClose()
  }

  function handleClearCache() {
    localStorage.clear()
    location.reload()
  }

  function handleExportBackup() {
    try {
      const exp = JSON.parse(localStorage.getItem('wv_cache_expenses') || '[]')
      const lend = JSON.parse(localStorage.getItem('wv_cache_lending') || '[]')
      const bank = JSON.parse(localStorage.getItem('wv_cache_bank') || '[]')
      
      const backupData = {
        app: 'WalletVibe',
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        user: auth?.email || 'user',
        data: {
          expenses: exp,
          lending: lend,
          bankTransactions: bank,
        }
      }

      const jsonStr = JSON.stringify(backupData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `WalletVibe_Backup_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Could not export backup: ' + err?.message)
    }
  }

  const userInitial = (auth?.email || auth?.name || 'U').charAt(0).toUpperCase()

  const themes = [
    { id: 'light', name: 'Standard Light', bg: '#ffffff', color: '#1e293b', accent: '#6366f1' },
    { id: 'dark', name: 'Deep Dark', bg: '#0f172a', color: '#f8fafc', accent: '#818cf8' },
    { id: 'midnight', name: 'Midnight Blue', bg: '#0b1120', color: '#f1f5f9', accent: '#38bdf8' },
    { id: 'forest', name: 'Forest Green', bg: '#022c22', color: '#ecfdf5', accent: '#34d399' },
  ]

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-container" style={{ maxWidth: 440, maxHeight: '92vh' }}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-header-icon" style={{ background: 'var(--accent-50)', color: 'var(--accent-600)' }}>
              <i className="fas fa-cog"></i>
            </div>
            <div>
              <h3 style={{ margin: 0 }}>Settings & Preferences</h3>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>WalletVibe Account & App Config</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16 }}>
          {/* User Account Info Card */}
          <div style={{
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'var(--accent-gradient)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
              flexShrink: 0
            }}>
              {userInitial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {auth?.name || auth?.email || 'WalletVibe User'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {auth?.email || 'Connected User'}
              </div>
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--emerald-600)',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '4px 8px',
              borderRadius: 99,
              border: '1px solid rgba(16, 185, 129, 0.2)',
              whiteSpace: 'nowrap'
            }}>
              <i className="fas fa-shield-alt" style={{ marginRight: 4 }} /> Cloud Sync
            </span>
          </div>

          {/* Subscription Status Card */}
          <div style={{
            background: subscription?.isAdmin
              ? 'rgba(16, 185, 129, 0.08)'
              : (subscription?.active ? 'rgba(99, 102, 241, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${
              subscription?.isAdmin
                ? 'rgba(16, 185, 129, 0.25)'
                : (subscription?.active ? 'rgba(99, 102, 241, 0.25)' : 'rgba(239, 68, 68, 0.25)')
            }`,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Subscription Plan
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                {subscription?.isAdmin
                  ? '👑 Free Lifetime Admin'
                  : (subscription?.active ? `⭐ Active ${subscription?.plan === 'yearly' ? 'Yearly' : 'Monthly'}` : '⚠️ Inactive / Expired')}
              </div>
              {subscription?.expiresAt && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  Valid until {new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>

            {!subscription?.isAdmin && (
              <button
                className="btn-primary"
                onClick={() => {
                  onClose?.()
                  onManageSubscription?.()
                }}
                style={{ padding: '6px 12px', fontSize: 11 }}
              >
                {subscription?.active ? 'Manage Plan' : 'Subscribe'}
              </button>
            )}
          </div>

          {/* Theme Selector */}
          <div className="settings-section">
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              <i className="fas fa-palette" style={{ color: 'var(--accent-500)', marginRight: 6 }} /> Appearance Theme
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {themes.map((t) => {
                const isActive = theme === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    style={{
                      padding: 10,
                      borderRadius: 'var(--radius-md)',
                      border: isActive ? '2px solid var(--accent-600)' : '1px solid var(--border-color)',
                      background: t.bg,
                      color: t.color,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: isActive ? 'var(--shadow-md)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.bg, border: '1px solid #ccc' }} />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.accent }} />
                      </div>
                    </div>
                    {isActive && <i className="fas fa-check-circle" style={{ color: t.accent, fontSize: 16 }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preferences */}
          <div className="settings-section">
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              <i className="fas fa-sliders-h" style={{ color: 'var(--accent-500)', marginRight: 6 }} /> App Preferences
            </h4>

            <div className="float-group" style={{ marginBottom: 12 }}>
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
              <label className="float-label active">Default Start Screen</label>
              <i className="select-chevron fas fa-chevron-down"></i>
            </div>
          </div>

          {/* Data & Backup Tools */}
          <div className="settings-section">
            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              <i className="fas fa-database" style={{ color: 'var(--accent-500)', marginRight: 6 }} /> Data Tools & Backup
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={handleExportBackup}
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <i className="fas fa-file-export" style={{ color: 'var(--accent-600)' }} /> Backup JSON
              </button>

              {isAdmin && (
                <button 
                  type="button"
                  onClick={() => {
                    if (!gasUrl.trim()) {
                      alert('Please enter a Google Apps Script Exec URL below first!')
                      return
                    }
                    setConfirmStep(1)
                  }} 
                  style={{
                    padding: 10,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--accent-200)',
                    background: 'var(--accent-50)',
                    color: 'var(--accent-600)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <i className="fas fa-file-import" /> Legacy Import
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="float-group" style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  className="float-input"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                />
                <label className="float-label active">Google Apps Script URL (Legacy)</label>
              </div>
            )}

            <button onClick={handleClearCache} style={{
              width: '100%', padding: 10, border: '1px solid var(--red-200)', borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.05)', color: 'var(--red-600)', fontWeight: 700, fontSize: 12,
              cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s',
            }}>
              <i className="fas fa-eraser"></i> Clear Cache & Refresh Session
            </button>
          </div>

          {/* App Info Footer */}
          <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>WalletVibe v1.0.0</div>
            <div>Personal Finance Manager · PWA Ready</div>
            <div style={{ marginTop: 2 }}>
              Need help? <a href="mailto:walletpro26@gmail.com" style={{ color: 'var(--accent-600)', textDecoration: 'none', fontWeight: 600 }}>walletpro26@gmail.com</a>
            </div>
          </div>
        </div>

        <div style={{ padding: 14, borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle)' }}>
          <button className="btn-primary" onClick={handleSave} style={{ width: '100%', padding: '10px 14px', fontSize: 13, background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-sm)' }}>
            <i className="fas fa-check" style={{ marginRight: 6 }}></i> Save & Apply Settings
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
