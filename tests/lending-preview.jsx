// In-memory contacts and saves; never writes to Firestore.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import LendingForm from '../src/components/LendingForm'
import '../src/styles.css'

function Preview() {
  const [records, setRecords] = useState([{person:'Alex',mobileNo:'1111111111',email:'alex@example.com',date:'2026-10-01',type:'Lend',remarks:'School fees'}])
  const [saved, setSaved] = useState(null)
  return <main style={{maxWidth:540,margin:'24px auto',padding:20,background:'var(--bg-card)',borderRadius:12}}>
    <p style={{marginBottom:16}}>Lending preview · sample contacts · no live writes</p>
    <LendingForm suggestions={{persons:['Alex','Jordan']}} allLending={records} loading={false} onSave={record => {setSaved(record); setRecords(previous => [...previous, record])}} />
    {saved && <output aria-label="Saved lending preview">{JSON.stringify(saved)}</output>}
  </main>
}
createRoot(document.getElementById('root')).render(<Preview />)
