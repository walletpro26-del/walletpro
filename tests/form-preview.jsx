// Local-only UI verification fixture. All records and saves are in memory.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ExpenseForm from '../src/components/ExpenseForm'
import Header from '../src/components/Header'
import { buildDetailPatterns } from '../src/utils/expenseDetailSuggestions'
import '../src/styles.css'

const expenses = [
  { category: 'Fuel', forWhom: 'Home', details: 'Petrol for family car, ref 8017 km. Central filling station; UPI', date: '2026-10-15' },
  { category: 'Fuel', forWhom: 'Home', details: 'Petrol for family car, ref 7500 km. Central filling station; UPI', date: '2026-10-01' },
  { category: 'Groceries', forWhom: 'Home', details: 'Weekly groceries from the neighbourhood shop', date: '2026-10-14' },
  { category: 'Groceries', forWhom: 'Home', details: 'Weekly groceries from the neighbourhood shop', date: '2026-10-07' },
  { category: 'Health', forWhom: 'Self', details: 'Monthly medicines from the pharmacy', date: '2026-10-12' },
]
const suggestions = { categories: ['Fuel', 'Groceries', 'Health'], forWhom: ['Home', 'Self'], details: expenses.map(item => item.details), quickFills: [], detailPatterns: buildDetailPatterns(expenses) }
function Preview() {
  const [saved, setSaved] = useState(null)
  return <div style={{maxWidth:620,margin:'24px auto'}}><Header auth={{email:'admin@example.com'}} subscription={{isAdmin:true}} stats={{expense:{today:0,month:1250,total:5200}}} activeTab="expense" searchIndex={[]} />
  <main style={{ padding: 24, borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
    <h1 style={{ fontSize: 21, marginBottom: 6 }}>New expense</h1>
    <p style={{ marginBottom: 24, fontSize: 13, color: 'var(--text-muted)' }}>Design preview · Sample records · No data is saved</p>
    <ExpenseForm suggestions={suggestions} loading={false} onSave={setSaved} />
    {saved && <output aria-label="Saved preview">{JSON.stringify(saved)}</output>}
  </main></div>
}
createRoot(document.getElementById('root')).render(<Preview />)
