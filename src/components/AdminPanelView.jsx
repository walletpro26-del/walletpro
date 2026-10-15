import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './admin-panel.css'

function Field({ label, children }) {
  return <label className="admin-field"><span>{label}</span>{children}</label>
}

function Section({ title, children }) {
  return <section className="admin-section"><h4>{title}</h4>{children}</section>
}

export default function AdminPanelView({
  auth, onClose, activeTab, onTabChange, loading, saving, toast, error, onDismissError,
  accounts, counts, filterTab, onFilterChange, search, onSearchChange, refreshing, onRefresh,
  showQuickActivate, onToggleActivate, manualUser, onManualUserChange, manualPlan, onManualPlanChange, manualSubmitting, onManualSet,
  showSyncPanel, onToggleSync, syncEmails, onSyncEmailsChange, syncing, onSyncUsers, purging, onPurge, onAccountAction,
  settings, onSettingChange, onSaveSettings, storageBytes, cloudMetricInput, onCloudMetricChange, onSaveMetric, calculatingStorage, onScan, calcStats,
}) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.() }
  }, [])

  function handleDialogKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length)
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  const numericField = (label, key) => <Field label={label}><input type="number" min="0" value={settings[key]} onChange={event => onSettingChange(key, event.target.value)} /></Field>
  const toggle = (label, key) => <label className="admin-check"><input type="checkbox" checked={settings[key]} onChange={event => onSettingChange(key, event.target.checked)} /><span>{label}</span></label>

  return createPortal(
    <div className="modal-overlay admin-overlay">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title" tabIndex={-1} ref={dialogRef} onKeyDown={handleDialogKey}>
        <header className="admin-panel-header">
          <div><h3 id="admin-panel-title">Administration</h3><p>{auth?.email}</p></div>
          <button type="button" className="admin-close" aria-label="Close administration" onClick={onClose}>×</button>
        </header>
        <nav className="admin-tabs" aria-label="Administration sections">
          {[['users', 'Accounts'], ['settings', 'Settings'], ['storage', 'Storage']].map(([id, label]) => <button type="button" key={id} aria-current={activeTab === id ? 'page' : undefined} onClick={() => onTabChange(id)}>{label}{id === 'users' && <span>{counts.totalAccounts}</span>}</button>)}
        </nav>
        <div className="admin-panel-body">
          {toast && <div className="admin-notice" role="status">{toast}</div>}
          {error && <div className="admin-notice is-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={onDismissError}>×</button></div>}
          {activeTab === 'users' && <>
            <div className="admin-filters" aria-label="Filter accounts">
              {[['all', 'All', counts.totalAccounts], ['regular', 'Active', counts.regularActiveCount], ['admin', 'Admin', counts.adminActivatedCount], ['pending', 'Pending', counts.pendingSubsCount], ['inactive', 'Inactive', counts.revokedSubsCount]].map(([id, label, count]) => <button type="button" key={id} aria-pressed={filterTab === id} onClick={() => onFilterChange(id)}>{label} <span>{count}</span></button>)}
            </div>
            <div className="admin-search-row"><input aria-label="Search accounts" placeholder="Search email or user ID" type="search" value={search} onChange={event => onSearchChange(event.target.value)} /><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
            <div className="admin-tools"><button type="button" aria-expanded={showQuickActivate} onClick={onToggleActivate}>Activate account</button><button type="button" aria-expanded={showSyncPanel} onClick={onToggleSync}>Import users</button><button type="button" className="admin-danger" disabled={purging} onClick={onPurge}>{purging ? 'Removing…' : 'Remove duplicates'}</button></div>
            {showQuickActivate && <section className="admin-inline-panel">
              <h4>Account access</h4>
              <Field label="Email or user ID"><input value={manualUser} onChange={event => onManualUserChange(event.target.value)} /></Field>
              <div className="admin-inline-actions"><select aria-label="Activation plan" value={manualPlan} onChange={event => onManualPlanChange(event.target.value)}>
                <option value="monthly">Pro · 30 days</option><option value="yearly">Pro · 1 year</option>
                {[7, 15, 60, 90, 180].map(days => <option key={days} value={days}>Pro · {days} days</option>)}
                <option value="ultra_monthly">Ultra · 30 days</option><option value="ultra_yearly">Ultra · 1 year</option>
              </select><button type="button" disabled={manualSubmitting || !manualUser.trim()} onClick={() => onManualSet('active')}>Activate</button><button type="button" className="admin-danger" disabled={manualSubmitting || !manualUser.trim()} onClick={() => onManualSet('revoked')}>Deactivate</button></div>
            </section>}
            {showSyncPanel && <section className="admin-inline-panel"><h4>Import users</h4><Field label="Email addresses, separated by commas or new lines"><textarea rows={3} value={syncEmails} onChange={event => onSyncEmailsChange(event.target.value)} /></Field><button type="button" disabled={syncing || !syncEmails.trim()} onClick={onSyncUsers}>{syncing ? 'Importing…' : 'Import'}</button></section>}
            <div className="admin-account-list" aria-label="Accounts">
              {accounts.map(account => <article className="admin-account-row" key={account.id || account.userId || account.email}>
                <div className="admin-account-copy"><strong title={account.email || account.userId}>{account.email || account.userId}</strong><span>{account.isSuperAdmin ? 'Administrator' : (account.plan || 'No plan').replaceAll('_', ' ')}{account.expiresDate && ` · Ends ${account.expiresDate.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}`}</span></div>
                <span className={`admin-status is-${account.isActive ? 'active' : account.isPending ? 'pending' : 'inactive'}`}>{account.isActive ? 'Active' : account.isPending ? 'Pending' : 'Inactive'}</span>
                <select aria-label={`Actions for ${account.email || account.userId}`} className="admin-account-actions" value="" disabled={manualSubmitting} onChange={event => onAccountAction(event.target.value, account)}>
                  <option value="" disabled>Actions</option>
                  <option value="monthly">{account.isActive ? 'Extend 30 days' : 'Activate 30 days'}</option>
                  <option value="yearly">{account.isActive ? 'Extend 1 year' : 'Activate 1 year'}</option>
                  <option value="custom">Custom duration…</option>
                  {!account.isSuperAdmin && <option value="nudge">WhatsApp reminder</option>}
                  {!account.isSuperAdmin && account.isActive && <option value="deactivate">Deactivate</option>}
                  {!account.isSuperAdmin && <option value="delete">Delete account…</option>}
                </select>
              </article>)}
              {!accounts.length && <p className="admin-empty">{loading ? 'Loading accounts…' : 'No accounts match this filter.'}</p>}
            </div>
          </>}
          {activeTab === 'settings' && <div className="admin-settings">
            {loading ? <p role="status">Loading settings…</p> : <>
              <Section title="Subscription pricing"><div className="admin-grid">{numericField('Pro monthly (₹)', 'monthlyPrice')}{numericField('Pro yearly (₹)', 'yearlyPrice')}{numericField('Ultra monthly (₹)', 'ultraMonthlyPrice')}{numericField('Ultra yearly (₹)', 'ultraYearlyPrice')}</div>{toggle('Enable Ultra purchases', 'ultraEnabled')}{toggle('Show Ultra coming soon label', 'ultraComingSoon')}{toggle('Hide bank sync banner', 'hideUltraBanner')}</Section>
              <Section title="Account limit"><div className="admin-inline-actions">{numericField('Maximum regular accounts', 'subscriberLimit')}<button type="button" onClick={() => onSettingChange('subscriberLimit', '0')}>Unlimited</button></div><p className="admin-help">0 = unlimited. Admin-granted access is excluded.</p></Section>
              <Section title="Announcement"><Field label="Message"><input value={settings.announcement} onChange={event => onSettingChange('announcement', event.target.value)} placeholder="Leave empty to hide" /></Field><Field label="Type"><select value={settings.announcementType} onChange={event => onSettingChange('announcementType', event.target.value)}><option value="info">Information</option><option value="warning">Warning</option><option value="success">Success</option></select></Field></Section>
              <Section title="Payments">
                {toggle('Razorpay', 'razorpayEnabled')}
                {settings.razorpayEnabled && <div className="admin-grid"><Field label="Mode"><select value={settings.razorpayMode} onChange={event => onSettingChange('razorpayMode', event.target.value)}><option value="test">Test</option><option value="live">Live</option></select></Field><Field label="Key ID"><input value={settings.razorpayKeyId} onChange={event => onSettingChange('razorpayKeyId', event.target.value)} /></Field></div>}
                {toggle('Cashfree', 'cashfreeEnabled')}
                {settings.cashfreeEnabled && <div className="admin-grid"><Field label="Mode"><select value={settings.cashfreeMode} onChange={event => onSettingChange('cashfreeMode', event.target.value)}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></Field><Field label="App ID"><input value={settings.cashfreeAppId} onChange={event => onSettingChange('cashfreeAppId', event.target.value)} /></Field></div>}
                <p className="admin-help">Checkout awaits server-side payment verification.</p>
              </Section>
              <Section title="Document imports"><Field label="Gemini API keys (one per line)"><textarea rows={2} autoComplete="off" spellCheck={false} value={settings.geminiApiKeys} onChange={event => onSettingChange('geminiApiKeys', event.target.value)} /></Field><Field label="Models, in preference order"><textarea rows={2} spellCheck={false} value={settings.geminiModels} onChange={event => onSettingChange('geminiModels', event.target.value)} /></Field>{toggle('Allow PDF and other non-CSV imports', 'allowNonCsvImport')}</Section>
              <Section title="Availability">{toggle('Maintenance mode', 'maintenanceMode')}</Section>
              <div className="admin-save-row"><button type="button" className="admin-primary" disabled={saving} onClick={onSaveSettings}>{saving ? 'Saving…' : 'Save settings'}</button></div>
            </>}
          </div>}
          {activeTab === 'storage' && <div className="admin-storage">
            <Section title="Recorded storage usage"><div className="admin-storage-value">{storageBytes.toFixed(2)} <span>/ 1,024 MiB</span></div><progress max={1024} value={storageBytes} aria-label="Recorded storage usage" /><p className="admin-help">{((storageBytes / 1024) * 100).toFixed(2)}% used · {Math.max(0, 1024 - storageBytes).toFixed(2)} MiB remaining</p></Section>
            <Section title="Update usage"><p className="admin-help">Enter the storage metric from Google Cloud, in MiB.</p><div className="admin-inline-actions"><input type="number" min="0" step="0.01" aria-label="Storage metric in MiB" value={cloudMetricInput} onChange={event => onCloudMetricChange(event.target.value)} /><button type="button" onClick={onSaveMetric}>Save value</button></div></Section>
            <Section title="Document scan"><div className="admin-inline-actions"><p className="admin-help">Estimates document payload size; excludes indexes.</p><button type="button" disabled={calculatingStorage} onClick={onScan}>{calculatingStorage ? 'Scanning…' : 'Scan documents'}</button></div>
              {calcStats && <><dl className="admin-scan-results">{[['Expenses', calcStats.expensesCount], ['Lending', calcStats.lendingCount], ['Profiles', calcStats.usersCount], ['Subscriptions', calcStats.subsCount], ['Bank records', calcStats.bankCount], ['Reviews & reminders', (calcStats.reviewsCount || 0) + (calcStats.remindersCount || 0)]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl><p className="admin-help">{calcStats.totalDocs} documents · approximately {calcStats.calculatedMB} MiB</p></>}
            </Section>
          </div>}
        </div>
      </div>
    </div>, document.body,
  )
}
