import { useState } from 'react'
import { createPortal } from 'react-dom'
import { isAdminEmail } from '../api/subscription'

export default function SettingsModal({ auth, subscription, onClose, onSave, onMigrate, onManageSubscription, onOpenRatingModal }) {
  const [theme, setTheme] = useState(localStorage.getItem('wv_theme') || localStorage.getItem('wp_theme') || 'light')
  const [currency, setCurrency] = useState(localStorage.getItem('wv_currency') || localStorage.getItem('wp_currency') || '₹')
  const [startScreen, setStartScreen] = useState(localStorage.getItem('wv_startScreen') || localStorage.getItem('wp_startScreen') || 'expense')
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('wv_gas_url') || localStorage.getItem('wp_gas_url') || import.meta.env.VITE_GAS_URL || '')
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('wv_custom_gemini_api_key') || '')

  const isAdmin = subscription?.isAdmin || isAdminEmail(auth?.email)

  // Confirmations
  const [confirmStep, setConfirmStep] = useState(0) // 0: none, 1: warn 1, 2: warn 2, 3: type text
  const [confirmInput, setConfirmInput] = useState('')

  function handleSave() {
    localStorage.setItem('wv_theme', theme)
    localStorage.setItem('wv_currency', currency)
    localStorage.setItem('wv_startScreen', startScreen)
    localStorage.setItem('wv_gas_url', gasUrl)
    if (geminiApiKey.trim()) {
      localStorage.setItem('wv_custom_gemini_api_key', geminiApiKey.trim())
    } else {
      localStorage.removeItem('wv_custom_gemini_api_key')
    }
    document.documentElement.setAttribute('data-theme', theme)
    onSave?.({ theme, currency, startScreen, gasUrl, geminiApiKey })
    onClose()
  }

  function handleClearCache() {
    if (!window.confirm('Clear all local app cache and reload? Your cloud data will re-sync.')) return
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
    { id: 'light', name: 'Light', bg: '#ffffff', color: '#1e293b', accent: '#6366f1' },
    { id: 'dark', name: 'Dark', bg: '#0f172a', color: '#f8fafc', accent: '#818cf8' },
    { id: 'midnight', name: 'Midnight', bg: '#0b1120', color: '#f1f5f9', accent: '#38bdf8' },
    { id: 'forest', name: 'Forest', bg: '#022c22', color: '#ecfdf5', accent: '#34d399' },
  ]

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-container" style={{ maxWidth: 420, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Compact Header */}
        <div className="modal-header" style={{ padding: '12px 16px' }}>
          <div className="modal-header-info">
            <div className="modal-header-icon" style={{ width: 32, height: 32, fontSize: 14, background: 'var(--accent-50)', color: 'var(--accent-600)' }}>
              <i className="fas fa-cog"></i>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Settings &amp; Preferences</h3>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>WalletVibe Account &amp; App Config</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ width: 26, height: 26, fontSize: 11 }}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Compact Body */}
        <div className="modal-body custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          {/* User Account & Subscription Compact Row */}
          <div style={{
            background: 'var(--bg-subtle)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--accent-gradient)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                flexShrink: 0
              }}>
                {userInitial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {auth?.name || auth?.email || 'WalletVibe User'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                  {subscription?.isAdmin ? '👑 Free Lifetime Admin' : (subscription?.active ? '⭐ Active Plan' : '⚠️ Free Account')}
                </div>
              </div>
            </div>

            {!subscription?.isAdmin && (
              <button
                className="btn-primary"
                onClick={() => {
                  onClose?.()
                  onManageSubscription?.()
                }}
                style={{ padding: '5px 10px', fontSize: 10.5, borderRadius: 6 }}
              >
                {subscription?.active ? 'Manage' : 'Upgrade'}
              </button>
            )}
          </div>

          {/* Theme Selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              <i className="fas fa-palette" style={{ color: 'var(--accent-500)', marginRight: 5 }} /> Theme
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {themes.map((t) => {
                const isActive = theme === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 8,
                      border: isActive ? '2px solid var(--accent-600)' : '1px solid var(--border-color)',
                      background: t.bg,
                      color: t.color,
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: 10.5,
                      fontWeight: 700,
                      boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div>{t.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 3 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.bg, border: '1px solid #ccc' }} />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Currency & Start Screen Preferences */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11.5, background: 'var(--bg-card)' }}
              >
                <option value="₹">Rupee (₹)</option>
                <option value="$">Dollar ($)</option>
                <option value="€">Euro (€)</option>
                <option value="£">Pound (£)</option>
                <option value="¥">Yen (¥)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Start Screen
              </label>
              <select
                value={startScreen}
                onChange={(e) => setStartScreen(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11.5, background: 'var(--bg-card)' }}
              >
                <option value="expense">Expenses</option>
                <option value="lending">Lend/Borrow</option>
                <option value="reports">Reports</option>
              </select>
            </div>
          </div>

          {/* Custom Gemini AI API Key Input */}
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              🔑 Custom Gemini AI API Key (Optional)
            </label>
            <input
              type="password"
              placeholder="AIzaSy... (Google AI Studio Key)"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11, background: 'var(--bg-card)' }}
            />
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Supply your own Google AI Studio key to bypass 429 quota limits.
            </div>
          </div>

          {/* Quick Action Tools */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              <i className="fas fa-tools" style={{ color: 'var(--accent-500)', marginRight: 5 }} /> Quick Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <button
                type="button"
                onClick={handleExportBackup}
                style={{
                  padding: '7px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: 10.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: 4
                }}
              >
                <i className="fas fa-download" style={{ color: 'var(--accent-600)', fontSize: 10 }} /> JSON Backup
              </button>

              <button
                type="button"
                onClick={() => { onClose(); onOpenRatingModal?.() }}
                style={{
                  padding: '7px 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#d97706',
                  fontWeight: 700,
                  fontSize: 10.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: 4
                }}
              >
                ⭐ Rate App
              </button>

              <button
                type="button"
                onClick={handleClearCache}
                style={{
                  padding: '7px 8px',
                  borderRadius: 8,
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.06)',
                  color: '#dc2626',
                  fontWeight: 700,
                  fontSize: 10.5,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: 4
                }}
              >
                <i className="fas fa-eraser" style={{ fontSize: 10 }} /> Clear Cache
              </button>
            </div>

            {/* Legacy Import (Admin-only) */}
            {isAdmin && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  👑 Legacy GAS Data Migration (Admin Only)
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={gasUrl}
                    onChange={(e) => setGasUrl(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', fontSize: 10.5, borderRadius: 6, border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!gasUrl.trim()) {
                        alert('Please enter a Google Apps Script Exec URL first!')
                        return
                      }
                      setConfirmStep(1)
                    }}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--accent-200)',
                      background: 'var(--accent-50)',
                      color: 'var(--accent-600)',
                      fontWeight: 700,
                      fontSize: 10.5,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Migration Tool
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* About App Banner */}
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
            <div><b>WalletVibe Pro v1.0.0</b> • Developed by <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-600)', fontWeight: 700, textDecoration: 'none' }}>NextLifTechnologies</a></div>
            <div style={{ marginTop: 2 }}>Support: <a href="mailto:walletpro26@gmail.com" style={{ color: 'var(--accent-600)', fontWeight: 700, textDecoration: 'none' }}>walletpro26@gmail.com</a></div>
          </div>
        </div>

        {/* Save Footer Button */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle)' }}>
          <button className="btn-primary" onClick={handleSave} style={{ width: '100%', padding: '9px 14px', fontSize: 12, background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-xs)', borderRadius: 8 }}>
            <i className="fas fa-check" style={{ marginRight: 6 }}></i> Save &amp; Apply Settings
          </button>
        </div>
      </div>

      {/* Nested Confirmations */}
      {confirmStep > 0 && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="modal-backdrop" onClick={() => setConfirmStep(0)}></div>
          <div className="modal-container" style={{ maxWidth: 360, padding: 16 }}>
            {confirmStep === 1 && (
              <div>
                <h4 style={{ margin: '0 0 8px', color: 'var(--amber-600)' }}>⚠️ Warning: Overwrite Local Cache?</h4>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Migrating from Google Apps Script will merge remote records into your database. Make sure your GAS URL is correct.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-outline" onClick={() => setConfirmStep(0)} style={{ fontSize: 11, padding: '6px 12px' }}>Cancel</button>
                  <button className="btn-primary" onClick={() => setConfirmStep(2)} style={{ fontSize: 11, padding: '6px 12px' }}>Proceed</button>
                </div>
              </div>
            )}

            {confirmStep === 2 && (
              <div>
                <h4 style={{ margin: '0 0 8px', color: 'var(--red-600)' }}>🛑 Final Confirmation Required</h4>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                  Type <b>MIGRATE</b> below to proceed with the Apps Script migration.
                </p>
                <input
                  type="text"
                  placeholder="Type MIGRATE"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', marginBottom: 12 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-outline" onClick={() => setConfirmStep(0)} style={{ fontSize: 11, padding: '6px 12px' }}>Cancel</button>
                  <button
                    className="btn-primary"
                    disabled={confirmInput !== 'MIGRATE'}
                    onClick={() => {
                      setConfirmStep(0)
                      onMigrate?.(gasUrl)
                    }}
                    style={{ fontSize: 11, padding: '6px 12px', background: 'var(--red-600)' }}
                  >
                    Confirm &amp; Start Migration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
