import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '../firebase'
import { loadSnapshot } from '../api/localCache'
import { fetchBankTransactionsFromFirestore, deleteBankTransaction, deleteBankTransactionsBulk, parseSafeDate } from '../api/bankTransactions'
import { downloadBankCsvTemplate } from '../utils/csvTemplate'
import { normalizeBankDescription } from '../utils/bankDescriptionNormalizer'
import BankLinkCard from './BankLinkCard'
import { showConfirm, showAlert } from './CustomDialogModal'
import { formatUserFriendlyError } from '../utils/userFriendlyError'

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

/**
 * BankHistoryView — Inline bank transaction list with live search,
 * bank filter chips, deletion capabilities, and instant mobile-first performance.
 */
export default function BankHistoryView({ bankRecords = [], uid, isAdmin = false, allowNonCsvImport = true, subscription, appConfig, onOpenSubscriptionModal, onOpenImport, onOpenMerge }) {
  const currentUid = uid || auth?.currentUser?.uid || ''

  // Instant cache state initialization (zero loading flash on tab switch)
  const [allRecords, setAllRecords] = useState(() => {
    if (Array.isArray(bankRecords) && bankRecords.length > 0) {
      return bankRecords.map((r) => ({ ...r, date: parseSafeDate(r.dateObj || r.date) }))
    }
    const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
    if (cached && cached.length > 0) {
      return cached.map((r) => ({
        ...r,
        date: parseSafeDate(r.dateObj || r.date),
      }))
    }
    return []
  })
  const [loading, setLoading] = useState(() => allRecords.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBankFilter, setSelectedBankFilter] = useState('ALL')
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [showLlmGuideModal, setShowLlmGuideModal] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Duplicate Scanner State
  const [showDupScanner, setShowDupScanner] = useState(false)
  const [dupClusters, setDupClusters] = useState([])
  const [dupPreviewLimit, setDupPreviewLimit] = useState(30)
  const [scanningDups, setScanningDups] = useState(false)
  const [deletingDups, setDeletingDups] = useState(false)
  const [cleanSuccessMsg, setCleanSuccessMsg] = useState('')

  function scanForBankDuplicates() {
    if (!allRecords || allRecords.length < 2) {
      setError('Not enough bank transactions loaded to scan for duplicates.')
      return
    }
    setScanningDups(true)
    setError('')
    setCleanSuccessMsg('')
    setDupPreviewLimit(30)

    setTimeout(() => {
      const clusters = []
      const processed = new Set()

      const sorted = [...allRecords].sort((a, b) => {
        const dA = parseSafeDate(a.dateObj || a.date).getTime()
        const dB = parseSafeDate(b.dateObj || b.date).getTime()
        return dA - dB
      })

      for (let i = 0; i < sorted.length; i++) {
        const seed = sorted[i]
        if (!seed.id || processed.has(seed.id)) continue

        const matches = []
        for (let j = i + 1; j < sorted.length; j++) {
          const candidate = sorted[j]
          if (!candidate.id || processed.has(candidate.id)) continue

          if (isBankDuplicateCheck(seed, candidate)) {
            matches.push({ ...candidate, selected: true })
            processed.add(candidate.id)
          }
        }

        if (matches.length > 0) {
          processed.add(seed.id)
          clusters.push({
            id: `cluster_${seed.id}`,
            original: seed,
            duplicates: matches,
          })
        }
      }

      setDupClusters(clusters)
      setShowDupScanner(true)
      setScanningDups(false)

      if (clusters.length === 0) {
        setCleanSuccessMsg('✨ Clean! No duplicate bank transactions found in your history.')
      }
    }, 120)
  }

  function toggleDuplicateItem(clusterIdx, dupIdx) {
    setDupClusters((prev) => {
      const next = [...prev]
      const targetCluster = { ...next[clusterIdx] }
      const nextDups = [...targetCluster.duplicates]
      nextDups[dupIdx] = { ...nextDups[dupIdx], selected: !nextDups[dupIdx].selected }
      targetCluster.duplicates = nextDups
      next[clusterIdx] = targetCluster
      return next
    })
  }

  function toggleSelectAllDuplicates(val) {
    setDupClusters((prev) =>
      prev.map((cluster) => ({
        ...cluster,
        duplicates: cluster.duplicates.map((d) => ({ ...d, selected: val })),
      }))
    )
  }

  async function handleDeleteDuplicates() {
    const recordsToDelete = []
    dupClusters.forEach((cluster) => {
      cluster.duplicates.forEach((d) => {
        if (d.selected) recordsToDelete.push(d)
      })
    })

    if (recordsToDelete.length === 0) {
      setError('Please select at least 1 duplicate transaction to delete.')
      return
    }

    const confirmed = await showConfirm({
      title: 'Clean Duplicate Transactions',
      message: `Are you sure you want to permanently delete ${recordsToDelete.length} selected duplicate transaction(s)?`,
      confirmText: `Delete ${recordsToDelete.length} Duplicates`,
      cancelText: 'Cancel',
      variant: 'danger',
      icon: '🗑️',
    })
    if (!confirmed) return

    setDeletingDups(true)
    setError('')
    try {
      await deleteBankTransactionsBulk(recordsToDelete, currentUid)

      const deletedIds = new Set(recordsToDelete.map((r) => r.id))
      const updatedAll = (allRecords || []).filter((r) => !deletedIds.has(r.id))

      setAllRecords(updatedAll)
      saveSnapshot('bank', updatedAll, currentUid)

      setShowDupScanner(false)
      setDupClusters([])
      setCleanSuccessMsg(`🎉 Successfully cleaned up ${recordsToDelete.length} duplicate transaction(s) from your Bank History!`)
    } catch (err) {
      setError('Failed to delete duplicates: ' + (err?.message || err))
    } finally {
      setDeletingDups(false)
    }
  }

  // Sync state if bankRecords prop updates from parent
  useEffect(() => {
    if (Array.isArray(bankRecords) && bankRecords.length > 0) {
      setAllRecords(bankRecords.map((r) => ({ ...r, date: parseSafeDate(r.dateObj || r.date) })))
      setLoading(false)
    }
  }, [bankRecords])

  // Load records from local cache first, then Firestore
  async function loadData(forceRefresh = false) {
    if (forceRefresh) setRefreshing(true)
    else if (allRecords.length === 0) setLoading(true)

    setError('')
    try {
      const records = await fetchBankTransactionsFromFirestore(currentUid, isAdmin, forceRefresh)
      if (records && records.length > 0) {
        setAllRecords(records)
      } else {
        const cached = loadSnapshot('bank', currentUid) || loadSnapshot('bank')
        if (cached && cached.length > 0) {
          setAllRecords(cached.map((r) => ({ ...r, date: parseSafeDate(r.dateObj || r.date) })))
        }
      }
    } catch (err) {
      console.warn('[BankHistoryView] Load error:', err?.message)
      if (allRecords.length === 0) {
        setError('Could not sync bank transactions. Showing cached data if available.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    // Only load from Firestore if parent didn't pass bankRecords
    if (!bankRecords || bankRecords.length === 0) {
      loadData()
    }
  }, [currentUid, isAdmin])

  // Extract unique bank names for filter pill bar
  const uniqueBanks = useMemo(() => {
    const set = new Set()
    allRecords.forEach((r) => {
      if (r.bank) set.add(r.bank)
    })
    return Array.from(set).sort()
  }, [allRecords])

  const [visibleCount, setVisibleCount] = useState(30)

  // Filter records by search term & bank name
  const filtered = useMemo(() => {
    return allRecords.filter((r) => {
      // Bank filter
      if (selectedBankFilter !== 'ALL' && r.bank !== selectedBankFilter) {
        return false
      }

      // Search term
      if (searchTerm.trim()) {
        const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
        const str = [
          r.bank,
          r.description,
          r.debit ? String(r.debit) : '',
          r.credit ? String(r.credit) : '',
          r.date instanceof Date ? r.date.toLocaleDateString('en-IN') : '',
        ].join(' ').toLowerCase()

        return terms.every((t) => str.includes(t))
      }

      return true
    })
  }, [allRecords, searchTerm, selectedBankFilter])

  // Reset pagination on filter change
  useEffect(() => {
    setVisibleCount(30)
  }, [searchTerm, selectedBankFilter])

  const visibleRecords = useMemo(() => {
    return filtered.slice(0, visibleCount)
  }, [filtered, visibleCount])

  // Summary metrics for current filtered view
  const metrics = useMemo(() => {
    let totalDebit = 0
    let totalCredit = 0
    filtered.forEach((r) => {
      totalDebit += parseFloat(r.debit || 0)
      totalCredit += parseFloat(r.credit || 0)
    })
    return {
      totalDebit,
      totalCredit,
      net: totalCredit - totalDebit,
    }
  }, [filtered])

  async function handleDelete(r) {
    if (!r || !r.id) return
    const confirmed = await showConfirm({
      title: 'Delete Bank Entry',
      message: `Are you sure you want to delete bank transaction "${r.description || 'Entry'}"?`,
      confirmText: 'Delete Record',
      cancelText: 'Cancel',
      variant: 'danger',
      icon: '🗑️',
    })
    if (!confirmed) return

    setDeletingId(r.id)
    try {
      await deleteBankTransaction(r.id)
      const updated = allRecords.filter((item) => item.id !== r.id)
      setAllRecords(updated)
    } catch (err) {
      await showAlert({
        title: 'Delete Failed',
        message: formatUserFriendlyError(err, 'Could not delete transaction. Please try again.'),
        variant: 'warning',
        icon: '⚠️',
      })
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(d) {
    const dt = parseSafeDate(d)
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Automatic Bank Transaction Sync Card */}
      <BankLinkCard
        subscription={subscription}
        appConfig={appConfig}
        onOpenSubscriptionModal={onOpenSubscriptionModal}
        onSyncComplete={() => loadData(true)}
      />

      {/* Header & Controls Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, maxWidth: '100%' }}>
          <div className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)' }}>🏦 Bank History</span>
            {allRecords.length > 0 && (
              <span style={{ fontSize: 9.5, fontWeight: 800, background: 'var(--accent-50, #e0e7ff)', color: 'var(--accent-600, #4f46e5)', padding: '1px 6px', borderRadius: 10, border: '1px solid var(--accent-200, #c7d2fe)' }}>
                {allRecords.length.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                title="Import PDF/CSV Bank Statement"
                style={{
                  height: 27,
                  padding: '0 9px',
                  borderRadius: 14,
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  boxShadow: '0 2px 5px rgba(99,102,241,0.25)',
                }}
              >
                <i className="fas fa-file-import" style={{ fontSize: 9 }} />
                <span>Import</span>
              </button>
            )}

            <button
              type="button"
              onClick={scanForBankDuplicates}
              disabled={scanningDups}
              title="Scan and clean duplicate bank transactions"
              style={{
                height: 27,
                padding: '0 9px',
                borderRadius: 14,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: scanningDups ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: 10,
                fontWeight: 700,
                cursor: scanningDups ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <i className={`fas ${scanningDups ? 'fa-spinner fa-spin' : 'fa-copy'}`} style={{ fontSize: 9 }} />
              <span>{scanningDups ? 'Scanning…' : 'Clean Dups'}</span>
            </button>

            {onOpenMerge && (
              <button
                type="button"
                onClick={() => onOpenMerge('bank')}
                title="Merge duplicate bank names"
                style={{
                  height: 27,
                  padding: '0 9px',
                  borderRadius: 14,
                  border: '1px solid var(--border-color, #e2e8f0)',
                  background: 'var(--bg-subtle, #f8fafc)',
                  color: 'var(--text-secondary, #475569)',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <i className="fas fa-random" style={{ fontSize: 9, color: '#0284c7' }} />
                <span>Merge</span>
              </button>
            )}

            {/* Sync / Refresh Button */}
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              title="Refresh Bank Transactions"
              style={{
                height: 27,
                width: 27,
                padding: 0,
                borderRadius: 14,
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-subtle, #f8fafc)',
                color: 'var(--text-secondary, #475569)',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <i className={`fas ${refreshing ? 'fa-spin' : ''} fa-sync-alt`} style={{ fontSize: 9 }} />
            </button>
          </div>
        </div>

        {cleanSuccessMsg && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 11, fontWeight: 700 }}>
            {cleanSuccessMsg}
          </div>
        )}

        {showDupScanner && createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 999999,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 12px',
            }}
            onClick={() => setShowDupScanner(false)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 600,
                maxHeight: '88vh',
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  borderBottom: '1px solid var(--border-color, #e2e8f0)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary, #1e293b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-copy" style={{ color: '#ef4444' }} />
                    <span>Duplicate Bank Transactions Preview</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted, #64748b)', fontWeight: 600, marginTop: 2 }}>
                    Found {dupClusters.length} duplicate group(s). Review copies below before deleting or cancel anytime.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      border: '1px solid #d97706',
                      background: '#fef3c7',
                      color: '#b45309',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleSelectAllDuplicates(dupClusters.some((c) => c.duplicates.some((d) => !d.selected)))}
                  >
                    {dupClusters.every((c) => c.duplicates.every((d) => d.selected)) ? 'Deselect All' : 'Select All'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDupScanner(false)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(239,68,68,0.1)',
                      color: '#ef4444',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Cancel Operation"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Preview Body */}
              <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dupClusters.slice(0, dupPreviewLimit).map((cluster, cIdx) => (
                  <div key={cluster.id} style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 12, padding: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Group #{cIdx + 1} • {cluster.original.bank}</span>
                      <span>₹{(cluster.original.debit || cluster.original.credit || cluster.original.amount || 0).toLocaleString('en-IN')}</span>
                    </div>

                    {/* Original Record (Keep) */}
                    <div style={{ padding: '8px 10px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#047857', background: '#d1fae5', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                          KEEP (ORIGINAL)
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {toLocalYMD(cluster.original.dateObj || cluster.original.date)} • {cluster.original.description || 'Transaction'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#047857', flexShrink: 0, marginLeft: 8 }}>
                        {cluster.original.debit > 0 ? `-₹${cluster.original.debit.toLocaleString('en-IN')}` : `+₹${cluster.original.credit.toLocaleString('en-IN')}`}
                      </div>
                    </div>

                    {/* Redundant Duplicates (Selected for deletion) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 8, borderLeft: '2px dashed #f59e0b' }}>
                      {cluster.duplicates.map((dup, dIdx) => (
                        <div
                          key={dup.id || dIdx}
                          onClick={() => toggleDuplicateItem(cIdx, dIdx)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px',
                            background: dup.selected ? '#fff1f2' : 'var(--bg-card, #ffffff)',
                            border: dup.selected ? '1px solid #fda4af' : '1px solid #e2e8f0',
                            borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={dup.selected}
                              onChange={() => {}}
                              style={{ accentColor: '#ef4444', width: 15, height: 15, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', background: '#ffe4e6', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                              DUPLICATE COPY
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary, #1e293b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {toLocalYMD(dup.dateObj || dup.date)} • {dup.description || 'Transaction'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', flexShrink: 0, marginLeft: 8 }}>
                            {dup.debit > 0 ? `-₹${dup.debit.toLocaleString('en-IN')}` : `+₹${dup.credit.toLocaleString('en-IN')}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {dupClusters.length > dupPreviewLimit && (
                  <button
                    type="button"
                    onClick={() => setDupPreviewLimit((prev) => prev + 40)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #6366f1',
                      background: 'rgba(99,102,241,0.08)',
                      color: '#6366f1',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      margin: '8px auto',
                      display: 'block',
                    }}
                  >
                    Load More Groups ({dupClusters.length - dupPreviewLimit} remaining)...
                  </button>
                )}
              </div>

              {/* Modal Footer / Full Control Action Bar */}
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg-subtle, #f8fafc)',
                  borderTop: '1px solid var(--border-color, #e2e8f0)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                  {dupClusters.reduce((sum, c) => sum + c.duplicates.filter((d) => d.selected).length, 0)} of {dupClusters.reduce((sum, c) => sum + c.duplicates.length, 0)} duplicate copies selected
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowDupScanner(false)}
                    style={{
                      padding: '7px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-card, #ffffff)',
                      color: 'var(--text-secondary, #475569)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel Operation
                  </button>

                  <button
                    type="button"
                    disabled={deletingDups || dupClusters.every((c) => c.duplicates.every((d) => !d.selected))}
                    onClick={handleDeleteDuplicates}
                    style={{
                      padding: '7px 16px',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#ffffff',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      border: 'none',
                      borderRadius: 8,
                      cursor: deletingDups ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
                    }}
                  >
                    {deletingDups ? (
                      <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                    ) : (
                      <><i className="fas fa-trash-alt"></i> Delete Selected ({dupClusters.reduce((sum, c) => sum + c.duplicates.filter((d) => d.selected).length, 0)})</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Search & Actions Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by amount, bank, remarks..."
              style={{
                width: '100%',
                paddingLeft: 28,
                paddingRight: searchTerm ? 28 : 10,
                paddingTop: 7,
                paddingBottom: 7,
                fontSize: 11.5,
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                borderRadius: 20,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 11 }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Unique Banks Filter Bar */}
        {uniqueBanks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSelectedBankFilter('ALL')}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 10.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                border: selectedBankFilter === 'ALL' ? '1px solid var(--accent-500)' : '1px solid var(--border-color)',
                background: selectedBankFilter === 'ALL' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-subtle)',
                color: selectedBankFilter === 'ALL' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              All Banks ({allRecords.length})
            </button>

            {uniqueBanks.map((bName) => {
              const count = allRecords.filter((r) => r.bank === bName).length
              const isActive = selectedBankFilter === bName
              return (
                <button
                  key={bName}
                  onClick={() => setSelectedBankFilter(bName)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 10.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    border: isActive ? '1px solid var(--accent-500)' : '1px solid var(--border-color)',
                    background: isActive ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-subtle)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  🏦 {bName} ({count})
                </button>
              )
            })}
          </div>
        )}

        {/* Summary Card Banner */}
        {filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            fontSize: 11,
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Spent (Debits)</div>
              <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 12.5, marginTop: 1 }}>-₹{metrics.totalDebit.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Credits</div>
              <div style={{ color: '#10b981', fontWeight: 800, fontSize: 12.5, marginTop: 1 }}>+₹{metrics.totalCredit.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Cash Flow</div>
              <div style={{ color: metrics.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: 12.5, marginTop: 1 }}>
                {metrics.net >= 0 ? '+' : ''}₹{metrics.net.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        )}
      </div>



      {/* Error Alert */}
      {error && (
        <div style={{ margin: '8px 0', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
          <i className="fas fa-spinner fa-spin" style={{ marginRight: 6, fontSize: 16, color: '#6366f1' }} />
          Loading bank transactions...
        </div>
      )}

      {/* Empty State */}
      {!loading && allRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed var(--border-color)', margin: '10px 0' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <i className="fas fa-university" style={{ fontSize: 22, color: '#6366f1' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>No Bank Statements Imported Yet</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280, margin: '6px auto 14px' }}>
            Import your PDF or CSV bank statement to search across bank history and auto-verify payment proofs.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={onOpenImport}
              style={{
                padding: '9px 20px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-file-import" style={{ fontSize: 13 }} />
              {allowNonCsvImport ? 'Import PDF / CSV Statement' : 'Import CSV Statement'}
            </button>
          </div>
        </div>
      )}

      {/* No search results */}
      {!loading && allRecords.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
          No bank transactions match filter criteria.
          {searchTerm && <div>Searching for "<strong>{searchTerm}</strong>"</div>}
          <button
            onClick={() => { setSearchTerm(''); setSelectedBankFilter('ALL') }}
            style={{ marginTop: 8, background: 'none', border: 'none', color: '#6366f1', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Transaction List */}
      {filtered.length > 0 && (
        <>
          <ul className="txn-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {visibleRecords.map((r, index) => {
              const isCredit = (r.credit || 0) > 0 && !(r.debit || 0 > 0)
              const amount = isCredit ? r.credit : r.debit
              const amtCls = isCredit ? 'positive' : 'negative'
              const amtSign = isCredit ? '+' : '-'
              const amtStr = `${amtSign}₹${Number(amount || 0).toLocaleString('en-IN')}`

              return (
                <li key={r.id} className="txn-item" style={{ position: 'relative', cursor: 'default', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  {/* Icon */}
                  <div
                    className={`txn-icon ${isCredit ? 'positive' : 'expense'}`}
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isCredit ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
                      color: isCredit ? '#10b981' : '#ef4444',
                      fontSize: 12,
                    }}
                  >
                    <i className={`fas ${isCredit ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                  </div>

                  {/* Main Info */}
                  <div className="txn-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="txn-title" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                        Sl. {index + 1}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                        {r.description || '—'}
                      </span>
                      {r.bank && (
                        <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 700, border: '1px solid rgba(99,102,241,0.18)', flexShrink: 0 }}>
                          {r.bank}
                        </span>
                      )}
                    </div>
                    <div className="txn-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDate(r.date)}
                      {r.balance ? ` · Bal: ₹${Number(r.balance).toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>

                  {/* Amount & Delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div className={`txn-amount ${amtCls}`} style={{ textAlign: 'right', fontWeight: 800, fontSize: 12.5 }}>
                      {amtStr}
                    </div>

                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      title="Delete Bank Entry"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        padding: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        borderRadius: 4,
                        opacity: 0.6,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      {deletingId === r.id ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash-alt" />}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Load More Button */}
          {visibleCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--accent-600)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              ▼ Load More Transactions (Showing {visibleCount} of {filtered.length})
            </button>
          )}
        </>
      )}
    </div>
  )
}
