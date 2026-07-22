import { useState, useEffect } from 'react'
import { getAppConfig, updateAppConfig, invalidateConfigCache } from '../api/appConfig'
import { isAdminEmail, ADMIN_EMAILS } from '../api/subscription'

export default function AdminPanel({ auth, onClose }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  // Editable fields
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [yearlyPrice, setYearlyPrice] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [announcementType, setAnnouncementType] = useState('info')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [razorpayEnabled, setRazorpayEnabled] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      invalidateConfigCache()
      const cfg = await getAppConfig()
      setConfig(cfg)
      setMonthlyPrice(String(cfg.monthlyPrice || 20))
      setYearlyPrice(String(cfg.yearlyPrice || 150))
      setTrialDays(String(cfg.trialDays || 0))
      setAnnouncement(cfg.announcement || '')
      setAnnouncementType(cfg.announcementType || 'info')
      setMaintenanceMode(cfg.maintenanceMode || false)
      setRazorpayEnabled(cfg.razorpayEnabled !== false)
    } catch (err) {
      setError('Failed to load config: ' + err?.message)
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const mp = parseFloat(monthlyPrice) || 20
      const yp = parseFloat(yearlyPrice) || 150
      const td = parseInt(trialDays) || 0

      if (mp <= 0 || yp <= 0) {
        setError('Prices must be greater than 0')
        setSaving(false)
        return
      }
      if (yp < mp) {
        setError('Yearly price should be greater than or equal to monthly price')
        setSaving(false)
        return
      }

      await updateAppConfig(auth?.email, {
        monthlyPrice: mp,
        yearlyPrice: yp,
        trialDays: td,
        announcement,
        announcementType,
        maintenanceMode,
        razorpayEnabled,
      })

      setToast('✅ Configuration saved successfully!')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setError(err?.message || 'Failed to save')
    }
    setSaving(false)
  }

  if (!isAdminEmail(auth?.email)) {
    return (
      <div className="modal-overlay">
        <div className="modal-backdrop" onClick={onClose} />
        <div className="modal-container" style={{ maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <i className="fas fa-lock" style={{ fontSize: 40, color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px' }}>Access Denied</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Only admin accounts can access this panel.</p>
          <button className="btn-primary" onClick={onClose} style={{ marginTop: 16 }}>Close</button>
        </div>
      </div>
    )
  }

  const savingsPercent = monthlyPrice > 0 ? Math.round((1 - (yearlyPrice / (monthlyPrice * 12))) * 100) : 0

  return (
    <div className="modal-overlay" style={{ zIndex: 130 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-container" style={{ maxWidth: 480, maxHeight: '94vh' }}>
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '20px',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                👑
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Admin Control Panel</h3>
                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>Manage App Configuration</p>
              </div>
            </div>
            <button className="modal-close" onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body custom-scrollbar" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: 'var(--accent-500)' }} />
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Loading configuration...</p>
            </div>
          ) : (
            <>
              {error && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} />
                  {error}
                </div>
              )}

              {toast && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10b981',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {toast}
                </div>
              )}

              {/* Subscription Pricing */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-tag" style={{ color: 'var(--accent-500)' }} />
                  Subscription Pricing (₹ INR)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="compact-row">
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                      Monthly Price
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                      <input
                        type="number"
                        value={monthlyPrice}
                        onChange={(e) => setMonthlyPrice(e.target.value)}
                        min="1"
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 28px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>per month</span>
                  </div>

                  <div className="compact-row">
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                      Yearly Price
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                      <input
                        type="number"
                        value={yearlyPrice}
                        onChange={(e) => setYearlyPrice(e.target.value)}
                        min="1"
                        style={{
                          width: '100%',
                          padding: '10px 10px 10px 28px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: 16,
                          fontWeight: 800,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      per year {savingsPercent > 0 && <strong style={{ color: '#10b981' }}>({savingsPercent}% off)</strong>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trial Period */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-clock" style={{ color: '#f59e0b' }} />
                  Free Trial
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    min="0"
                    max="365"
                    style={{
                      width: 80,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontSize: 15,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    days free trial for new users
                  </span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Set to 0 to disable free trial. New users will see the subscription popup immediately.
                </p>
              </div>

              {/* App Announcement */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-bullhorn" style={{ color: '#8b5cf6' }} />
                  App Announcement Banner
                </h4>

                <input
                  type="text"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="e.g. 🎉 Limited offer: 50% off yearly plan!"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                />

                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {['info', 'warning', 'success'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setAnnouncementType(t)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 99,
                        border: announcementType === t ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
                        background: announcementType === t ? 'var(--accent-50)' : 'transparent',
                        color: announcementType === t ? 'var(--accent-600)' : 'var(--text-muted)',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      {t === 'info' ? '🔵' : t === 'warning' ? '🟡' : '🟢'} {t}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Leave blank to hide the banner. This appears on the login and main screens.
                </p>
              </div>

              {/* Toggles */}
              <div>
                <h4 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <i className="fas fa-sliders-h" style={{ color: '#06b6d4' }} />
                  Controls
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-subtle)',
                    cursor: 'pointer',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Razorpay Payments</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Enable/disable payment collection</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={razorpayEnabled}
                      onChange={(e) => setRazorpayEnabled(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#6366f1' }}
                    />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: maintenanceMode ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border-color)',
                    background: maintenanceMode ? 'rgba(239,68,68,0.06)' : 'var(--bg-subtle)',
                    cursor: 'pointer',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: maintenanceMode ? '#ef4444' : 'var(--text-primary)' }}>
                        Maintenance Mode
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {maintenanceMode ? '⚠️ App is currently in maintenance mode!' : 'Show maintenance notice to all users'}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#ef4444' }}
                    />
                  </label>
                </div>
              </div>

              {/* Admin Info */}
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>
                <strong>Admin Emails:</strong> {ADMIN_EMAILS.join(', ')}
                {config?.updatedAt && (
                  <div style={{ marginTop: 4 }}>
                    Last updated: {new Date(config.updatedAt?.seconds ? config.updatedAt.seconds * 1000 : config.updatedAt).toLocaleString('en-IN')} by {config.updatedBy || '—'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ minWidth: 120 }}
            >
              {saving ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Saving...</> : <><i className="fas fa-save" style={{ marginRight: 6 }} />Save Changes</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
