import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { db, auth } from '../firebase'
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore'
import {
  normalizePersonName,
  getPersonAliases,
  savePersonAlias,
  removePersonAlias,
  findDuplicatePersonCandidates,
  normalizeCategoryName,
  getCategoryAliases,
  saveCategoryAlias,
  removeCategoryAlias,
  findDuplicateCategoryCandidates,
  normalizeBankName,
  getBankAliases,
  saveBankAlias,
  removeBankAlias,
  findDuplicateBankCandidates,
} from '../api/entityNormalizer'
import { loadSnapshot, saveSnapshot } from '../api/localCache'

export default function PersonMergeModal({
  allExpenses = [],
  allLending = [],
  allBankRecords: propBankRecords,
  uid,
  onClose,
  onMergeComplete,
  initialEntityType = 'person', // 'person' | 'category' | 'bank'
}) {
  const currentUid = uid || auth?.currentUser?.uid || ''
  const [entityType, setEntityType] = useState(initialEntityType) // 'person' | 'category' | 'bank'
  const [activeTab, setActiveTab] = useState('suggestions') // 'suggestions' | 'manual' | 'rules'
  const [srcName, setSrcName] = useState('')
  const [targetName, setTargetName] = useState('')
  const [autoSaveAlias, setAutoSaveAlias] = useState(true)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const allBankRecords = useMemo(() => {
    if (propBankRecords && propBankRecords.length > 0) return propBankRecords
    return loadSnapshot('bank', currentUid) || loadSnapshot('bank') || []
  }, [propBankRecords, currentUid])

  // Reset form inputs when entityType changes
  useEffect(() => {
    setSrcName('')
    setTargetName('')
    setError('')
    setSuccessMsg('')
  }, [entityType])

  // Live Before & After Transformation Stats
  const mergePreviewStats = useMemo(() => {
    if (!srcName || !targetName || srcName.trim().toLowerCase() === targetName.trim().toLowerCase()) return null

    const src = srcName.trim()
    const tgt = targetName.trim()

    if (entityType === 'bank') {
      const srcBank = allBankRecords.filter((b) => b.bank?.trim() === src)
      const tgtBank = allBankRecords.filter((b) => b.bank?.trim() === tgt)
      return {
        srcName: src,
        targetName: tgt,
        srcExpensesCount: srcBank.length,
        srcLendingCount: 0,
        srcTotalCount: srcBank.length,
        srcSum: 0,
        tgtExpensesCount: tgtBank.length,
        tgtLendingCount: 0,
        tgtTotalCount: tgtBank.length,
        finalExpensesCount: tgtBank.length + srcBank.length,
        finalLendingCount: 0,
        finalTotalCount: tgtBank.length + srcBank.length,
      }
    }

    if (entityType === 'category') {
      const srcExpenses = allExpenses.filter((e) => e.category?.trim() === src)
      const tgtExpenses = allExpenses.filter((e) => e.category?.trim() === tgt)
      const srcSum = srcExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      return {
        srcName: src,
        targetName: tgt,
        srcExpensesCount: srcExpenses.length,
        srcLendingCount: 0,
        srcTotalCount: srcExpenses.length,
        srcSum,
        tgtExpensesCount: tgtExpenses.length,
        tgtLendingCount: 0,
        tgtTotalCount: tgtExpenses.length,
        finalExpensesCount: tgtExpenses.length + srcExpenses.length,
        finalLendingCount: 0,
        finalTotalCount: tgtExpenses.length + srcExpenses.length,
      }
    }

    const srcExpenses = allExpenses.filter((e) => e.forWhom?.trim() === src)
    const srcLending = allLending.filter((l) => l.person?.trim() === src)
    const srcTotalCount = srcExpenses.length + srcLending.length
    const srcSum = srcExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) + srcLending.reduce((sum, l) => sum + (l.amount || 0), 0)

    const tgtExpenses = allExpenses.filter((e) => e.forWhom?.trim() === tgt)
    const tgtLending = allLending.filter((l) => l.person?.trim() === tgt)
    const tgtTotalCount = tgtExpenses.length + tgtLending.length

    const finalExpensesCount = tgtExpenses.length + srcExpenses.length
    const finalLendingCount = tgtLending.length + srcLending.length
    const finalTotalCount = finalExpensesCount + finalLendingCount

    return {
      srcName: src,
      targetName: tgt,
      srcExpensesCount: srcExpenses.length,
      srcLendingCount: srcLending.length,
      srcTotalCount,
      srcSum,
      tgtExpensesCount: tgtExpenses.length,
      tgtLendingCount: tgtLending.length,
      tgtTotalCount,
      finalExpensesCount,
      finalLendingCount,
      finalTotalCount,
    }
  }, [srcName, targetName, allExpenses, allLending, allBankRecords, entityType])

  // Alias Rules List
  const [aliasRules, setAliasRules] = useState(() =>
    entityType === 'bank' ? getBankAliases() : entityType === 'category' ? getCategoryAliases() : getPersonAliases()
  )

  useEffect(() => {
    refreshAliasRules()
  }, [entityType])

  function refreshAliasRules() {
    setAliasRules(entityType === 'bank' ? getBankAliases() : entityType === 'category' ? getCategoryAliases() : getPersonAliases())
  }

  // Get all unique names/categories/banks in current dataset
  const allUniqueNames = useMemo(() => {
    const set = new Set()
    if (entityType === 'bank') {
      allBankRecords.forEach((b) => {
        if (b.bank?.trim()) set.add(b.bank.trim())
      })
    } else if (entityType === 'category') {
      allExpenses.forEach((e) => {
        if (e.category?.trim()) set.add(e.category.trim())
      })
    } else {
      allExpenses.forEach((e) => {
        if (e.forWhom?.trim()) set.add(e.forWhom.trim())
      })
      allLending.forEach((l) => {
        if (l.person?.trim()) set.add(l.person.trim())
      })
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allExpenses, allLending, allBankRecords, entityType])

  // Detect duplicate candidates
  const suggestedClusters = useMemo(() => {
    if (entityType === 'bank') {
      return findDuplicateBankCandidates(allBankRecords)
    }
    if (entityType === 'category') {
      return findDuplicateCategoryCandidates(allExpenses)
    }
    return findDuplicatePersonCandidates(allExpenses, allLending)
  }, [allExpenses, allLending, allBankRecords, entityType])

  async function executeMerge(source, target) {
    const src = (source || '').trim()
    const tgt = (target || '').trim()

    if (!src) {
      setError(`Please select or type a source ${entityType === 'category' ? 'category' : 'name'} to merge.`)
      return
    }
    if (!tgt) {
      setError(`Please select or type a target canonical ${entityType === 'category' ? 'category' : 'name'}.`)
      return
    }
    if (src.toLowerCase() === tgt.toLowerCase()) {
      setError(`Source and target ${entityType === 'category' ? 'categories' : 'names'} cannot be identical.`)
      return
    }

    setMerging(true)
    setError('')
    setSuccessMsg('')

    const currentUid = uid || auth?.currentUser?.uid || ''

    try {
      let updatedExpensesCount = 0
      let updatedLendingCount = 0

      let updatedBankCount = 0

      if (entityType === 'bank') {
        if (currentUid) {
          // Query by 'userId' field in bankTransactions
          const bankQ = query(
            collection(db, 'bankTransactions'),
            where('userId', '==', currentUid),
            where('bank', '==', src)
          )
          const bankSnap = await getDocs(bankQ)
          if (!bankSnap.empty) {
            const batchSize = 400
            for (let i = 0; i < bankSnap.docs.length; i += batchSize) {
              const batch = writeBatch(db)
              const chunk = bankSnap.docs.slice(i, i + batchSize)
              chunk.forEach((d) => batch.update(d.ref, { bank: tgt }))
              await batch.commit()
            }
            updatedBankCount = bankSnap.size
          }

          // Query by 'uid' field (legacy documents) in bankTransactions
          const bankQ_uid = query(
            collection(db, 'bankTransactions'),
            where('uid', '==', currentUid),
            where('bank', '==', src)
          )
          const bankSnap_uid = await getDocs(bankQ_uid)
          if (!bankSnap_uid.empty) {
            const batchSize = 400
            for (let i = 0; i < bankSnap_uid.docs.length; i += batchSize) {
              const batch = writeBatch(db)
              const chunk = bankSnap_uid.docs.slice(i, i + batchSize)
              chunk.forEach((d) => batch.update(d.ref, { bank: tgt }))
              await batch.commit()
            }
            updatedBankCount += bankSnap_uid.size
          }

          if (src.toLowerCase() !== src) {
            const bankQ2 = query(
              collection(db, 'bankTransactions'),
              where('userId', '==', currentUid),
              where('bank', '==', src.toLowerCase())
            )
            const bankSnap2 = await getDocs(bankQ2)
            if (!bankSnap2.empty) {
              const batchSize = 400
              for (let i = 0; i < bankSnap2.docs.length; i += batchSize) {
                const batch = writeBatch(db)
                const chunk = bankSnap2.docs.slice(i, i + batchSize)
                chunk.forEach((d) => batch.update(d.ref, { bank: tgt }))
                await batch.commit()
              }
              updatedBankCount += bankSnap2.size
            }
          }
        }

        if (autoSaveAlias) {
          saveBankAlias(src, tgt)
          refreshAliasRules()
        }

        const newBank = allBankRecords.map((b) =>
          b.bank?.toLowerCase() === src.toLowerCase() ? { ...b, bank: tgt } : b
        )
        saveSnapshot('bank', newBank, currentUid)

        setSuccessMsg(
          `🎉 Successfully merged Bank Name "${src}" → "${tgt}" (${updatedBankCount} bank transaction records updated in database)!`
        )
      } else if (entityType === 'category') {
        // Update Category in Firestore Expenses
        if (currentUid) {
          const expQ = query(
            collection(db, 'expenses'),
            where('userId', '==', currentUid),
            where('category', '==', src)
          )
          const expSnap = await getDocs(expQ)
          if (!expSnap.empty) {
            const batchSize = 400
            for (let i = 0; i < expSnap.docs.length; i += batchSize) {
              const batch = writeBatch(db)
              const chunk = expSnap.docs.slice(i, i + batchSize)
              chunk.forEach((d) => batch.update(d.ref, { category: tgt }))
              await batch.commit()
            }
            updatedExpensesCount = expSnap.size
          }

          if (src.toLowerCase() !== src) {
            const expQ2 = query(
              collection(db, 'expenses'),
              where('userId', '==', currentUid),
              where('category', '==', src.toLowerCase())
            )
            const expSnap2 = await getDocs(expQ2)
            if (!expSnap2.empty) {
              const batchSize = 400
              for (let i = 0; i < expSnap2.docs.length; i += batchSize) {
                const batch = writeBatch(db)
                const chunk = expSnap2.docs.slice(i, i + batchSize)
                chunk.forEach((d) => batch.update(d.ref, { category: tgt }))
                await batch.commit()
              }
              updatedExpensesCount += expSnap2.size
            }
          }
        }

        if (autoSaveAlias) {
          saveCategoryAlias(src, tgt)
          refreshAliasRules()
        }

        const newExpenses = allExpenses.map((e) =>
          e.category?.toLowerCase() === src.toLowerCase() ? { ...e, category: tgt } : e
        )
        saveSnapshot('expenses', newExpenses, currentUid)

        setSuccessMsg(
          `🎉 Successfully merged Category "${src}" → "${tgt}" (${updatedExpensesCount} expense records updated in database)!`
        )
      } else {
        // 1. Update Firestore Expenses
        if (currentUid) {
          const expQ = query(
            collection(db, 'expenses'),
            where('userId', '==', currentUid),
            where('forWhom', '==', src)
          )
          const expSnap = await getDocs(expQ)
          if (!expSnap.empty) {
            const batchSize = 400
            for (let i = 0; i < expSnap.docs.length; i += batchSize) {
              const batch = writeBatch(db)
              const chunk = expSnap.docs.slice(i, i + batchSize)
              chunk.forEach((d) => batch.update(d.ref, { forWhom: tgt }))
              await batch.commit()
            }
            updatedExpensesCount = expSnap.size
          }

          if (src.toLowerCase() !== src) {
            const expQ2 = query(
              collection(db, 'expenses'),
              where('userId', '==', currentUid),
              where('forWhom', '==', src.toLowerCase())
            )
            const expSnap2 = await getDocs(expQ2)
            if (!expSnap2.empty) {
              const batchSize = 400
              for (let i = 0; i < expSnap2.docs.length; i += batchSize) {
                const batch = writeBatch(db)
                const chunk = expSnap2.docs.slice(i, i + batchSize)
                chunk.forEach((d) => batch.update(d.ref, { forWhom: tgt }))
                await batch.commit()
              }
              updatedExpensesCount += expSnap2.size
            }
          }
        }

        // 2. Update Firestore Lending
        if (currentUid) {
          const lendQ = query(
            collection(db, 'lending'),
            where('userId', '==', currentUid),
            where('person', '==', src)
          )
          const lendSnap = await getDocs(lendQ)
          if (!lendSnap.empty) {
            const batchSize = 400
            for (let i = 0; i < lendSnap.docs.length; i += batchSize) {
              const batch = writeBatch(db)
              const chunk = lendSnap.docs.slice(i, i + batchSize)
              chunk.forEach((d) => batch.update(d.ref, { person: tgt }))
              await batch.commit()
            }
            updatedLendingCount = lendSnap.size
          }

          if (src.toLowerCase() !== src) {
            const lendQ2 = query(
              collection(db, 'lending'),
              where('userId', '==', currentUid),
              where('person', '==', src.toLowerCase())
            )
            const lendSnap2 = await getDocs(lendQ2)
            if (!lendSnap2.empty) {
              const batchSize = 400
              for (let i = 0; i < lendSnap2.docs.length; i += batchSize) {
                const batch = writeBatch(db)
                const chunk = lendSnap2.docs.slice(i, i + batchSize)
                chunk.forEach((d) => batch.update(d.ref, { person: tgt }))
                await batch.commit()
              }
              updatedLendingCount += lendSnap2.size
            }
          }
        }

        if (autoSaveAlias) {
          savePersonAlias(src, tgt)
          refreshAliasRules()
        }

        const newExpenses = allExpenses.map((e) =>
          e.forWhom?.toLowerCase() === src.toLowerCase() ? { ...e, forWhom: tgt } : e
        )
        const newLending = allLending.map((l) =>
          l.person?.toLowerCase() === src.toLowerCase() ? { ...l, person: tgt } : l
        )

        saveSnapshot('expenses', newExpenses, currentUid)
        saveSnapshot('lending', newLending, currentUid)

        const totalUpdated = updatedExpensesCount + updatedLendingCount
        setSuccessMsg(
          `🎉 Successfully merged Person "${src}" → "${tgt}" (${totalUpdated} records updated in database)!`
        )
      }

      setSrcName('')
      setTargetName('')
      onMergeComplete?.()
    } catch (err) {
      setError('Merge failed: ' + (err?.message || 'Error executing batch update'))
    } finally {
      setMerging(false)
    }
  }

  // Merge full suggested cluster
  async function handleClusterMerge(cluster) {
    const target = cluster.canonical
    const sourcesToMerge = cluster.names.filter((n) => n.toLowerCase() !== target.toLowerCase())

    if (sourcesToMerge.length === 0) return

    setMerging(true)
    setError('')
    setSuccessMsg('')

    try {
      for (const src of sourcesToMerge) {
        if (entityType === 'category') saveCategoryAlias(src, target)
        else savePersonAlias(src, target)
      }
      refreshAliasRules()

      for (const src of sourcesToMerge) {
        await executeMerge(src, target)
      }
    } catch (err) {
      setError('Cluster merge error: ' + (err?.message || 'Error'))
    } finally {
      setMerging(false)
    }
  }

  function handleRemoveAlias(key) {
    if (entityType === 'category') removeCategoryAlias(key)
    else removePersonAlias(key)
    refreshAliasRules()
    setSuccessMsg(`✔ Removed rule for "${key}".`)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  return createPortal(
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          position: 'relative',
          maxWidth: 560,
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 16,
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          background: 'var(--bg-primary, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          margin: 'auto',
          zIndex: 100000,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '18px 20px 14px',
            color: '#fff',
            position: 'relative',
          }}
        >
          <button
            className="modal-close"
            style={{
              position: 'absolute',
              top: 14,
              right: 16,
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              width: 26,
              height: 26,
              fontSize: 11,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            <i className="fas fa-times" />
          </button>
          {/* Entity Type Selector Bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setEntityType('person')}
              style={{
                flex: 1, padding: '5px 10px', borderRadius: 20, border: 'none',
                background: entityType === 'person' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: entityType === 'person' ? '0 2px 8px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.2s'
              }}
            >
              👤 Person Names
            </button>
            <button
              type="button"
              onClick={() => setEntityType('category')}
              style={{
                flex: 1, padding: '5px 10px', borderRadius: 20, border: 'none',
                background: entityType === 'category' ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: entityType === 'category' ? '0 2px 8px rgba(16,185,129,0.4)' : 'none', transition: 'all 0.2s'
              }}
            >
              🏷️ Categories
            </button>
            <button
              type="button"
              onClick={() => setEntityType('bank')}
              style={{
                flex: 1, padding: '5px 10px', borderRadius: 20, border: 'none',
                background: entityType === 'bank' ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: entityType === 'bank' ? '0 2px 8px rgba(2,132,199,0.4)' : 'none', transition: 'all 0.2s'
              }}
            >
              🏦 Bank Names
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: entityType === 'bank' ? 'rgba(2,132,199,0.2)' : entityType === 'category' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {entityType === 'bank' ? '🏦' : entityType === 'category' ? '🏷️' : '🔀'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>
                {entityType === 'bank' ? 'Bank Name Normalization & Merge' : entityType === 'category' ? 'Category Normalization & Merge' : 'Person Name Normalization & Merge'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#a5b4fc' }}>
                {entityType === 'bank'
                  ? 'Unify duplicate bank variations (e.g. SBI, STATE BANK OF INDIA → SBI)'
                  : entityType === 'category'
                  ? 'Unify duplicate category variations (e.g. food, food_, dining → Food & Dining)'
                  : 'Unify duplicate name variations (e.g. Father, father_, My father → Father)'}
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 14,
              background: 'rgba(0,0,0,0.3)',
              padding: 3,
              borderRadius: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('suggestions')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === 'suggestions' ? '#ffffff' : 'transparent',
                color: activeTab === 'suggestions' ? '#312e81' : '#cbd5e1',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ✨ Auto Detected ({suggestedClusters.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === 'manual' ? '#ffffff' : 'transparent',
                color: activeTab === 'manual' ? '#312e81' : '#cbd5e1',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🛠 Manual Merge
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === 'rules' ? '#ffffff' : 'transparent',
                color: activeTab === 'rules' ? '#312e81' : '#cbd5e1',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              📋 Saved Rules ({Object.keys(aliasRules).length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 16, flex: 1, color: 'var(--text-primary, #1e293b)' }}>
          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
                fontSize: 11,
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} /> {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: '#10b981',
                fontSize: 11,
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              <i className="fas fa-check-circle" style={{ marginRight: 6 }} /> {successMsg}
            </div>
          )}

          {/* TAB 1: Auto Suggestions */}
          {activeTab === 'suggestions' && (
            <div>
              {suggestedClusters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 14px', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, border: '1px dashed var(--border-color, #cbd5e1)' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800 }}>No Duplicate Name Variations Found!</h4>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                    All person and expense target names across your database appear clean and unified.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#64748b' }}>
                    The following duplicate name clusters were detected in your Expenses and Lending history:
                  </p>

                  {suggestedClusters.map((cluster, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1' }}>
                          🎯 Target Canonical Name: <strong>"{cluster.canonical}"</strong>
                        </div>
                        <span style={{ fontSize: 9.5, fontWeight: 800, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 8px', borderRadius: 99 }}>
                          {cluster.totalRecords} record(s)
                        </span>
                      </div>

                      <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 10 }}>
                        Name variations detected:
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {cluster.names.map((name, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: name.toLowerCase() === cluster.canonical.toLowerCase() ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                                color: name.toLowerCase() === cluster.canonical.toLowerCase() ? '#059669' : '#ef4444',
                                fontWeight: 700,
                                fontSize: 10,
                                border: name.toLowerCase() === cluster.canonical.toLowerCase() ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.2)',
                              }}
                            >
                              {name} {name.toLowerCase() === cluster.canonical.toLowerCase() ? ' (Target)' : ''}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleClusterMerge(cluster)}
                        disabled={merging}
                        style={{
                          width: '100%',
                          padding: '7px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: merging ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                        }}
                      >
                        {merging ? 'Merging Cluster...' : `⚡ Merge All Variations to "${cluster.canonical}"`}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Manual Merge */}
          {activeTab === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 4, color: 'var(--text-primary, #1e293b)' }}>
                  1. Source {entityType === 'category' ? 'Category' : 'Name'} to Replace (e.g. {entityType === 'category' ? '"food_" or "dining"' : '"father_" or "my father"'}):
                </label>
                <select
                  value={srcName}
                  onChange={(e) => setSrcName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: 11.5,
                    background: 'var(--bg-card, #fff)',
                    color: 'var(--text-primary, #1e293b)',
                  }}
                >
                  <option value="">-- Select Source {entityType === 'category' ? 'Category' : 'Name'} from Database --</option>
                  {allUniqueNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, marginBottom: 4, color: 'var(--text-primary, #1e293b)' }}>
                  2. Target Canonical {entityType === 'category' ? 'Category' : 'Name'} (e.g. {entityType === 'category' ? '"Food & Dining"' : '"Father"'}):
                </label>
                <input
                  type="text"
                  placeholder={`Type target ${entityType === 'category' ? 'category' : 'name'} or select below...`}
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: 11.5,
                    background: 'var(--bg-card, #fff)',
                    color: 'var(--text-primary, #1e293b)',
                    marginBottom: 6,
                  }}
                />
                <select
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: 11,
                    background: 'var(--bg-subtle, #f8fafc)',
                    color: 'var(--text-primary, #1e293b)',
                  }}
                >
                  <option value="">-- Or Pick Existing {entityType === 'category' ? 'Category' : 'Name'} --</option>
                  {allUniqueNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Data Transformation Preview Card */}
              {mergePreviewStats && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(16,185,129,0.06) 100%)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    marginTop: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📊 Live Data Transformation Preview</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 10.5 }}>
                    {/* Before Box */}
                    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <div style={{ fontWeight: 800, color: '#ef4444', marginBottom: 4, fontSize: 10 }}>
                        🔴 BEFORE MERGE:
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>"{mergePreviewStats.srcName}"</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                        • {mergePreviewStats.srcExpensesCount} Expenses, {mergePreviewStats.srcLendingCount} Lending
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginTop: 2 }}>
                        {mergePreviewStats.srcTotalCount} separate records (₹{mergePreviewStats.srcSum.toLocaleString('en-IN')})
                      </div>
                    </div>

                    {/* After Box */}
                    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <div style={{ fontWeight: 800, color: '#059669', marginBottom: 4, fontSize: 10 }}>
                        🟢 FINAL UNIFIED RESULT:
                      </div>
                      <div style={{ fontWeight: 800, color: '#059669' }}>"{mergePreviewStats.targetName}"</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                        • {mergePreviewStats.finalExpensesCount} Expenses, {mergePreviewStats.finalLendingCount} Lending
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                        ✔ All {mergePreviewStats.finalTotalCount} records consolidated!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={autoSaveAlias}
                  onChange={(e) => setAutoSaveAlias(e.target.checked)}
                  style={{ accentColor: '#6366f1', width: 15, height: 15 }}
                />
                Remember rule for future manual entries &amp; CSV/PDF imports
              </label>

              <button
                type="button"
                onClick={() => executeMerge(srcName, targetName)}
                disabled={merging || !srcName || !targetName}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: merging || !srcName || !targetName ? 'not-allowed' : 'pointer',
                  marginTop: 6,
                  boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                }}
              >
                {merging ? 'Executing Batch Merge...' : '🔀 Confirm & Merge Database Records'}
              </button>
            </div>
          )}

          {/* TAB 3: Saved Alias Rules */}
          {activeTab === 'rules' && (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b' }}>
                Active auto-normalization alias rules. Future manual entries and CSV/PDF imports will automatically map using these rules:
              </p>

              {Object.keys(aliasRules).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px 10px', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 8, fontSize: 11, color: '#94a3b8' }}>
                  No active alias rules saved yet. Merge names to auto-create rules!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }} className="custom-scrollbar">
                  {Object.entries(aliasRules).map(([raw, target]) => (
                    <div
                      key={raw}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 11,
                      }}
                    >
                      <div>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>"{raw}"</span>
                        <span style={{ color: '#94a3b8', margin: '0 6px' }}>➔</span>
                        <span style={{ color: '#10b981', fontWeight: 800 }}>"{target}"</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(raw)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Remove Rule
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>, document.body)
}
