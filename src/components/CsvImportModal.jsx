import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '../firebase'
import { addExpense, deleteExpense, getAllExpenses, saveExpensesBatch } from '../api/expenses'
import { addLending, deleteLending, getAllLending, saveLendingBatch } from '../api/lending'
import { saveBankTransactionsBatch, fetchBankTransactionsFromFirestore } from '../api/bankTransactions'
import { loadSnapshot } from '../api/localCache'
import { importTaskQueue } from '../api/importTaskQueue'
import {
  MAX_PDF_SIZE_BYTES,
  getCachedConvertedStatements, deleteCachedConvertedStatement, downloadConvertedCsv
} from '../api/pdfExtractor'
import { checkCsvRateLimit, recordCsvImportSuccess, getCsvImportStats } from '../api/csvRateLimit'
import { normalizePersonName } from '../api/entityNormalizer'
import { normalizeBankDescription } from '../utils/bankDescriptionNormalizer'
import { showAlert } from './CustomDialogModal'

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
  const [existingBank, setExistingBank] = useState([])
  
  // Import History & Undo State
  const [showHistory, setShowHistory] = useState(false)
  const [importHistory, setImportHistory] = useState([])
  const [undoingBatchId, setUndoingBatchId] = useState(null)

  // Subscribe to background importTaskQueue for real-time updates across modal closes
  useEffect(() => {
    const unsubscribe = importTaskQueue.subscribe((task) => {
      if (task && (task.mode === mode || task.mode === 'expense' || task.mode === 'lending' || task.mode === 'bank')) {
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
  }, [mode, existingExpenses, existingLending, existingBank])

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
        const cachedBank = loadSnapshot('bank') || []
        setExistingExpenses(cachedExp)
        setExistingLending(cachedLend)
        setExistingBank(cachedBank)

        const exps = await getAllExpenses()
        if (exps?.length) setExistingExpenses(exps)

        const lends = await getAllLending()
        if (lends?.length) setExistingLending(lends)

        const bankTxns = await fetchBankTransactionsFromFirestore(auth?.currentUser?.uid || '')
        if (bankTxns?.length) setExistingBank(bankTxns)
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

function toLocalYMD(d) {
  if (!d) return ''
  if (typeof d === 'string') {
    const s = d.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear()
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  }
  const dt = d instanceof Date ? d : (typeof d?.toDate === 'function' ? d.toDate() : new Date(d))
  if (isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function extractRefNumbers(str) {
  if (!str) return []
  return (String(str).match(/\b\d{5,18}\b/g) || [])
}

function extractTxnId(obj) {
  if (!obj) return ''
  if (obj.txnId) return String(obj.txnId).trim()
  if (obj.transactionId) return String(obj.transactionId).trim()
  if (obj.refNo) return String(obj.refNo).trim()
  if (obj.referenceNo) return String(obj.referenceNo).trim()
  return ''
}

/**
 * Exact Bank Duplicate Decision Engine
 * 1. DR/CR & Amount MUST match (different amount = 100% UNIQUE!).
 * 2. Date MUST match or be within 1 day max.
 * 3. If Transaction ID / Reference Number / RRN exists on both records:
 *    - If they match -> DUPLICATE (true)
 *    - If DIFFERENT -> 100% UNIQUE / DIFFERENT (false)
 * 4. Merchant comparison.
 */
function isBankDuplicateCheck(cand, existing) {
  // Step 1: DR / CR match check
  const cDebit = parseFloat(cand.debit || 0) || 0
  const cCredit = parseFloat(cand.credit || 0) || 0
  const cAmt = parseFloat(cand.amount || cDebit || cCredit || 0) || 0
  const cIsDebit = cDebit > 0 || (cand.type && String(cand.type).toLowerCase().includes('debit'))

  const eDebit = parseFloat(existing.debit || 0) || 0
  const eCredit = parseFloat(existing.credit || 0) || 0
  const eAmt = parseFloat(existing.amount || eDebit || eCredit || 0) || 0
  const eIsDebit = eDebit > 0 || (existing.type && String(existing.type).toLowerCase().includes('debit'))

  if (cIsDebit !== eIsDebit) return false

  // Step 2: Amount MUST match (different amount = 100% UNIQUE!)
  if (Math.abs(cAmt - eAmt) >= 0.01) return false

  // Step 3: Date MUST match (or within 1 day max)
  const cDateStr = toLocalYMD(cand.date || cand.dateObj)
  const eDateStr = toLocalYMD(existing.date || existing.dateObj)
  if (!cDateStr || !eDateStr) return false

  const cDateObj = new Date(cDateStr)
  const eDateObj = new Date(eDateStr)
  if (isNaN(cDateObj.getTime()) || isNaN(eDateObj.getTime())) return false

  const diffDays = Math.abs(cDateObj - eDateObj) / (1000 * 60 * 60 * 24)
  if (diffDays > 1) return false

  // Step 4: Descriptions & Transaction ID / Reference Number / RRN Rule
  const candRawDesc = String(cand.description || cand.narration || cand.details || '').trim()
  const existRawDesc = String(existing.description || existing.narration || existing.details || '').trim()

  const normCand = normalizeBankDescription(candRawDesc, cAmt, cDateStr)
  const normExist = normalizeBankDescription(existRawDesc, eAmt, eDateStr)

  const candId = extractTxnId(cand) || cand.refNo || cand.rrn || normCand.reference
  const existId = extractTxnId(existing) || existing.refNo || existing.rrn || normExist.reference

  // 4a. If BOTH have a Transaction ID / Ref Number / RRN:
  if (candId && existId) {
    if (candId !== existId) return false // Different Txn ID/RRN -> 100% UNIQUE!
    return true // Same Txn ID/RRN -> DUPLICATE!
  }

  // 4b. If ONE has a specific Txn ID / RRN and the other does not (e.g. UPI/619536337209 vs "Transaction"):
  if ((candId && !existId) || (!candId && existId)) {
    // If descriptions differ, they are 100% UNIQUE!
    if (candRawDesc.toLowerCase() !== existRawDesc.toLowerCase()) {
      return false
    }
  }

  // Step 5: Description & Merchant comparison
  const cMerchant = (normCand.merchant || candRawDesc).toLowerCase().trim()
  const eMerchant = (normExist.merchant || existRawDesc).toLowerCase().trim()

  if (cMerchant && eMerchant) {
    if (cMerchant !== eMerchant) {
      const cWords = cMerchant.split(/\s+/).filter((w) => w.length > 2)
      const eWords = eMerchant.split(/\s+/).filter((w) => w.length > 2)
      if (cWords.length > 0 && eWords.length > 0) {
        const match = cWords.some((w) => eWords.includes(w))
        if (!match) return false // Completely different merchant names -> 100% UNIQUE!
      } else {
        return false // Different descriptions -> 100% UNIQUE!
      }
    }
  } else if (candRawDesc.toLowerCase() !== existRawDesc.toLowerCase()) {
    return false // Different raw descriptions -> 100% UNIQUE!
  }

  return true
}

function isExpenseDuplicateCheck(cand, existing) {
  const cDate = toLocalYMD(cand.date)
  const cAmt = parseFloat(cand.amount || 0) || 0
  const cCat = (cand.category || '').toLowerCase().trim()
  const cWhom = (cand.forWhom || '').toLowerCase().trim()

  const eDate = toLocalYMD(existing.dateObj || existing.date)
  const eAmt = parseFloat(existing.amount || 0) || 0
  const eCat = (existing.category || '').toLowerCase().trim()
  const eWhom = (existing.forWhom || '').toLowerCase().trim()

  if (Math.abs(cAmt - eAmt) >= 0.01) return false
  if (cDate !== eDate) return false
  if (!cCat || !eCat || cCat === eCat || cWhom === eWhom) return true

  return true
}

function isLendingDuplicateCheck(cand, existing) {
  const cDate = toLocalYMD(cand.date)
  const cAmt = parseFloat(cand.amount || 0) || 0
  const cPerson = (cand.person || '').toLowerCase().trim()

  const eDate = toLocalYMD(existing.dateObj || existing.date)
  const eAmt = parseFloat(existing.amount || 0) || 0
  const ePerson = (existing.person || '').toLowerCase().trim()

  if (Math.abs(cAmt - eAmt) >= 0.01) return false
  if (cDate !== eDate) return false
  if (cPerson === ePerson) return true

  return false
}

  function processExtractedItems(rawList, targetMode = null) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error('No valid transactions found in statement.')
    }

    const activeMode = targetMode || mode
    const items = []
    let duplicateCount = 0
    const seenKeys = new Set()

    if (activeMode === 'expense') {
      rawList.forEach((row, idx) => {
        const rawAmt = parseFloat(row.amount || 0)
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = toLocalYMD(row.date) || new Date().toISOString().split('T')[0]
        const category = row.category || 'General'
        const forWhom = normalizePersonName(row.forWhom || 'Self')
        const details = row.details || 'Expense Item'

        const rowKey = `${dateStr}_${rawAmt}_${category.toLowerCase().trim()}_${forWhom.toLowerCase().trim()}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const isDbDup = existingExpenses.some((e) => isExpenseDuplicateCheck({ date: dateStr, amount: rawAmt, category, forWhom, details }, e))
        const isDup = isIntraDup || isDbDup
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
    } else if (activeMode === 'bank') {
      rawList.forEach((row, idx) => {
        const debit = parseFloat(row.debit || 0) || 0
        const credit = parseFloat(row.credit || 0) || 0
        const rawAmt = parseFloat(row.amount || debit || credit || 0)

        let dateStr = toLocalYMD(row.date) || new Date().toISOString().split('T')[0]
        const bank = row.bank || 'Bank'
        const description = row.description || row.narration || row.particulars || 'Bank Transaction'

        const refNums = extractRefNumbers(description)
        const refKey = refNums.length > 0 ? refNums.join('_') : description.toLowerCase().trim()
        const rowKey = `${dateStr}_${rawAmt}_${debit}_${credit}_${refKey}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const cand = { date: dateStr, amount: rawAmt, debit, credit, description, bank }
        const isDbDup = existingBank.some((b) => isBankDuplicateCheck(cand, b))
        const isDup = isIntraDup || isDbDup
        if (isDup) duplicateCount++

        items.push({
          id: 'import_bank_' + idx + '_' + Date.now(),
          selected: !isDup,
          isDuplicate: isDup,
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

        let dateStr = toLocalYMD(row.date) || new Date().toISOString().split('T')[0]
        const person = normalizePersonName(row.person || 'Person')
        const type = (row.type || '').toLowerCase().includes('borrow') ? 'Borrowed' : 'Lent'
        const isSettled = Boolean(row.isSettled)

        const rowKey = `${dateStr}_${rawAmt}_${person.toLowerCase().trim()}_${type}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const cand = { date: dateStr, amount: rawAmt, person, type }
        const isDbDup = existingLending.some((l) => isLendingDuplicateCheck(cand, l))
        const isDup = isIntraDup || isDbDup
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

      const seenKeys = new Set()

      rows.forEach((row, idx) => {
        const rawAmt = parseFloat((row[amountIdx] || '0').replace(/[^0-9.]/g, ''))
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = toLocalYMD(dateIdx !== -1 ? row[dateIdx] : null) || new Date().toISOString().split('T')[0]
        const category = catIdx !== -1 ? (row[catIdx] || 'General') : 'General'
        const forWhom = normalizePersonName(whomIdx !== -1 ? (row[whomIdx] || 'Self') : 'Self')
        const details = detailsIdx !== -1 ? (row[detailsIdx] || 'Expense Item') : 'Expense Item'

        const rowKey = `${dateStr}_${rawAmt}_${category.toLowerCase().trim()}_${forWhom.toLowerCase().trim()}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const isDbDup = existingExpenses.some((e) => isExpenseDuplicateCheck({ date: dateStr, amount: rawAmt, category, forWhom, details }, e))
        const isDup = isIntraDup || isDbDup
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

      const seenKeys = new Set()

      rows.forEach((row, idx) => {
        const debit = debitIdx !== -1 ? parseFloat((row[debitIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0
        const credit = creditIdx !== -1 ? parseFloat((row[creditIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0
        let rawAmt = amtIdx !== -1 ? parseFloat((row[amtIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : (debit || credit)
        if (!rawAmt && !debit && !credit) return

        let dateStr = toLocalYMD(dateIdx !== -1 ? row[dateIdx] : null) || new Date().toISOString().split('T')[0]
        const bank = bankIdx !== -1 ? (row[bankIdx] || 'Bank') : 'Bank'
        const description = descIdx !== -1 ? (row[descIdx] || 'Bank Transaction') : 'Bank Transaction'
        const balance = balanceIdx !== -1 ? parseFloat((row[balanceIdx] || '0').replace(/[^0-9.]/g, '')) || 0 : 0

        const refNums = extractRefNumbers(description)
        const refKey = refNums.length > 0 ? refNums.join('_') : description.toLowerCase().trim()
        const rowKey = `${dateStr}_${rawAmt}_${debit}_${credit}_${refKey}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const cand = { date: dateStr, amount: rawAmt, debit, credit, description, bank }
        const isDbDup = existingBank.some((b) => isBankDuplicateCheck(cand, b))
        const isDup = isIntraDup || isDbDup
        if (isDup) duplicateCount++

        items.push({
          id: 'import_bank_' + idx + '_' + Date.now(),
          selected: !isDup,
          isDuplicate: isDup,
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

      const seenKeys = new Set()

      rows.forEach((row, idx) => {
        const rawAmt = parseFloat((row[amountIdx] || '0').replace(/[^0-9.]/g, ''))
        if (!rawAmt || isNaN(rawAmt)) return

        let dateStr = toLocalYMD(dateIdx !== -1 ? row[dateIdx] : null) || new Date().toISOString().split('T')[0]
        const person = normalizePersonName(personIdx !== -1 ? (row[personIdx] || 'Person') : 'Person')
        const rawType = typeIdx !== -1 ? (row[typeIdx] || '').toLowerCase() : ''
        const type = (rawType.includes('borrow') || rawType.includes('took') || rawType.includes('get')) ? 'Borrowed' : 'Lent'
        const rawStatus = statusIdx !== -1 ? (row[statusIdx] || '').toLowerCase() : ''
        const isSettled = rawStatus.includes('settle') || rawStatus.includes('done') || rawStatus.includes('paid')

        const rowKey = `${dateStr}_${rawAmt}_${person.toLowerCase().trim()}_${type}`
        const isIntraDup = seenKeys.has(rowKey)
        seenKeys.add(rowKey)

        const cand = { date: dateStr, amount: rawAmt, person, type }
        const isDbDup = existingLending.some((l) => isLendingDuplicateCheck(cand, l))
        const isDup = isIntraDup || isDbDup
        if (isDup) duplicateCount++

        items.push({
          id: 'import_lend_' + idx + '_' + Date.now(),
          selected: !isDup,
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
    const hasNonDuplicates = csvPreviewData.items.some((i) => !i.isDuplicate)
    setCsvPreviewData({
      ...csvPreviewData,
      items: csvPreviewData.items.map((i) => ({
        ...i,
        selected: val ? (hasNonDuplicates ? !i.isDuplicate : true) : false,
      })),
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
        importTaskQueue.clearDraftPreview(mode)
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
      await showAlert({
        title: 'Undo Import Completed',
        message: `↩️ Successfully undone bulk import! Removed ${batchToUndo.docIds.length} document(s) from Firebase.`,
        buttonText: 'OK',
        variant: 'success',
        icon: '↩️',
      })
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
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '10px 14px 8px', color: '#fff', position: 'relative' }}>
          <button className="modal-close" style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(255,255,255,0.15)', color: '#fff', width: 24, height: 24, fontSize: 10, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <i className="fas fa-times" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              📥
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, letterSpacing: -0.2 }}>
                {csvPreviewData ? 'CSV Import Preview' : 'Import Statement Data'}
              </h3>
              <p style={{ margin: '1px 0 0', fontSize: 9.5, color: '#c7d2fe', fontWeight: 500 }}>
                Bulk import entries with duplicate detection &amp; 1-click Undo
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          {!csvPreviewData && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8, background: 'rgba(0,0,0,0.25)', padding: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                onClick={() => setMode('expense')}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                  background: mode === 'expense' ? '#ffffff' : 'transparent',
                  color: mode === 'expense' ? '#312e81' : '#cbd5e1',
                  fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: mode === 'expense' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                💸 Expenses
              </button>
              <button
                type="button"
                onClick={() => setMode('lending')}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                  background: mode === 'lending' ? '#ffffff' : 'transparent',
                  color: mode === 'lending' ? '#312e81' : '#cbd5e1',
                  fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: mode === 'lending' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                🤝 Lend/Borrow
              </button>
              <button
                type="button"
                onClick={() => setMode('bank')}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                  background: mode === 'bank' ? '#ffffff' : 'transparent',
                  color: mode === 'bank' ? '#312e81' : '#cbd5e1',
                  fontSize: 10, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: mode === 'bank' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                🏦 Bank Statement
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 12, flex: 1 }}>
          {error && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 10.5, fontWeight: 700, marginBottom: 10 }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} /> {error}
            </div>
          )}

          {/* Success Banner + Immediate Undo Option */}
          {successInfo && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 2 }}>
                {successInfo.message}
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 10, color: '#64748b' }}>
                All records have been saved to your cloud database. You can undo this import anytime:
              </p>
              <button
                type="button"
                onClick={() => handleUndoBatch(successInfo)}
                disabled={undoingBatchId === successInfo.batchId}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 10, fontWeight: 800,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5
                }}
              >
                {undoingBatchId === successInfo.batchId ? <><i className="fas fa-spinner fa-spin" /> Undoing...</> : <><i className="fas fa-undo" /> ↩️ Undo Import Batch</>}
              </button>
            </div>
          )}

          {!csvPreviewData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Dropzone Card */}
              <div style={{ textAlign: 'center', padding: '14px 12px', background: 'var(--bg-subtle, #f8fafc)', border: '1.5px dashed var(--border-color, #cbd5e1)', borderRadius: 10 }}>
                {aiParsing ? (
                  <div style={{ padding: '10px 6px' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 16 }}>
                      <i className="fas fa-brain fa-spin" />
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                      {aiProgress.status || 'Analyzing Statement with Gemini AI...'}
                    </h4>
                    <p style={{ margin: '0 0 10px', fontSize: 10, color: '#64748b' }}>
                      Extracting transactions, dates, and amounts from your document
                    </p>

                    <div style={{ width: '85%', height: 6, background: '#e2e8f0', borderRadius: 99, margin: '0 auto', overflow: 'hidden' }}>
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
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
                      {aiProgress.percent || 15}% Completed
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
                      <i className="fas fa-file-csv" style={{ fontSize: 18, color: '#6366f1' }} />
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 800 }}>/</span>
                      <i className="fas fa-file-pdf" style={{ fontSize: 18, color: '#ef4444' }} />
                    </div>
                    <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}>
                      Upload {mode === 'expense' ? 'Expenses' : (mode === 'lending' ? 'Lend/Borrow' : 'Bank')} Document or CSV
                    </h4>
                    <p style={{ margin: '0 0 6px', fontSize: 9.5, color: '#64748b' }}>
                      Supports PDF, CSV, Excel, Word, Text &amp; Images (Max 10 MB limit)
                    </p>

                    {/* Limit Info Badge */}
                    <div style={{ margin: '0 auto 8px', padding: '2px 8px', borderRadius: 4, background: isAdmin ? 'rgba(99,102,241,0.08)' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)'), border: `1px solid ${isAdmin ? 'rgba(99,102,241,0.2)' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)')}`, display: 'inline-block', fontSize: 9, fontWeight: 700, color: isAdmin ? '#6366f1' : (csvStats.todayCount >= 3 || csvStats.monthCount >= 3 ? '#ef4444' : '#059669') }}>
                      {isAdmin ? (
                        <>👑 <strong>Admin:</strong> Unlimited Imports</>
                      ) : (
                        <>📊 <strong>Limit:</strong> 3/day (Used <strong>{csvStats.todayCount}/3</strong> today)</>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => downloadCsvTemplate()}
                        style={{
                          padding: '5px 10px', background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, fontSize: 9.5,
                          fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                        }}
                      >
                        <i className="fas fa-download" style={{ fontSize: 9 }} /> Template
                      </button>

                      <label
                        style={{
                          padding: '5px 12px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#fff', borderRadius: 6, fontSize: 9.5, fontWeight: 800,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          boxShadow: '0 2px 6px rgba(99,102,241,0.3)',
                        }}
                      >
                        <i className="fas fa-file-upload" style={{ fontSize: 9 }} /> Upload File (10MB)
                        <input type="file" accept=".pdf,.csv,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* Previously AI-Converted Statements (Local Device Cache) */}
              {cachedStatements && cachedStatements.length > 0 && (
                <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span>📋 AI Statement Cache</span>
                      <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 5px', borderRadius: 10, fontWeight: 700 }}>
                        {cachedStatements.length} saved
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                      ⚡ Zero AI credits used
                    </div>
                  </div>

                  <div className="custom-scrollbar" style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {cachedStatements.map((c) => (
                      <div key={c.id || c.fileName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'var(--bg-card, #ffffff)', borderRadius: 6, border: '1px solid var(--border-color, #e2e8f0)' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-primary, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📄 {c.fileName}
                          </div>
                          <div style={{ fontSize: 9, color: '#64748b' }}>
                            {new Date(c.convertedDate).toLocaleDateString('en-IN')} • {c.recordCount} records ({c.mode || mode})
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => downloadConvertedCsv(c.items, c.fileName, c.mode || mode)}
                            style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            title="Download CSV"
                          >
                            <i className="fas fa-download" style={{ fontSize: 8 }} /> CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const targetMode = c.mode || mode
                                setMode(targetMode)
                                processExtractedItems(c.items, targetMode)
                              } catch (err) {
                                setError('Failed to load statement: ' + err?.message)
                              }
                            }}
                            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                            title="Instantly re-import without AI"
                          >
                            <i className="fas fa-bolt" style={{ fontSize: 8 }} /> Re-Import
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const updated = deleteCachedConvertedStatement(c)
                              setCachedStatements([...updated])
                            }}
                            style={{ padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', color: '#ef4444', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                            title="Remove item"
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
                <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 8 }}>
                  <div
                    onClick={() => setShowHistory((s) => !s)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontSize: 10.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)' }}
                  >
                    <span><i className="fas fa-history" style={{ color: '#6366f1', marginRight: 5 }} /> Recent CSV Imports ({importHistory.length})</span>
                    <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'}`} style={{ color: '#94a3b8', fontSize: 9 }} />
                  </div>

                  {showHistory && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }} className="custom-scrollbar">
                      {importHistory.map((batch) => (
                        <div
                          key={batch.batchId}
                          style={{
                            padding: '6px 8px', borderRadius: 6, background: 'var(--bg-subtle, #f8fafc)',
                            border: '1px solid var(--border-color, #e2e8f0)', display: 'flex',
                            justifyContent: 'space-between', alignItems: 'center', fontSize: 9.5
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700, color: '#334155' }}>
                              {batch.recordCount} records ({batch.mode})
                            </span>
                            <span style={{ color: '#94a3b8', marginLeft: 6 }}>
                              {new Date(batch.importedAt).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUndoBatch(batch)}
                            disabled={undoingBatchId === batch.batchId}
                            style={{
                              padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)',
                              background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 9, fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            {undoingBatchId === batch.batchId ? 'Undoing...' : 'Undo'}
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
              {/* Restored Draft Informational Banner */}
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#4338ca', fontSize: 10, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📂 Restored previous import preview draft.</span>
                <button
                  type="button"
                  onClick={() => {
                    importTaskQueue.clearDraftPreview(mode)
                    setCsvPreviewData(null)
                  }}
                  style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #6366f1', background: '#ffffff', color: '#4338ca', fontSize: 9.5, fontWeight: 800, cursor: 'pointer' }}
                >
                  📁 Select New File
                </button>
              </div>

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
                  onClick={() => {
                    importTaskQueue.clearDraftPreview(mode)
                    setCsvPreviewData(null)
                  }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  ✕ Change / Pick New File
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
