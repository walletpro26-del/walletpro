// Isolated design fixture. No authentication, database writes or real accounts.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AdminPanelView from '../src/components/AdminPanelView'
import '../src/styles.css'

const accounts = [
  { id: '1', email: 'alex@example.com', plan: 'trial', isActive: false, expiresDate: new Date('2026-10-01') },
  { id: '2', email: 'jordan@example.com', plan: 'yearly', isActive: true, expiresDate: new Date('2027-10-01') },
  { id: '3', email: 'sam@example.com', plan: 'monthly', isPending: true },
  { id: '4', email: 'admin@example.com', isSuperAdmin: true, isActive: true },
]
const initialSettings = { monthlyPrice: '25', yearlyPrice: '150', ultraMonthlyPrice: '49', ultraYearlyPrice: '399', ultraEnabled: false, ultraComingSoon: true, hideUltraBanner: false, subscriberLimit: '100', announcement: '', announcementType: 'info', razorpayEnabled: false, razorpayMode: 'test', razorpayKeyId: '', cashfreeEnabled: false, cashfreeMode: 'sandbox', cashfreeAppId: '', geminiApiKeys: '', geminiModels: '', allowNonCsvImport: true, maintenanceMode: false }
function Preview() {
  const [activeTab, setActiveTab] = useState('users')
  const [filterTab, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [settings, setSettings] = useState(initialSettings)
  const [activate, setActivate] = useState(false)
  const [sync, setSync] = useState(false)
  const [manualUser, setManualUser] = useState('')
  const [manualPlan, setManualPlan] = useState('yearly')
  const [syncEmails, setSyncEmails] = useState('')
  const [metric, setMetric] = useState('17.01')
  const [storageBytes, setStorage] = useState(17.01)
  const [toast, setToast] = useState('')
  const [open, setOpen] = useState(true)
  const noop = () => {}
  return <>
    <div className="header" style={{padding:20}}><span style={{marginRight:20}}>Design preview · Sample accounts</span><button type="button" className="header-access-button" onClick={() => setOpen(true)}>Admin</button></div>
    {open && <AdminPanelView auth={{email:'admin@example.com'}} onClose={() => setOpen(false)} activeTab={activeTab} onTabChange={setActiveTab}
      accounts={accounts.filter(item => (!search || item.email.includes(search)) && (filterTab === 'all' || (filterTab === 'admin' ? item.isSuperAdmin : filterTab === 'regular' ? item.isActive && !item.isSuperAdmin : filterTab === 'pending' ? item.isPending : !item.isActive && !item.isPending)))} counts={{totalAccounts:4,regularActiveCount:1,adminActivatedCount:1,pendingSubsCount:1,revokedSubsCount:1}} filterTab={filterTab} onFilterChange={setFilter} search={search} onSearchChange={setSearch} onRefresh={noop}
      showQuickActivate={activate} onToggleActivate={() => setActivate(!activate)} manualUser={manualUser} onManualUserChange={setManualUser} manualPlan={manualPlan} onManualPlanChange={setManualPlan} onManualSet={noop}
      showSyncPanel={sync} onToggleSync={() => setSync(!sync)} syncEmails={syncEmails} onSyncEmailsChange={setSyncEmails} onSyncUsers={noop} onPurge={noop} onAccountAction={noop}
      settings={settings} onSettingChange={(key,value) => setSettings(previous => ({...previous,[key]:value}))} onSaveSettings={() => setToast('Preview only. No settings were saved.')} toast={toast} onDismissError={noop}
      storageBytes={storageBytes} cloudMetricInput={metric} onCloudMetricChange={setMetric} onSaveMetric={() => setStorage(Number(metric))} onScan={noop} />}
  </>
}
createRoot(document.getElementById('root')).render(<Preview />)
