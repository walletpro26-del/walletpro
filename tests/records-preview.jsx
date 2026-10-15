// Sample records for visual verification. No live admin or transaction writes.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import BankHistoryView from '../src/components/BankHistoryView'
import ReportsView from '../src/components/ReportsView'
import '../src/styles.css'

const bank = [
  {id:'sample-1',date:'2026-10-15',bank:'Everyday Bank',description:'UPI / home internet subscription / monthly broadband payment',debit:2100,credit:0,balance:422},
  {id:'sample-2',date:'2026-10-14',bank:'Everyday Bank',description:'UPI / reimbursement from family',debit:0,credit:2000,balance:2522},
  {id:'sample-3',date:'2026-10-13',bank:'Savings Bank',description:'Card / groceries at neighbourhood store',debit:1200,credit:0,balance:12000},
  {id:'sample-4',date:'2026-10-12',bank:'Savings Bank',description:'Monthly salary credit',debit:0,credit:45000,balance:13200},
]
const expenses = [
  {id:'e1',date:'2026-10-15',dateObj:new Date('2026-10-15'),category:'Groceries',forWhom:'Home',amount:1200,details:'Weekly groceries'},
  {id:'e2',date:'2026-10-14',dateObj:new Date('2026-10-14'),category:'Fuel',forWhom:'Home',amount:3300,details:'Petrol'},
  {id:'e3',date:'2026-10-13',dateObj:new Date('2026-10-13'),category:'Health',forWhom:'Self',amount:500,details:'Medicines'},
]
function Preview() {
  const [tab, setTab] = useState('bank')
  return <main style={{maxWidth:620,margin:'24px auto',padding:16,background:'var(--bg-card)',borderRadius:12}}>
    <div style={{display:'flex',gap:10,marginBottom:16}}><button type="button" onClick={() => setTab('bank')}>Bank preview</button><button type="button" onClick={() => setTab('reports')}>Reports preview</button></div>
    <p style={{fontSize:11,color:'var(--text-muted)',marginBottom:12}}>Sample records · no live writes</p>
    {tab === 'bank' ? <BankHistoryView bankRecords={bank} subscription={{active:false}} appConfig={{ultraEnabled:false}} onOpenImport={() => {}} onOpenMerge={() => {}} /> : <ReportsView allExpenses={expenses} allLending={[]} bankRecords={bank} onSelectTxn={() => {}} />}
  </main>
}
createRoot(document.getElementById('root')).render(<Preview />)
