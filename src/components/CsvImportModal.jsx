import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '../firebase'
import { addExpense, deleteExpense, getAllExpenses, saveExpensesBatch } from '../api/expenses'
import { addLending, deleteLending, getAllLending, saveLendingBatch } from '../api/lending'
import { saveBankTransactionsBatch } from '../api/bankTransactions'
import { loadSnapshot } from '../api/localCache'
import { importTaskQueue } from '../api/importTaskQueue'
import {
  MAX_PDF_SIZE_BYTES,
  getCachedConvertedStatements, deleteCachedConvertedStatement, downloadConvertedCsv
} from '../api/pdfExtractor'
import { checkCsvRateLimit, recordCsvImportSuccess, getCsvImportStats } from '../api/csvRateLimit'
import { normalizePersonName } from '../api/entityNormalizer'

export default function CsvImportModal({ type = 'expense', isAdmin = false, allowNonCsvImport = true, onClose, onImportComplete }) {
  const [mode, setMode] = useState(type) // 'expense' | 'lending'
  const [csvPreviewData, setCsvPreviewData] = useState(null)
  const [importing, setImporting] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [aiProgress, setAiProgress] = useState({ status: '', percent: 0 })
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState(null) // { message, batchId, docIds, mode, count }
  const [csvStats, setCsvStats] = useState(() => getCsvImportStats())
  const [cachedStatements, setCachedStatements] = useState(() => getCachedConvertedStatements())
  
  // Existing user transactions for intelligent duplicate detection
  const [existingExpenses, setExistingExpenses] = useState([])
  const [existingLending, setExistingLending] = useState([])
  
  // Import History & Undo State
  const [showHistory, setShowHistory] = useState(false)
  const [importHistory, setImportHistory] = useState([])
  const [undoingBatchId, setUndoingBatchId] = useState(null)

  // Subscribe to background importTaskQueue for real-time updates across modal closes
  useEffect(() => {
    const unsubscribe = importTaskQueue.subscribe((task) => {
      if (task && (task.mode === mode || task.mode === 'expense' || task.mode === 'lending')) {
        if (task.type === 'commit') {
          setImporting(!task.isComplete)
          if (task.error) setError('Import Commit Error: ' + task.error)
          return
        }
        setAiProgress({ status: task.status, percent: task.percent })
        setAiParsing(!task.isComplete)
        if (task.error) {
          setError('PDF AI Extraction Error: ' + task.error)
        } else if (task.items && task.isComplete) {
          try {
            processExtractedItems(task.items)
          } catch (err) {
            setError('Extraction error: ' + (err?.message || 'Failed to process transactions'))
          }
          importTaskQueue.clearActiveTask()
        }
      }
    })
    return () => unsubscribe()
  }, [mode])

  // Restore saved preview draft if user previously closed modal
  useEffect(() => {
    const draft = importTaskQueue.getDraftPreview(mode)
    if (draft && draft.items && draft.items.length > 0) {
      setCsvPreviewData(draft)
    }
  }, [mode])

  // Load existing records for duplicate detection + load import history
  useEffect(() => {
    async function loadData() {
      try {
        const cachedExp = loadSnapshot('expenses') || []
        const cachedLend = loadSnapshot('lending') || []
        setExistingExpenses(cachedExp)
        setExistingLending(cachedLend)

        const exps = await getAllExpenses()
        if (exps?.length) setExistingExpenses(exps)

        const lends = await getAllLending()
        if (lends?.length) setExistingLending(lends)
      } catch (e) {
        // quiet fallback
      }
    }
    loadData()

    try {
      const hist = JSON.parse(localStorage.getItem('wv_import_history') || '[]')
      setImportHistory(hist)
    } catch {
      setImportHistory([])
    }
  }, [])

  function downloadCsvTemplate(targetMode = mode) {
    let sampleCsv = ''
    let filename = ''

    if (targetMode === 'expense') {
      sampleCsv = `Date,Amount,Category,ForWhom,Details,PaymentMode,Remarks
2026-07-22,250,Food & Drinks,Self,Dinner with friends,Online/UPI,Swiggy order
2026-07-21,1200,Bills & Utility,Home,Electricity Bill,Bank Transfer,July bill
2026-07-20,450,Shopping,Family,Grocery Items,Cash,Local market`
      filename = 'expenses_import_template.csv'
    } else if (targetMode === 'bank') {
      sampleCsv = `Date,Bank,Description,Debit,Credit,Balance
2026-07-22,J&K BANK,UPI-Swiggy Food Order,250,0,45300
2026-07-21,SBI,Salary Deposit,0,50000,95300
2026-07-20,HDFC BANK,ATM Cash Withdrawal,2000,0,43300`
      filename = 'bank_transactions_template.csv'
    } else {
      sampleCsv = `Date,Amount,Person,Type,Remarks,Status
2026-07-22,500,Rahul Kumar,Lent,Given for cab fare,Pending
2026-07-21,1500,Anita Sharma,Borrowed,Office lunch split,Settled
2026-07-19,3000,Amit Patel,Lent,Advance payment,Pending`
      filename = 'lending_import_template.csv'
    }

    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setSuccessInfo(null)

    const name = file.name.toLowerCase()
    const allowedExtensions = ['.pdf', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.heic']
    const hasAllowedExt = allowedExtensions.some((ext) => name.endsWith(ext))

    if (!hasAllowedExt) {
      setError('⚠️ Unsupported file format. Please upload standard document formats only (PDF, Word, Excel, CSV, Text, or Image). Audio and non-document formats are not supported.')
      return
    }

    const isPureCsv = (name.endsWith('.csv') || file.type === 'text/csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')

    if (!isPureCsv) {
      if (!allowNonCsvImport) {
        setError('⚠️ Non-CSV (PDF/Word/Excel/Image) import feature is disabled by Admin. Only CSV file imports are currently permitted.')
        return
      }

      if (file.size > MAX_PDF_SIZE_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1)
        setError(`⚠ File size (${mb} MB) exceeds the 10 MB limit. Please select a smaller file.`)
        return
      }

      // Delegate Multimodal AI extraction to background task queue
      importTaskQueue.startPdfParsingTask({
        file,
        mode,
        isAdmin,
      })
      return
    }

    // CSV File handling
    const limitCheck = checkCsvRateLimit(isAdmin)
    if (!limitCheck.allowed) {
      setError(limitCheck.reason)
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target.result
        parseCsvText(text)
      } catch (err) {
        setError('Failed to parse CSV file: ' + (err?.message || 'Invalid format'))
      }
    }
    reader.onerror = () => setError('Error reading CSV file.')
    reader.readAsText(file)
  }

  function processExtractedItems(rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error('No valid transactions found in statement.')
    }

    const items = []
    let duplicateCount = 0

    if (mode === 'expense') {
      rawList.forEach((row, idx) => {
        const rawAmt = parseFloat(row.amount || 0)
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = new Date().toISOString().split('T')[0]
        if (row.date) {
          const parsed = new Date(row.date)
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const category = row.category || 'General'
        const forWhom = normalizePersonName(row.forWhom || 'Self')
        const details = row.details || 'Expense Item'

        const isDup = existingExpenses.some((e) => {
          const eDate = (e.date || '').split('T')[0]
          const eAmt = parseFloat(e.amount) || 0
          const eCat = (e.category || '').toLowerCase().trim()
          const eWhom = (e.forWhom || '').toLowerCase().trim()
          return (
            eDate === dateStr &&
            Math.abs(eAmt - rawAmt) < 0.01 &&
            (eCat === category.toLowerCase().trim() || eWhom === forWhom.toLowerCase().trim())
          )
        })

        if (isDup) duplicateCount++

        items.push({
          id: 'import_' + idx + '_' + Date.now(),
          selected: !isDup,
          isDuplicate: isDup,
          date: dateStr,
          amount: rawAmt,
          category,
          forWhom,
          details,
          paymentMode: row.paymentMode || 'Cash',
          remarks: row.remarks || '',
        })
      })
    } else if (mode === 'bank') {
      rawList.forEach((row, idx) => {
        const debit = parseFloat(row.debit || 0) || 0
        const credit = parseFloat(row.credit || 0) || 0
        const rawAmt = parseFloat(row.amount || debit || credit || 0)

        let dateStr = new Date().toISOString().split('T')[0]
        if (row.date) {
          const parsed = new Date(row.date)
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const bank = row.bank || 'Bank'
        const description = row.description || row.narration || row.particulars || 'Bank Transaction'

        items.push({
          id: 'import_bank_' + idx + '_' + Date.now(),
          selected: true,
          isDuplicate: false,
          date: dateStr,
          bank,
          description,
          debit,
          credit,
          amount: rawAmt,
          balance: parseFloat(row.balance || 0) || 0,
        })
      })
    } else {
      // Lending
      rawList.forEach((row, idx) => {
        const rawAmt = parseFloat(row.amount || 0)
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = new Date().toISOString().split('T')[0]
        if (row.date) {
          const parsed = new Date(row.date)
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const person = normalizePersonName(row.person || 'Person')
        const type = (row.type || '').toLowerCase().includes('borrow') ? 'Borrowed' : 'Lent'
        const isSettled = Boolean(row.isSettled)

        const isDup = existingLending.some((l) => {
          const lDate = (l.date || '').split('T')[0]
          const lAmt = parseFloat(l.amount) || 0
          const lPerson = (l.person || '').toLowerCase().trim()
          return (
            lDate === dateStr &&
            Math.abs(lAmt - rawAmt) < 0.01 &&
            lPerson === person.toLowerCase().trim()
          )
        })

        if (isDup) duplicateCount++

        items.push({
          id: 'import_lend_' + idx + '_' + Date.now(),
          selected: !isDup,
          isDuplicate: isDup,
          date: dateStr,
          amount: rawAmt,
          person,
          type,
          remarks: row.remarks || '',
          isSettled,
        })
      })
    }

    if (items.length === 0) {
      setError('⚠️ No valid transactions extracted from document. Please verify the file content and try again.')
      setAiParsing(false)
      return
    }

    const previewObj = { items, duplicateCount }
    setCsvPreviewData(previewObj)
    importTaskQueue.saveDraftPreview(mode, previewObj)
  }

  function parseCsvLine(line) {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  function findCol(headers, candidates) {
    const lcHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
    for (const cand of candidates) {
      const lcCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '')
      const idx = lcHeaders.findIndex((h) => h.includes(lcCand) || lcCand.includes(h))
      if (idx !== -1) return idx
    }
    return -1
  }

  function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      throw new Error('CSV file must contain a header row and at least 1 data row.')
    }

    const headers = parseCsvLine(lines[0])
    const rows = lines.slice(1).map(parseCsvLine)

    const dateIdx = findCol(headers, ['date', 'txn date', 'transaction date', 'time', 'day'])
    const amountIdx = findCol(headers, ['amount', 'price', 'cost', 'rupees', 'rs', 'sum', 'val', 'debit', 'credit'])

    if (amountIdx === -1 && mode !== 'bank') {
      throw new Error('Could not detect "Amount" column in CSV file.')
    }

    const items = []
    let duplicateCount = 0

    if (mode === 'expense') {
      const catIdx = findCol(headers, ['category', 'cat', 'head', 'type'])
      const whomIdx = findCol(headers, ['forwhom', 'whom', 'for whom', 'user', 'member', 'person'])
      const detailsIdx = findCol(headers, ['details', 'item', 'description', 'desc', 'particulars', 'title'])
      const modeIdx = findCol(headers, ['paymentmode', 'mode', 'payment mode', 'method', 'via'])
      const remarksIdx = findCol(headers, ['remarks', 'remark', 'note', 'comment'])

      rows.forEach((row, idx) => {
        const rawAmt = parseFloat((row[amountIdx] || '0').replace(/[^0-9.]/g, ''))
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = new Date().toISOString().split('T')[0]
        if (dateIdx !== -1 && row[dateIdx]) {
          const parsed = new Date(row[dateIdx])
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const category = catIdx !== -1 ? (row[catIdx] || 'General') : 'General'
        const forWhom = normalizePersonName(whomIdx !== -1 ? (row[whomIdx] || 'Self') : 'Self')
        const details = detailsIdx !== -1 ? (row[detailsIdx] || 'Expense Item') : 'Expense Item'

        // Check if matching duplicate exists in existing user expenses
        const isDup = existingExpenses.some((e) => {
          const eDate = (e.date || '').split('T')[0]
          const eAmt = parseFloat(e.amount) || 0
          const eCat = (e.category || '').toLowerCase().trim()
          const eWhom = (e.forWhom || '').toLowerCase().trim()

          return (
            eDate === dateStr &&
            Math.abs(eAmt - rawAmt) < 0.01 &&
            (eCat === category.toLowerCase().trim() || eWhom === forWhom.toLowerCase().trim())
          )
        })

        if (isDup) duplicateCount++

        items.push({
          id: 'import_' + idx + '_' + Date.now(),
          selected: !isDup, // Auto-uncheck duplicates by default!
          isDuplicate: isDup,
          date: dateStr,
          amount: rawAmt,
          category,
          forWhom,
          details,
          paymentMode: modeIdx !== -1 ? (row[modeIdx] || 'Cash') : 'Cash',
          remarks: remarksIdx !== -1 ? (row[remarksIdx] || '') : '',
        })
      })
    } else if (mode === 'bank') {
      const bankIdx = findCol(headers, ['bank', 'bankname', 'account', 'institution'])
      const descIdx = findCol(headers, ['description', 'desc', 'particulars', 'narration', 'details', 'memo', 'title'])
      const debitIdx = findCol(headers, ['debit', 'withdrawal', 'out', 'dr', 'debitamount'])
      const creditIdx = findCol(headers, ['credit', 'deposit', 'in', 'cr', 'creditamount'])
      const balanceIdx = findCol(headers, ['balance', 'bal', 'closingbalance', 'total'])
      const amtIdx = findCol(headers, ['amount', 'price', 'sum', 'val'])

      rows.forEach((row, idx) => {
        const debit = debitIdx !== -1 ? parseFloat((row[debitIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0
        const credit = creditIdx !== -1 ? parseFloat((row[creditIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0
        let rawAmt = amtIdx !== -1 ? parseFloat((row[amtIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : (debit || credit)
        if (!rawAmt && !debit && !credit) return

        let dateStr = new Date().toISOString().split('T')[0]
        if (dateIdx !== -1 && row[dateIdx]) {
          const parsed = new Date(row[dateIdx])
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const bank = bankIdx !== -1 ? (row[bankIdx] || 'Bank') : 'Bank'
        const description = descIdx !== -1 ? (row[descIdx] || 'Bank Transaction') : 'Bank Transaction'
        const balance = balanceIdx !== -1 ? parseFloat((row[balanceIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0

        items.push({
          id: 'import_bank_' + idx + '_' + Date.now(),
          selected: true,
          isDuplicate: false,
          date: dateStr,
          bank,
          description,
          debit,
          credit,
          amount: rawAmt,
          balance,
        })
      })
    } else {
      // Lending mode
      const personIdx = findCol(headers, ['person', 'name', 'party', 'contact', 'forwhom', 'borrower', 'lender'])
      const typeIdx = findCol(headers, ['type', 'transactiontype', 'action', 'giveget', 'lendborrow'])
      const remarksIdx = findCol(headers, ['remarks', 'remark', 'note', 'details', 'comment', 'description'])
      const statusIdx = findCol(headers, ['status', 'state', 'settled', 'issettled'])

      rows.forEach((row, idx) => {
        const rawAmt = parseFloat((row[amountIdx] || '0').replace(/[^0-9.]/g, ''))
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = new Date().toISOString().split('T')[0]
        if (dateIdx !== -1 && row[dateIdx]) {
          const parsed = new Date(row[dateIdx])
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().split('T')[0]
          }
        }

        const person = normalizePersonName(personIdx !== -1 ? (row[personIdx] || 'Person') : 'Person')
        const rawType = typeIdx !== -1 ? (row[typeIdx] || '').toLowerCase() : ''
        const type = (rawType.includes('borrow') || rawType.includes('took') || rawType.includes('get')) ? 'Borrowed' : 'Lent'
        const rawStatus = statusIdx !== -1 ? (row[statusIdx] || '').toLowerCase() : ''
        const isSettled = rawStatus.includes('settle') || rawStatus.includes('done') || rawStatus.includes('paid')

        // Check duplicate
        const isDup = existingLending.some((l) => {
          const lDate = (l.date || '').split('T')[0]
          const lAmt = parseFloat(l.amount) || 0
          const lPerson = (l.person || '').toLowerCase().trim()

          return (
            lDate === dateStr &&
            Math.abs(lAmt - rawAmt) < 0.01 &&
            lPerson === person.toLowerCase().trim()
          )
        })

        if (isDup) duplicateCount++

        items.push({
          id: 'import_lend_' + idx + '_' + Date.now(),
          selected: !isDup, // Auto-uncheck duplicates by default!
          isDuplicate: isDup,
          date: dateStr,
          amount: rawAmt,
          person,
          type,
          remarks: remarksIdx !== -1 ? (row[remarksIdx] || '') : '',
          isSettled,
        })
      })
    }

    if (items.length === 0) {
      throw new Error('No valid records found in CSV file.')
    }

    setCsvPreviewData({ items, duplicateCount })
  }

  function toggleSelectAll(val) {
    if (!csvPreviewData) return
    setCsvPreviewData({
      ...csvPreviewData,
      items: csvPreviewData.items.map((i) => ({ ...i, selected: val })),
    })
  }

  function toggleItem(id) {
    if (!csvPreviewData) return
    setCsvPreviewData({
      ...csvPreviewData,
      items: csvPreviewData.items.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    })
  }

  async function handleConfirmImport() {
    if (!csvPreviewData) return
    const selectedItems = csvPreviewData.items.filter((i) => i.selected)

    if (selectedItems.length === 0) {
      setError('Please select at least 1 record to import.')
      return
    }

    const limitCheck = checkCsvRateLimit(isAdmin)
    if (!limitCheck.allowed) {
      setError(limitCheck.reason)
      return
    }

    setImporting(true)
    setError('')
    const batchId = 'batch_' + mode + '_' + Date.now()

    importTaskQueue.startBatchCommitTask({
      mode,
      count: selectedItems.length,
      commitFn: async (updateProgress) => {
        const createdDocIds = []
        let idx = 0
        const currentUid = auth?.currentUser?.uid || ''
        if (mode === 'bank') {
          updateProgress(50, `Saving bank statement (${selectedItems.length} transactions) into 1 batched document...`)
          const bankName = selectedItems[0]?.bank || 'Bank'
          const res = await saveBankTransactionsBatch(currentUid, selectedItems, bankName)
          if (res?.docCount) {
            createdDocIds.push(`batch_bank_${Date.now()}`)
          }
        } else if (mode === 'expense') {
          updateProgress(50, `Saving ${selectedItems.length} expenses into 1 batched document...`)
          const res = await saveExpensesBatch(currentUid, selectedItems)
          if (res?.docCount) {
            createdDocIds.push(`batch_exp_${Date.now()}`)
          }
        } else {
          updateProgress(50, `Saving ${selectedItems.length} lend/borrow records into 1 batched document...`)
          const res = await saveLendingBatch(currentUid, selectedItems)
          if (res?.docCount) {
            createdDocIds.push(`batch_lend_${Date.now()}`)
          }
        }

        // Record successful CSV import timestamp
        recordCsvImportSuccess()
        setCsvStats(getCsvImportStats())

        // Save batch into local import history
        const newBatchEntry = {
          batchId,
          mode,
          count: createdDocIds.length,
          date: new Date().toISOString(),
          docIds: createdDocIds,
        }

        const updatedHistory = [newBatchEntry, ...importHistory]
        setImportHistory(updatedHistory)
        localStorage.setItem('wv_import_history', JSON.stringify(updatedHistory))

        setSuccessInfo({
          message: `🎉 Successfully imported ${createdDocIds.length} ${mode === 'expense' ? 'expense' : 'lend/borrow'} record(s)!`,
          batchId,
          docIds: createdDocIds,
          mode,
          count: createdDocIds.length,
        })

        setCsvPreviewData(null)
        onImportComplete?.()
        return createdDocIds
      },
    })
  }

  async function handleUndoBatch(batchToUndo) {
    if (!batchToUndo || !batchToUndo.docIds?.length) return

    setUndoingBatchId(batchToUndo.batchId)
    setError('')

    try {
      if (batchToUndo.mode === 'expense') {
        for (const id of batchToUndo.docIds) {
          await deleteExpense(id)
        }
      } else {
        for (const id of batchToUndo.docIds) {
          await deleteLending(id)
        }
      }

      // Remove from history
      const filtered = importHistory.filter((h) => h.batchId !== batchToUndo.batchId)
      setImportHistory(filtered)
      localStorage.setItem('wv_import_history', JSON.stringify(filtered))

      if (successInfo?.batchId === batchToUndo.batchId) {
        setSuccessInfo(null)
      }

      setError('')
      alert(`↩️ Successfully undone bulk import! Removed ${batchToUndo.docIds.length} document(s) from Firebase.`)
      onImportComplete?.()
    } catch (err) {
      setError('Failed to undo import: ' + (err?.message || 'Error'))
    } finally {
      setUndoingBatchId(null)
    }
  }

  const selectedCount = csvPreviewData ? csvPreviewData.items.filter((i) => i.selected).length : 0
  const allSelected = csvPreviewData && csvPreviewData.items.length > 0 && csvPreviewData.items.every((i) => i.selected)

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 140 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          maxWidth: 540,
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 14,
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '8px 12px 6px', color: '#fff', position: 'relative' }}>
          <button className="modal-close" style={{ position: 'absolute', top: 8, right: 10, background: 'rgba(255,255,255,0.15)', color: '#fff', width: 24, height: 24, fontSize: 10, borderRadius: '50%', border: 'none', cursor: 'pointer' }} onClick={onClose}>
            <i className="fas fa-times" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              📥
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                {csvPreviewData ? 'CSV Import Preview' : 'Import CSV Data'}
              </h3>
              <p style={{ margin: '1px 0 0', fontSize: 9.5, color: '#a5b4fc' }}>
                Bulk import entries with duplicate detection & 1-click Undo
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          {!csvPreviewData && (
            <div style={{ display: 'flex', gap: 3, marginTop: 6, background: 'rgba(0,0,0,0.3)', padding: 2, borderRadius: 6 }}>
              <button
                type="button"
                onClick={() => setMode('expense')}
                style={{
                  flex: 1, padding: '4px 6px', borderRadius: 4, border: 'none',
                  background: mode === 'expense' ? '#ffffff' : 'transparent',
                  color: mode === 'expense' ? '#312e81' : '#cbd5e1',
                  fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                💸 Expenses
              </button>
              <button
                type="button"
                onClick={() => setMode('lending')}
                style={{
                  flex: 1, padding: '4px 6px', borderRadius: 4, border: 'none',
                  background: mode === 'lending' ? '#ffffff' : 'transparent',
                  color: mode === 'lending' ? '#312e81' : '#cbd5e1',
                  fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🤝 Lend/Borrow
              </button>
              <button
                type="button"
                onClick={() => setMode('bank')}
                style={{
                  flex: 1, padding: '6px 6px', borderRadius: 6, border: 'none',
                  background: mode === 'bank' ? '#ffffff' : 'transparent',
                  color: mode === 'bank' ? '#312e81' : '#cbd5e1',
                  fontSize: 10, fontWeight: 800, cursor: 'pointer',
                }}
              >
                🏦 Bank PDF/CSV
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 14, flex: 1 }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} /> {error}
            </div>
          )}

          {/* Success Banner + Immediate Undo Option */}
          {successInfo && (
            <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', marginBottom: 4 }}>
                {successInfo.message}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 10.5, color: '#64748b' }}>
                All records have been saved to your cloud database. If you imported by mistake, you can undo this batch now:
              </p>
              <button
                type="button"
                onClick={() => handleUndoBatch(successInfo)}
                disabled={undoingBatchId === successInfo.batchId}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11, fontWeight: 800,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                {undoingBatchId === successInfo.batchId ? <><i className="fas fa-spinner fa-spin" /> Undoing...</> : <><i className="fas fa-undo" /> ↩️ Undo This Import Batch</>}
              </button>
            </div>
          )}

          {!csvPreviewData ? (
            <div>
              <div style={{ textAlign: 'center', padding: '18px 14px', background: 'var(--bg-subtle, #f8fafc)', border: '1.5px dashed var(--border-color, #cbd5e1)', borderRadius: 12 }}>
                {aiParsing ? (
                  <div style={{ padding: '16px 10px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20 }}>
                      <i className="fas fa-brain fa-spin" />
                    </div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                      {aiProgress.status || 'Analyzing PDF Statement with Gemini AI...'}
                    </h4>
                    <p style={{ margin: '0 0 14px', fontSize: 10.5, color: '#64748b' }}>
                      Extracting transactions, dates, and amounts from your PDF document
                    </p>

                    {/* Animated Progress Bar */}
                    <div style={{ width: '82%', height: 7, background: '#e2e8f0', borderRadius: 99, margin: '0 auto', overflow: 'hidden', position: 'relative' }}>
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
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', marginTop: 6 }}>
                      {aiProgress.percent || 15}% Completed
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
                      <i className="fas fa-file-csv" style={{ fontSize: 22, color: '#6366f1' }} />
                      <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 800 }}>/</span>
                      <i className="fas fa-file-pdf" style={{ fontSize: 22, color: '#ef4444' }} />
                    </div>
                    <h4 style={{ margin: '0 0 3px', fontSize: 12, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                      Select {mode === 'expense' ? 'Expenses' : (mode === 'lending' ? 'Lend/Borrow' : 'Bank')} Document, Receipt, PDF, Word, Excel, Text or CSV
                    </h4>
                    <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748b' }}>
                      Upload any PDF statement, Word document, Excel spreadsheet, Text file, Receipt Image, or CSV (Max 10 MB limit)
                    </p>

                    {/* CSV Import Limit Info Badge */}
                    <div style={{ margin: '0 auto 10px', padding: '4px 8px', borderRadius: 6, background: isAdmin ? 'rgba(99,102,241,0.08)' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'), border: `1px solid ${isAdmin ? 'rgba(99,102,241,0.2)' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)')}`, display: 'inline-block', fontSize: 9.5, fontWeight: 700, color: isAdmin ? '#6366f1' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? '#ef4444' : '#059669') }}>
                      {isAdmin ? (
                        <>👑 <strong>Admin Mode:</strong> Unlimited CSV Imports</>
                      ) : (
                        <>📊 <strong>CSV Limit:</strong> 3/day & 3/month (Used <strong>{csvStats.todayCount}/3</strong> today • <strong>{csvStats.monthCount}/3</strong> this month)</>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => downloadCsvTemplate()}
                        style={{
                          padding: '6px 10px', background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                          border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, fontSize: 10,
                          fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                        }}
                      >
                        <i className="fas fa-download" /> Download Template
                      </button>

                      <label
                        style={{
                          padding: '6px 12px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#fff', borderRadius: 6, fontSize: 10, fontWeight: 700,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <i className="fas fa-file-upload" /> Upload File / Document (Max 10MB)
                        <input type="file" accept=".pdf,.csv,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* Previously AI-Converted Statements (Local Device Cache) */}
              {cachedStatements && cachedStatements.length > 0 && (
                <div style={{ marginTop: 12, background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📋 Previously AI-Converted Statements</span>
                      <span style={{ fontSize: 9.5, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                        {cachedStatements.length} saved
                      </span>
                    </div>
                    <div style={{ fontSize: 9.5, color: '#64748b' }}>
                      Zero AI credits &amp; zero Firebase usage
                    </div>
                  </div>

                  <div className="custom-scrollbar" style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cachedStatements.map((c) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-card, #ffffff)', borderRadius: 8, border: '1px solid var(--border-color, #e2e8f0)' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📄 {c.fileName}
                          </div>
                          <div style={{ fontSize: 9.5, color: '#64748b' }}>
                            {new Date(c.convertedDate).toLocaleDateString('en-IN')} • {c.recordCount} records ({c.mode})
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => downloadConvertedCsv(c.items, c.fileName, c.mode || mode)}
                            style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                            title="Download CSV file to phone"
                          >
                            <i className="fas fa-download" style={{ fontSize: 9 }} /> CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                processExtractedItems(c.items)
                              } catch (err) {
                                setError('Failed to load cached statement: ' + err?.message)
                              }
                            }}
                            style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#6366f1', color: '#fff', fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                            title="Instantly re-import transactions without AI"
                          >
                            <i className="fas fa-bolt" style={{ fontSize: 9 }} /> Re-Import
                          </button>
                          <button
                            type="button"
                            onClick={() => setCachedStatements(deleteCachedConvertedStatement(c.id))}
                            style={{ padding: '3px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 10, cursor: 'pointer' }}
                            title="Remove from local device cache"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importHistory.length > 0 && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 12 }}>
                  <div
                    onClick={() => setShowHistory((s) => !s)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}
                  >
                    <span><i className="fas fa-history" style={{ color: '#6366f1', marginRight: 6 }} /> Recent CSV Imports ({importHistory.length})</span>
                    <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: 10 }} />
                  </div>

                  {showHistory && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }} className="custom-scrollbar">
                      {importHistory.map((batch) => (
                        <div
                          key={batch.batchId}
                          style={{
                            padding: '8px 10px', borderRadius: 8, background: 'var(--bg-subtle, #f8fafc)',
                            border: '1px solid var(--border-color, #e2e8f0)', display: 'flex',
                            justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                              {batch.mode === 'expense' ? '💸 Expenses' : '🤝 Lend/Borrow'} Batch ({batch.count} records)
                            </div>
                            <div style={{ fontSize: 9.5, color: '#64748b' }}>
                              {new Date(batch.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUndoBatch(batch)}
                            disabled={undoingBatchId === batch.batchId}
                            style={{
                              padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                              background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 10, fontWeight: 800,
                              cursor: undoingBatchId === batch.batchId ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {undoingBatchId === batch.batchId ? 'Undoing...' : '↩️ Undo Import'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Intelligent Duplicate Warning Banner */}
              {csvPreviewData.duplicateCount > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#d97706', fontSize: 10.5, fontWeight: 700, marginBottom: 10 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
                  Detected {csvPreviewData.duplicateCount} duplicate record(s) matching your existing data — auto-unchecked by default to prevent duplicates!
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer', color: 'var(--text-primary, #1e293b)' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    style={{ accentColor: '#6366f1', width: 15, height: 15 }}
                  />
                  Select All ({selectedCount} / {csvPreviewData.items.length})
                </label>
                <button
                  type="button"
                  onClick={() => setCsvPreviewData(null)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  ✕ Change File
                </button>
              </div>

              {/* Preview List */}
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }} className="custom-scrollbar">
                {csvPreviewData.items.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    style={{
                      padding: '8px 10px', borderRadius: 8,
                      border: item.selected ? '1.5px solid #6366f1' : '1px solid var(--border-color, #e2e8f0)',
                      background: item.isDuplicate ? 'rgba(245,158,11,0.06)' : (item.selected ? 'rgba(99,102,241,0.04)' : 'var(--bg-subtle, #f8fafc)'),
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => {}}
                      style={{ accentColor: '#6366f1', width: 15, height: 15 }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 9, fontWeight: 900, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                            Sl. {idx + 1}
                          </span>
                          {mode === 'expense' ? item.category : mode === 'bank' ? (item.bank || 'Bank') : item.person}
                          {item.isDuplicate && (
                            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#d97706', background: 'rgba(245,158,11,0.15)', padding: '2px 6px', borderRadius: 99, border: '1px solid rgba(245,158,11,0.3)' }}>
                              ⚠️ Duplicate (Unchecked)
                            </span>
                          )}
                        </span>
                        <span>₹{item.amount || item.debit || item.credit || 0}</span>
                      </div>
                      <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>📅 {item.date}</span>
                        {mode === 'expense' && <span>👤 {item.forWhom}</span>}
                        {mode === 'lending' && <span>🔄 {item.type}</span>}
                        {mode === 'bank' && (
                          <>
                            {item.description && <span>📝 {item.description}</span>}
                            {item.debit > 0 && <span style={{ color: '#ef4444' }}>🔻 Debit: ₹{item.debit}</span>}
                            {item.credit > 0 && <span style={{ color: '#10b981' }}>🟢 Credit: ₹{item.credit}</span>}
                            {item.balance > 0 && <span>🏦 Bal: ₹{item.balance}</span>}
                          </>
                        )}
                        {item.remarks && <span>💬 {item.remarks}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Confirm Import Action */}
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || selectedCount === 0}
                style={{
                  width: '100%', padding: 11, background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800,
                  cursor: importing || selectedCount === 0 ? 'not-allowed' : 'pointer',
                  marginTop: 12, boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                }}
              >
                {importing ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} /> Importing Records...</> : <><i className="fas fa-file-import" style={{ marginRight: 6 }} /> Import {selectedCount} Selected Record(s)</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
