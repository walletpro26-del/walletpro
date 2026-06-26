import { useState } from 'react'
import { db } from '../firebase'
import { collection, addDoc, Timestamp, writeBatch, doc, getDocs, query, where } from 'firebase/firestore'

export default function MigrationTool({ uid, gasUrl, onClose, onComplete }) {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [log, setLog] = useState([])
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  function addLog(msg) {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`])
  }

  function parseDate(d) {
    if (!d) return null
    if (d instanceof Date) return d
    const str = String(d).trim()
    if (!str) return null
    let date = new Date(str)
    if (!isNaN(date.getTime()) && str.length > 5) return date
    // Try dd-MM-yyyy format
    const parts = str.split(/[- .:/]/)
    if (parts.length >= 3) {
      const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
      let day = parseInt(parts[0], 10)
      let month, year
      const pm = parts[1].toLowerCase().substring(0, 3)
      if (monthNames[pm] !== undefined) { month = monthNames[pm]; year = parseInt(parts[2], 10) }
      else { month = parseInt(parts[1], 10) - 1; year = parseInt(parts[2], 10) }
      if (year < 100) year += 2000
      let hour = parseInt(parts[3], 10) || 0
      let min = parseInt(parts[4], 10) || 0
      let sec = parseInt(parts[5], 10) || 0
      if (str.toUpperCase().includes('PM') && hour < 12) hour += 12
      if (str.toUpperCase().includes('AM') && hour === 12) hour = 0
      date = new Date(year, month, day, hour, min, sec)
      if (!isNaN(date.getTime())) return date
    }
    return null
  }

  function parseAmount(val) {
    if (typeof val === 'number') return val
    if (!val) return 0
    const clean = String(val).replace(/[^0-9.-]/g, '')
    const num = parseFloat(clean)
    return isNaN(num) ? 0 : num
  }

  async function runMigration() {
    setStatus('running')
    setError('')
    setLog([])
    setProgress(0)
    addLog('Starting migration from Google Apps Script...')

    try {
      // 0. Diagnostic check of the sheets
      addLog('Diagnosing Google Sheets structure...')
      const diagRes = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'debugSheets' }),
      })
      const diagData = await diagRes.json()
      if (diagData?.sheets) {
        addLog(`Spreadsheet URL: ${diagData.url || 'Unknown'}`)
        diagData.sheets.forEach((s) => {
          addLog(`Sheet [${s.name}]: ${s.rows} rows, ${s.cols} cols`)
        })
      } else {
        addLog('⚠ Diagnostic failed: old Apps Script version or debugSheets action missing.')
      }

      // 0.5 Clear existing data to prevent duplicates
      addLog('Clearing existing data from Firestore to prevent duplicates...')
      const collectionsToClear = ['expenses', 'lending', 'bankTransactions']
      for (const colName of collectionsToClear) {
        const q = query(collection(db, colName), where('userId', '==', uid || ''))
        const snap = await getDocs(q)
        if (!snap.empty) {
          addLog(`  Deleting ${snap.size} old records from ${colName}...`)
          let delCount = 0
          for (let i = 0; i < snap.docs.length; i += 500) {
            const batch = writeBatch(db)
            const chunk = snap.docs.slice(i, i + 500)
            chunk.forEach(d => batch.delete(d.ref))
            await batch.commit()
            delCount += chunk.length
          }
          addLog(`  ✓ Cleared ${delCount} records from ${colName}`)
        }
      }
      setProgress(10)

      // 1. Fetch dashboard data (contains all transactions in searchIndex)
      addLog('Fetching dashboard data...')
      const dashRes = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'getDashboardData' }),
      })
      const dashData = await dashRes.json()
      if (dashData?.error) throw new Error(dashData.message)
      setProgress(20)

      // 2. Import expenses from searchIndex
      const expenses = (dashData.searchIndex || []).filter((t) => !t.isLend && t.sheet === 'expense')
      addLog(`Found ${expenses.length} expense records`)
      let expCount = 0
      const expBatchSize = 500
      for (let i = 0; i < expenses.length; i += expBatchSize) {
        const batch = writeBatch(db)
        const chunk = expenses.slice(i, i + expBatchSize)
        for (const e of chunk) {
          const ts = parseDate(e.date) || new Date()
          const docRef = doc(collection(db, 'expenses'))
          batch.set(docRef, {
            timestamp: Timestamp.fromDate(ts),
            userId: uid || '',
            forWhom: e.rawWhom || e.whom || '',
            category: e.rawCat || e.cat || '',
            details: e.rawDet || e.detail || '',
            amount: parseAmount(e.rawAmt || e.amt),
            paymentMode: e.rawMode || 'Cash',
            remarks: e.rawRem || '',
            hasAttachment: false,
            hasChunkedAttachment: false,
            fileData: null,
            fileName: '',
            mimeType: '',
          })
        }
        await batch.commit()
        expCount += chunk.length
        addLog(`  Imported ${expCount}/${expenses.length} expenses`)
        setProgress(20 + Math.round((expCount / expenses.length) * 25))
      }
      addLog(`✓ Imported ${expCount} expenses`)
      setProgress(45)

      // 3. Import lending
      const lending = (dashData.searchIndex || []).filter((t) => t.isLend && t.sheet === 'lending')
      addLog(`Found ${lending.length} lending records`)
      let lendCount = 0
      const lendBatchSize = 500
      for (let i = 0; i < lending.length; i += lendBatchSize) {
        const batch = writeBatch(db)
        const chunk = lending.slice(i, i + lendBatchSize)
        for (const l of chunk) {
          const ts = parseDate(l.date) || new Date()
          const docRef = doc(collection(db, 'lending'))
          batch.set(docRef, {
            timestamp: Timestamp.fromDate(ts),
            userId: uid || '',
            type: l.rawType || l.cat || '',
            person: l.rawName || l.whom || '',
            amount: parseAmount(l.rawAmt || l.amt),
            remarks: l.rawRem || l.detail || '',
            hasAttachment: false,
            hasChunkedAttachment: false,
            fileData: null,
            fileName: '',
            mimeType: '',
          })
        }
        await batch.commit()
        lendCount += chunk.length
        addLog(`  Imported ${lendCount}/${lending.length} lending records`)
        setProgress(45 + Math.round((lendCount / lending.length) * 25))
      }
      addLog(`✓ Imported ${lendCount} lending records`)
      setProgress(70)

      // 4. Fetch and import bank records
      addLog('Fetching bank records...')
      const bankRes = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'fetchBankRecords' }),
      })
      const bankData = await bankRes.json()
      if (Array.isArray(bankData)) {
        addLog(`Found ${bankData.length} bank records`)
        let bankCount = 0
        const bankBatchSize = 500
        for (let i = 0; i < bankData.length; i += bankBatchSize) {
          const batch = writeBatch(db)
          const chunk = bankData.slice(i, i + bankBatchSize)
          for (const b of chunk) {
            const ts = parseDate(b.date) || new Date()
            const docRef = doc(collection(db, 'bankTransactions'))
            batch.set(docRef, {
              bank: b.bank || '',
              userId: uid || '',
              date: Timestamp.fromDate(ts),
              description: b.description || '',
              debit: parseAmount(b.debit),
              credit: parseAmount(b.credit),
              balance: parseAmount(b.balance),
            })
          }
          await batch.commit()
          bankCount += chunk.length
          addLog(`  Imported ${bankCount}/${bankData.length} bank records`)
          setProgress(70 + Math.round((bankCount / bankData.length) * 28))
        }
        addLog(`✓ Imported ${bankCount} bank records`)
      } else {
        addLog('⚠ Bank records not available or empty')
      }

      setProgress(100)
      addLog('🎉 Migration complete!')
      setStatus('done')
      onComplete?.()
    } catch (err) {
      setError(err?.message || 'Migration failed')
      addLog(`✗ Error: ${err?.message || err}`)
      setStatus('error')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={status === 'running' ? undefined : onClose}></div>
      <div className="modal-container" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-header-icon" style={{ background: 'var(--emerald-50)', color: 'var(--emerald-600)' }}>
              <i className="fas fa-file-import"></i>
            </div>
            <div>
              <h3>Import Data</h3>
              <div className="modal-date">From Google Apps Script</div>
            </div>
          </div>
          {status !== 'running' && (
            <button className="modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          )}
        </div>

        <div className="modal-body custom-scrollbar">
          {status === 'idle' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--emerald-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24, color: 'var(--emerald-500)' }}>
                <i className="fas fa-database"></i>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Import your existing data from the old Google Sheets app</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>
                This will fetch expenses, lending, and bank records from your Google Apps Script and import them into Firebase.
              </p>
              <button className="btn-primary emerald" onClick={runMigration}>
                <i className="fas fa-play" style={{ marginRight: 8 }}></i> Start Import
              </button>
            </div>
          )}

          {status !== 'idle' && (
            <div>
              <div className="migration-progress">
                <div className="migration-progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-600)', marginBottom: 12 }}>{progress}%</div>

              {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

              <div style={{
                background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', padding: 12,
                fontFamily: 'monospace', fontSize: 10, maxHeight: 240, overflowY: 'auto',
                border: '1px solid var(--border-color)',
              }} className="custom-scrollbar">
                {log.map((line, i) => (
                  <div key={i} style={{ marginBottom: 3, color: line.includes('✓') ? 'var(--emerald-600)' : line.includes('✗') ? 'var(--red-500)' : 'var(--text-secondary)' }}>
                    {line}
                  </div>
                ))}
              </div>

              {status === 'done' && (
                <button className="btn-primary" onClick={onClose} style={{ marginTop: 16 }}>
                  <i className="fas fa-check" style={{ marginRight: 8 }}></i> Done — Close
                </button>
              )}
              {status === 'error' && (
                <button className="btn-primary danger" onClick={runMigration} style={{ marginTop: 16 }}>
                  <i className="fas fa-redo" style={{ marginRight: 8 }}></i> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
