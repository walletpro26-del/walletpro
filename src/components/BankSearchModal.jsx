import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { db, auth } from '../firebase'
import { collection, getDocs, query, where, writeBatch, doc, addDoc, Timestamp, deleteDoc } from 'firebase/firestore'
import { saveSnapshot, loadSnapshot } from '../api/localCache'

import { parsePdfWithGemini, MAX_PDF_SIZE_BYTES } from '../api/pdfExtractor'
import { importTaskQueue } from '../api/importTaskQueue'
import { checkCsvRateLimit, recordCsvImportSuccess } from '../api/csvRateLimit'

function getNormalizedBankName(rawBank) {
  if (!rawBank) return 'Bank'
  const trimmed = rawBank.trim()
  try {
    const aliases = JSON.parse(localStorage.getItem('wv_bank_aliases') || '{}')
    if (aliases[trimmed]) return aliases[trimmed]
    const lower = trimmed.toLowerCase()
    for (const [key, val] of Object.entries(aliases)) {
      if (key.toLowerCase() === lower) return val
    }
  } catch (e) {}
  return trimmed
}

export default function BankSearchModal({ uid, isAdmin = false, onClose }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [allRecords, setAllRecords] = useState(null)
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [aiProgress, setAiProgress] = useState({ status: '', percent: 0 })
  const [error, setError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [csvPreviewData, setCsvPreviewData] = useState(null)

  // Bank Merge State
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSourceBank, setMergeSourceBank] = useState('')
  const [mergeTargetBank, setMergeTargetBank] = useState('')
  const [customTargetBank, setCustomTargetBank] = useState('')
  const [autoSaveAlias, setAutoSaveAlias] = useState(true)
  const [isMerging, setIsMerging] = useState(false)

  // Subscribe to background importTaskQueue for real-time updates across modal closes
  useEffect(() => {
    const unsubscribe = importTaskQueue.subscribe((task) => {
      if (task && task.mode === 'bank') {
        if (task.type === 'commit') {
          setLoading(!task.isComplete)
          if (task.error) setError('CSV Import Failed: ' + task.error)
          return
        }
        setAiProgress({ status: task.status, percent: task.percent })
        setAiParsing(!task.isComplete)
        if (task.error) {
          setError('PDF AI Extraction Error: ' + task.error)
        } else if (task.items && task.isComplete) {
          try {
            processBankExtractedItems(task.items)
          } catch (err) {
            setError('Extraction error: ' + (err?.message || 'Failed to process bank transactions'))
          }
          importTaskQueue.clearActiveTask()
        }
      }
    })
    return () => unsubscribe()
  }, [])

  // Restore saved preview draft if user previously closed modal
  useEffect(() => {
    const draft = importTaskQueue.getDraftPreview('bank')
    if (draft && draft.items && draft.items.length > 0) {
      const rehydrated = {
        ...draft,
        items: draft.items.map((i) => ({
          ...i,
          date: i.date ? new Date(i.date) : new Date(),
        })),
      }
      setCsvPreviewData(rehydrated)
    }
  }, [])

  async function loadRecords() {
    if (allRecords) return allRecords
    
    // Check local cache first for instant display
    const cached = loadSnapshot('bank', uid)
    if (cached && cached.length > 0) {
      const rehydrated = cached.map((r) => ({
        ...r,
        date: r.date ? new Date(r.date) : new Date(),
      }))
      setAllRecords(rehydrated)
    } else {
      setLoading(true)
    }

    setError('')
    try {
      // User-scoped bank transactions query
      const qScoped = query(collection(db, 'bankTransactions'), where('userId', '==', uid || ''))
      const snapScoped = await getDocs(qScoped)
      let records = snapScoped.docs.map((d) => {
        const data = d.data()
        const dateObj = data.date?.toDate?.() || new Date(data.date)
        return {
          id: d.id,
          bank: data.bank || '',
          date: dateObj,
          description: data.description || '',
          debit: data.debit || 0,
          credit: data.credit || 0,
          balance: data.balance || 0,
          searchStr: `${dateObj.toLocaleDateString('en-IN')} ${data.description || ''} ${data.bank || ''} ${data.debit || ''} ${data.credit || ''} ${data.balance || ''}`.toLowerCase(),
        }
      })

      records.sort((a, b) => b.date - a.date)
      setAllRecords(records)
      saveSnapshot('bank', records, uid)
      setLoading(false)
      return records
    } catch (err) {
      const cached2 = loadSnapshot('bank', uid)
      const rehydrated = (cached2 || []).map((r) => ({
        ...r,
        date: r.date ? new Date(r.date) : new Date(),
      }))
      setAllRecords(rehydrated)
      setLoading(false)
      return rehydrated
    }
  }

  useEffect(() => {
    let active = true
    async function doSearch() {
      const records = await loadRecords()
      if (!active) return
      
      if (!searchTerm.trim()) {
        setFiltered(records.slice(0, 50))
        return
      }
      const terms = searchTerm.toLowerCase().split(/\s+/)
      const results = records.filter((r) => terms.every((t) => r.searchStr.includes(t)))
      setFiltered(results.slice(0, 100))
    }
    doSearch()
    return () => { active = false }
  }, [searchTerm, uid])

  function downloadCsvTemplate() {
    const sampleCsv = `Date,Bank,Description,Debit,Credit,Balance
2026-07-22,HDFC Bank,UPI/Swiggy/Order123,250,0,45000.00
2026-07-21,HDFC Bank,Salary Credited,0,55000,45250.00
2026-07-20,SBI,ATM Cash Withdrawal,2000,0,10250.50`

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bank_transactions_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function processBankExtractedItems(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      setError('No valid bank transactions extracted.')
      return
    }

    const items = rawList.map((row, idx) => {
      let d = new Date()
      if (row.date) {
        const parsed = new Date(row.date)
        if (!isNaN(parsed.getTime())) d = parsed
      }
      return {
        id: 'import_bank_' + idx + '_' + Date.now(),
        date: d,
        bank: getNormalizedBankName(row.bank),
        description: row.description || 'Transaction',
        debit: parseFloat(row.debit) || 0,
        credit: parseFloat(row.credit) || 0,
        balance: parseFloat(row.balance) || 0,
        selected: true,
      }
    })

    const previewObj = { items }
    setCsvPreviewData(previewObj)
    importTaskQueue.saveDraftPreview('bank', previewObj)
  }

  async function handleCsvFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setError('')
    setImportSuccess('')

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    if (isPdf) {
      if (file.size > MAX_PDF_SIZE_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1)
        setError(`⚠ PDF size (${mb} MB) exceeds the 10 MB limit. Please select a smaller PDF statement.`)
        return
      }

      // Delegate to background importTaskQueue
      importTaskQueue.startPdfParsingTask({
        file,
        mode: 'bank',
        isAdmin,
      })
      return
    }

    // Enforce CSV import rate limit for non-admin users
    const limitCheck = checkCsvRateLimit(isAdmin)
    if (!limitCheck.allowed) {
      setError(limitCheck.reason)
      return
    }

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) {
        throw new Error('CSV file must contain a header row and at least 1 data row.')
      }

      function parseCSVLine(line) {
        const row = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            row.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        row.push(current.trim())
        return row
      }

      const headers = parseCSVLine(lines[0])

      function findCol(headers, names) {
        const cleanHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
        for (const name of names) {
          const target = name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const idx = cleanHeaders.findIndex(h => h.includes(target))
          if (idx !== -1) return idx
        }
        return -1
      }

      const dateIdx = findCol(headers, ['date', 'txndate', 'transactiondate', 'valuedate', 'postdate', 'dt'])
      const bankIdx = findCol(headers, ['bank', 'bankname', 'institution', 'account', 'branch'])
      const descIdx = findCol(headers, ['description', 'particulars', 'narration', 'details', 'remark', 'remarks', 'payee'])
      const debitIdx = findCol(headers, ['debit', 'withdrawal', 'dr', 'out', 'paidout', 'debitamount'])
      const creditIdx = findCol(headers, ['credit', 'deposit', 'cr', 'in', 'paidin', 'creditamount'])
      const amountIdx = findCol(headers, ['amount', 'amt', 'transactionamount', 'val'])
      const balIdx = findCol(headers, ['balance', 'bal', 'closingbalance', 'runningbalance', 'availbal'])

      if (dateIdx === -1 && debitIdx === -1 && creditIdx === -1 && amountIdx === -1) {
        throw new Error('CSV headers not recognized. Download template to view expected format.')
      }

      function parseCsvDate(str) {
        if (!str) return new Date()
        const clean = str.replace(/["']/g, '').trim()
        const direct = new Date(clean)
        if (!isNaN(direct.getTime())) return direct

        const parts = clean.split(/[- .:/]/)
        if (parts.length >= 3) {
          let day, month, year
          const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
          const pm = parts[1].toLowerCase().substring(0, 3)

          if (parts[0].length === 4) {
            year = parseInt(parts[0], 10)
            month = monthNames[pm] !== undefined ? monthNames[pm] : (parseInt(parts[1], 10) - 1)
            day = parseInt(parts[2], 10)
          } else {
            day = parseInt(parts[0], 10)
            month = monthNames[pm] !== undefined ? monthNames[pm] : (parseInt(parts[1], 10) - 1)
            year = parseInt(parts[2], 10)
            if (year < 100) year += 2000
          }
          const dt = new Date(year, month, day)
          if (!isNaN(dt.getTime())) return dt
        }
        return new Date()
      }

      function parseNum(val) {
        if (!val) return 0
        const clean = String(val).replace(/[^0-9.-]/g, '')
        const num = parseFloat(clean)
        return isNaN(num) ? 0 : num
      }

      const items = []
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i])
        if (row.length === 0 || (row.length === 1 && !row[0])) continue

        const dateObj = dateIdx !== -1 ? parseCsvDate(row[dateIdx]) : new Date()
        const bank = bankIdx !== -1 ? (row[bankIdx] || 'Bank') : 'Bank'
        const description = descIdx !== -1 ? (row[descIdx] || '') : ''
        
        let debit = 0, credit = 0
        if (debitIdx !== -1) debit = parseNum(row[debitIdx])
        if (creditIdx !== -1) credit = parseNum(row[creditIdx])
        if (debit === 0 && credit === 0 && amountIdx !== -1) {
          const amt = parseNum(row[amountIdx])
          if (amt < 0) debit = Math.abs(amt)
          else credit = amt
        }

        const balance = balIdx !== -1 ? parseNum(row[balIdx]) : 0

        const isDuplicate = (allRecords || []).some((existing) => {
          const sameDate = Math.abs(new Date(existing.date) - dateObj) < 86400000
          const sameAmt = existing.debit === debit && existing.credit === credit
          const sameDesc = (existing.description || '').toLowerCase().trim() === description.toLowerCase().trim()
          return sameDate && sameAmt && (sameDesc || (debit > 0 || credit > 0))
        })

        items.push({
          date: dateObj,
          bank,
          description,
          debit,
          credit,
          balance,
          selected: !isDuplicate,
          isDuplicate,
        })
      }

      if (items.length === 0) {
        throw new Error('No valid bank transactions found in this CSV file.')
      }

      const dupCount = items.filter(i => i.isDuplicate).length
      setCsvPreviewData({ filename: file.name, items, dupCount })
    } catch (err) {
      setError('CSV Parsing Failed: ' + (err?.message || 'Invalid format'))
    }
  }

  function togglePreviewItem(index) {
    if (!csvPreviewData) return
    setCsvPreviewData((prev) => {
      const next = [...prev.items]
      next[index] = { ...next[index], selected: !next[index].selected }
      return { ...prev, items: next }
    })
  }

  function toggleSelectAllPreview(selectVal) {
    if (!csvPreviewData) return
    setCsvPreviewData((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({ ...item, selected: selectVal })),
    }))
  }

  async function confirmCsvImport() {
    if (!csvPreviewData) return
    const selectedItems = csvPreviewData.items.filter((i) => i.selected)
    if (selectedItems.length === 0) {
      setError('Please select at least one transaction to import.')
      return
    }

    const limitCheck = checkCsvRateLimit(isAdmin)
    if (!limitCheck.allowed) {
      setError(limitCheck.reason)
      return
    }

    setLoading(true)
    setError('')
    setImportSuccess('')

    const currentUid = uid || auth?.currentUser?.uid || ''
    if (!currentUid) {
      setError('Authentication required. Please refresh or re-login to import bank transactions.')
      setLoading(false)
      return
    }

    importTaskQueue.startBatchCommitTask({
      mode: 'bank',
      count: selectedItems.length,
      commitFn: async (updateProgress) => {
        const newRecords = []
        const firestoreItems = []

        selectedItems.forEach((item, i) => {
          firestoreItems.push({
            userId: currentUid,
            bank: item.bank || 'Bank',
            date: Timestamp.fromDate(item.date),
            description: item.description || '',
            debit: item.debit || 0,
            credit: item.credit || 0,
            balance: item.balance || 0,
          })

          newRecords.push({
            id: `imported_${Date.now()}_${i}`,
            bank: item.bank || 'Bank',
            date: item.date,
            description: item.description || '',
            debit: item.debit || 0,
            credit: item.credit || 0,
            balance: item.balance || 0,
            searchStr: `${item.date.toLocaleDateString('en-IN')} ${item.description || ''} ${item.bank || ''} ${item.debit || ''} ${item.credit || ''} ${item.balance || ''}`.toLowerCase(),
          })
        })

        // Write to Firestore in smaller chunks of 200 with fallback for reliability
        const batchSize = 200
        const totalChunks = Math.ceil(firestoreItems.length / batchSize)
        for (let i = 0; i < firestoreItems.length; i += batchSize) {
          const chunkNum = Math.floor(i / batchSize) + 1
          const chunk = firestoreItems.slice(i, i + batchSize)
          const pct = Math.round((chunkNum / totalChunks) * 100)
          updateProgress(pct, `Saving bank transactions (Batch ${chunkNum} of ${totalChunks})...`)

          try {
            const batch = writeBatch(db)
            chunk.forEach((docData) => {
              const docRef = doc(collection(db, 'bankTransactions'))
              batch.set(docRef, docData)
            })
            await batch.commit()
          } catch (batchErr) {
            // Fallback to individual addDoc calls if batch commit encounters limits
            for (const docData of chunk) {
              try {
                await addDoc(collection(db, 'bankTransactions'), docData)
              } catch (singleErr) {
                // quiet log
              }
            }
          }
        }

        // Record successful CSV import timestamp
        recordCsvImportSuccess()

        const combined = [...newRecords, ...(allRecords || [])].sort((a, b) => b.date - a.date)
        setAllRecords(combined)
        saveSnapshot('bank', combined, currentUid)
        setFiltered(combined.slice(0, 50))
        setCsvPreviewData(null)
        setImportSuccess(`✔ Successfully imported ${selectedItems.length} bank transactions!`)
        return combined
      },
    })
  }

  async function handleDeleteRecord(id) {
    if (!id) return
    if (!window.confirm('Are you sure you want to delete this bank record?')) return

    try {
      await deleteDoc(doc(db, 'bankTransactions', id))
      const updated = (allRecords || []).filter((r) => r.id !== id)
      setAllRecords(updated)
      setFiltered((prev) => prev.filter((r) => r.id !== id))
      saveSnapshot('bank', updated)
      setImportSuccess('✔ Bank transaction deleted.')
      setTimeout(() => setImportSuccess(''), 3000)
    } catch (err) {
      setError('Failed to delete record: ' + (err?.message || 'Error'))
    }
  }

  async function handlePerformBankMerge() {
    const src = mergeSourceBank.trim()
    const target = (customTargetBank.trim() || mergeTargetBank.trim())

    if (!src) {
      setError('Please select a source bank name to merge.')
      return
    }
    if (!target) {
      setError('Please select or type a target bank name.')
      return
    }
    if (src.toLowerCase() === target.toLowerCase()) {
      setError('Source and target bank names cannot be identical.')
      return
    }

    setIsMerging(true)
    setError('')

    const currentUid = uid || auth?.currentUser?.uid || ''
    try {
      const matching = (allRecords || []).filter((r) => r.bank.toLowerCase() === src.toLowerCase())

      if (matching.length === 0) {
        setError(`No records found with bank name "${src}".`)
        setIsMerging(false)
        return
      }

      // Perform Firestore batch updates
      const batchSize = 200
      for (let i = 0; i < matching.length; i += batchSize) {
        const chunk = matching.slice(i, i + batchSize)
        const batch = writeBatch(db)
        chunk.forEach((rec) => {
          if (rec.id && !rec.id.startsWith('imported_')) {
            const docRef = doc(db, 'bankTransactions', rec.id)
            batch.update(docRef, { bank: target })
          }
        })
        await batch.commit()
      }

      // Save alias mapping if enabled
      if (autoSaveAlias) {
        try {
          const aliases = JSON.parse(localStorage.getItem('wv_bank_aliases') || '{}')
          aliases[src] = target
          localStorage.setItem('wv_bank_aliases', JSON.stringify(aliases))
        } catch (e) {}
      }

      // Update local state & snapshot
      const updatedRecords = (allRecords || []).map((r) => {
        if (r.bank.toLowerCase() === src.toLowerCase()) {
          return {
            ...r,
            bank: target,
            searchStr: `${r.date.toLocaleDateString('en-IN')} ${r.description || ''} ${target} ${r.debit || ''} ${r.credit || ''} ${r.balance || ''}`.toLowerCase(),
          }
        }
        return r
      })

      setAllRecords(updatedRecords)
      saveSnapshot('bank', updatedRecords, currentUid)
      setFiltered(updatedRecords.slice(0, 50))
      setShowMergeModal(false)
      setImportSuccess(`🎉 Successfully merged ${matching.length} records from "${src}" into "${target}" across Firebase!`)
      setTimeout(() => setImportSuccess(''), 4000)
    } catch (err) {
      setError('Failed to merge bank records: ' + (err?.message || 'Error updating database'))
    } finally {
      setIsMerging(false)
    }
  }

  function formatDate(d) {
    try { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) }
    catch { return '' }
  }

  const selectedPreviewCount = csvPreviewData ? csvPreviewData.items.filter((i) => i.selected).length : 0
  const allSelected = csvPreviewData && csvPreviewData.items.every((i) => i.selected)

  const latestByBank = (allRecords || []).reduce((acc, r) => {
    const b = (r.bank || 'Bank').trim()
    if (!acc[b] || r.date > acc[b]) {
      acc[b] = r.date
    }
    return acc
  }, {})

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-container" style={{ maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="bank-search-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
              <i className="fas fa-university" style={{ fontSize: 12 }}></i>
            </div>
            {csvPreviewData ? 'CSV Import Preview' : 'Bank Transaction History'}
          </h3>
          
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!csvPreviewData && (
              <>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '5px 10px', fontSize: 11, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 'var(--radius-sm)' }}
                  onClick={downloadCsvTemplate}
                  title="Download CSV Template"
                >
                  <i className="fas fa-download" style={{ fontSize: 10, marginRight: 4 }} /> Template
                </button>
                <label
                  className="btn-outline"
                  style={{ padding: '5px 10px', fontSize: 11, background: 'var(--accent-gradient)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: aiParsing ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  title="Import CSV or PDF bank statement (Max 10MB)"
                >
                  <i className={`fas ${aiParsing ? 'fa-brain fa-spin' : 'fa-file-upload'}`} style={{ fontSize: 11, marginRight: 4 }} />
                  {aiParsing ? 'Extracting File...' : 'Import File/Doc'}
                  <input type="file" accept=".pdf,.csv,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.heic,.mp3,.wav,.m4a,application/pdf,text/csv,text/plain,image/*,audio/*" disabled={aiParsing} style={{ display: 'none' }} onChange={handleCsvFileSelect} />
                </label>
              </>
            )}
            <button className="modal-close" style={{ background: 'rgba(255,255,255,0.1)', color: '#a5b4fc' }} onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Banners & Real-Time Progress Indicator */}
        {aiParsing && (
          <div style={{ margin: '10px 16px 0', padding: '12px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-600)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <i className="fas fa-brain fa-spin" /> {aiProgress.status || 'Extracting PDF Statement...'}
            </div>
            <div style={{ width: '90%', height: 6, background: 'var(--slate-200)', borderRadius: 99, margin: '6px auto 4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${aiProgress.percent || 15}%`,
                  background: 'linear-gradient(90deg, #6366f1, #10b981)',
                  borderRadius: 99,
                  transition: 'width 0.35s ease-in-out',
                }}
              />
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--accent-600)' }}>
              {aiProgress.percent || 15}% Completed
            </div>
          </div>
        )}
        {error && <div className="error-banner" style={{ margin: '10px 16px 0' }}>{error}</div>}
        {importSuccess && (
          <div style={{ margin: '10px 16px 0', padding: '10px 14px', background: 'var(--emerald-50)', border: '1px solid var(--emerald-500)', color: 'var(--emerald-600)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600 }}>
            {importSuccess}
          </div>
        )}

        {/* ── CSV Preview Step ── */}
        {csvPreviewData ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ padding: '10px 16px', background: 'var(--slate-50)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  File: <span style={{ color: 'var(--accent-600)' }}>{csvPreviewData.filename}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {selectedPreviewCount} of {csvPreviewData.items.length} transactions selected
                  {csvPreviewData.dupCount > 0 && (
                    <span style={{ color: 'var(--amber-700)', marginLeft: 6, fontWeight: 700 }}>
                      ({csvPreviewData.dupCount} duplicates auto-unchecked)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}
                onClick={() => toggleSelectAllPreview(!allSelected)}
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Scrollable list of parsed rows */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {csvPreviewData.items.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => togglePreviewItem(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '4px 0',
                    borderRadius: 'var(--radius-md)', border: item.isDuplicate ? '1px dashed var(--amber-500)' : '1px solid var(--border-color)',
                    background: item.selected ? 'var(--bg-card)' : 'var(--slate-50)',
                    opacity: item.selected ? 1 : 0.55, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--accent-600)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                      <span>{formatDate(item.date)}</span>
                      <span style={{ color: 'var(--accent-500)', textTransform: 'uppercase' }}>{item.bank}</span>
                      {item.isDuplicate && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber-700)', background: 'var(--amber-50)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--amber-500)' }}>
                          ⚠️ Duplicate
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.description || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {item.debit > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--red-500)' }}>-₹{item.debit.toLocaleString('en-IN')}</div>}
                    {item.credit > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--emerald-600)' }}>+₹{item.credit.toLocaleString('en-IN')}</div>}
                    {item.balance > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bal: ₹{item.balance.toLocaleString('en-IN')}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer action buttons */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setCsvPreviewData(null)}
                style={{ padding: '8px 14px', fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedPreviewCount === 0 || loading}
                onClick={confirmCsvImport}
                style={{ margin: 0, padding: '8px 16px', width: 'auto', fontSize: 12, minHeight: 38 }}
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Importing...</>
                ) : (
                  <><i className="fas fa-file-import"></i> Confirm Import ({selectedPreviewCount})</>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ── Main Search View ── */
          <>
            {/* Latest Record Date by Bank Guidance Card */}
            {Object.keys(latestByBank).length > 0 && (
              <div style={{ margin: '10px 16px 0', padding: '10px 12px', background: 'var(--slate-50)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <i className="fas fa-university" style={{ color: 'var(--accent-500)', marginRight: 6 }} />
                    Latest Record Date by Bank
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, textTransform: 'none', fontWeight: 500 }}>
                      {allRecords.length} records total
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const banks = Object.keys(latestByBank)
                        setMergeSourceBank(banks[0] || '')
                        setMergeTargetBank(banks[1] || banks[0] || '')
                        setCustomTargetBank('')
                        setShowMergeModal(true)
                      }}
                      style={{
                        padding: '2px 7px', fontSize: 10, fontWeight: 700,
                        background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-600)',
                        border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 4, cursor: 'pointer'
                      }}
                      title="Merge similar bank names (e.g. J&K and J&K BANK) into one"
                    >
                      <i className="fas fa-edit" style={{ fontSize: 9, marginRight: 3 }} /> Merge Banks
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(latestByBank).map(([bName, dt]) => (
                    <div
                      key={bName}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                        display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      <span style={{ color: 'var(--accent-600)', textTransform: 'uppercase', fontSize: 10, fontWeight: 800 }}>{bName}:</span>
                      <span>{formatDate(dt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bank-search-input-area">
              <div style={{ position: 'relative' }}>
                <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}></i>
                <input
                  type="text"
                  placeholder="Search amount, date, desc..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px 12px 38px', border: '2px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
                    color: 'var(--text-primary)', background: 'var(--bg-input)', outline: 'none',
                  }}
                />
              </div>
            </div>

            <div className="bank-search-results custom-scrollbar" style={{ flex: 1, overflow: 'auto' }}>
              {loading && (
                <div className="loader-wrap">
                  <div className="loader-spinner"></div>
                  <div className="loader-text">Loading...</div>
                </div>
              )}
              {!loading && filtered.length === 0 && !error && (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--accent-100)' }}>
                    <i className="fas fa-search-dollar" style={{ fontSize: 28 }}></i>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 500 }}>Enter keywords to search bank history or click "Import CSV"</p>
                </div>
              )}
              {filtered.map((r, i) => (
                <div key={r.id || i} className="bank-txn-item" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div>
                      <div className="bank-txn-date">{formatDate(r.date)}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-500)', textTransform: 'uppercase' }}>{r.bank}</div>
                    </div>
                    <div className="bank-txn-desc" style={{ flex: 1 }}>{r.description}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {r.debit > 0 && <div className="bank-txn-amount debit">-₹{r.debit.toLocaleString('en-IN')}</div>}
                    {r.credit > 0 && <div className="bank-txn-amount credit">+₹{r.credit.toLocaleString('en-IN')}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bal: ₹{r.balance.toLocaleString('en-IN')}</div>
                  </div>
                  {r.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRecord(r.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--slate-400)',
                        cursor: 'pointer',
                        padding: '6px',
                        fontSize: 13,
                        borderRadius: 'var(--radius-sm)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Delete bank record"
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--red-500)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--slate-400)'}
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bank Name Merge Dialog Overlay */}
      {showMergeModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)', zIndex: 130, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16
          }}
          onClick={() => setShowMergeModal(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: 440, background: 'var(--bg-card, #ffffff)',
              borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              padding: 20, zIndex: 131
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                ✏️ Merge &amp; Rename Bank Names
              </h4>
              <button
                type="button"
                style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowMergeModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Merge bank records formatted under different names (e.g. <b>J&amp;K</b> and <b>J&amp;K BANK</b>) into a single unified bank name across Firebase.
            </p>

            {/* Source Bank Select */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)' }}>
                1. Select Source Bank to Rename (Existing)
              </label>
              <select
                value={mergeSourceBank}
                onChange={(e) => setMergeSourceBank(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-subtle)' }}
              >
                {Object.keys(latestByBank).map((b) => {
                  const cnt = (allRecords || []).filter((r) => r.bank.toLowerCase() === b.toLowerCase()).length
                  return (
                    <option key={b} value={b}>
                      {b} ({cnt} records)
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Target Bank Select / Input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)' }}>
                2. Select or Type Target Bank Name (Destination)
              </label>
              <select
                value={mergeTargetBank}
                onChange={(e) => setMergeTargetBank(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-subtle)', marginBottom: 6 }}
              >
                {Object.keys(latestByBank).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__custom__">+ Custom Bank Name...</option>
              </select>

              {(mergeTargetBank === '__custom__' || !Object.keys(latestByBank).includes(mergeTargetBank)) && (
                <input
                  type="text"
                  placeholder="Enter target bank name (e.g. J&K BANK)"
                  value={customTargetBank}
                  onChange={(e) => setCustomTargetBank(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12 }}
                />
              )}
            </div>

            {/* Alias Checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={autoSaveAlias}
                onChange={(e) => setAutoSaveAlias(e.target.checked)}
              />
              Always auto-convert future PDF statement imports from "{mergeSourceBank || 'Source'}" into "{customTargetBank || mergeTargetBank || 'Target'}"
            </label>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowMergeModal(false)}
                style={{ padding: '8px 14px', fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMerging}
                onClick={handlePerformBankMerge}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 800, color: '#fff',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none',
                  borderRadius: 8, cursor: isMerging ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {isMerging ? <><i className="fas fa-spinner fa-spin" /> Merging...</> : <><i className="fas fa-check" /> Merge &amp; Update Firebase</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
