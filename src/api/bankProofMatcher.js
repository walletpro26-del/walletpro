/**
 * bankProofMatcher.js
 * Scans bank transactions to find matching bank statements / proofs for Expenses & Lending records.
 */

import { loadSnapshot } from './localCache'

function parseSafeDate(d) {
  if (!d) return new Date()
  if (d instanceof Date) return d
  if (typeof d.toDate === 'function') return d.toDate()
  if (typeof d === 'object' && d.seconds) return new Date(d.seconds * 1000)
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

export function findMatchingBankProof(item, customBankRecords = null) {
  if (!item || !item.amount) return []

  let bankRecords = customBankRecords
  if (!Array.isArray(bankRecords) || bankRecords.length === 0) {
    const userUid = item.userId || item.uid || ''
    bankRecords = loadSnapshot('bank', userUid) || loadSnapshot('bank') || []
  }

  // Dynamic localStorage key fallback scanner if snapshot is empty
  if (!Array.isArray(bankRecords) || bankRecords.length === 0) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.includes('bank') || k.includes('wv_cache'))) {
          const val = localStorage.getItem(k)
          if (val && val.startsWith('[')) {
            const parsed = JSON.parse(val)
            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].debit !== undefined || parsed[0].credit !== undefined || parsed[0].amount !== undefined)) {
              bankRecords = parsed
              break
            }
          }
        }
      }
    } catch (e) {}
  }

  if (!Array.isArray(bankRecords) || bankRecords.length === 0) return []

  const isLending = item.isLend || item.sheet === 'lending' || item.formType === 'lending'
  const itemAmt = parseFloat(item.amount) || 0
  if (itemAmt <= 0) return []

  const itemDate = parseSafeDate(item.date)

  const isIncoming = isLending && (item.type === 'Borrow' || item.type === 'They Return' || item.label === 'Borrow' || item.label === 'They Return')

  const keywords = [
    item.category,
    item.forWhom,
    item.person,
    item.details,
    item.remarks,
  ]
    .filter(Boolean)
    .map((k) => String(k).toLowerCase().trim())
    .filter((k) => k.length > 1)

  const matches = []

  bankRecords.forEach((b) => {
    if (!b) return
    const bankDate = parseSafeDate(b.dateObj || b.date)
    const debit = parseFloat(b.debit || 0)
    const credit = parseFloat(b.credit || 0)
    const bankAmt = isIncoming ? credit : (debit > 0 ? debit : credit)

    if (bankAmt <= 0) return

    let score = 0
    let matchReasons = []

    // 1. PRIMARY KEY 1: Amount Match Scoring
    const amtDiff = Math.abs(bankAmt - itemAmt)
    const relDiff = itemAmt > 0 ? amtDiff / itemAmt : 1

    if (amtDiff < 0.05) {
      score += 60
      matchReasons.push(`Exact Amount (₹${itemAmt})`)
    } else if (relDiff <= 0.03) {
      score += 45
      matchReasons.push('Near Amount (±3%)')
    } else if (relDiff <= 0.1) {
      score += 30
      matchReasons.push('Similar Amount (±10%)')
    }

    // 2. PRIMARY KEY 2: Date Proximity Scoring
    const dateDiffDays = Math.abs(bankDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24)
    if (dateDiffDays < 0.8) {
      score += 35
      matchReasons.push('Same Date')
    } else if (dateDiffDays <= 2) {
      score += 25
      matchReasons.push(`Date within ${Math.ceil(dateDiffDays)}d`)
    } else if (dateDiffDays <= 5) {
      score += 15
      matchReasons.push(`Date within ${Math.ceil(dateDiffDays)}d`)
    } else if (dateDiffDays <= 10) {
      score += 10
      matchReasons.push(`Date within ${Math.ceil(dateDiffDays)}d`)
    }

    // 3. Keyword / Narration Match
    const bankDesc = `${b.description || ''} ${b.bank || ''} ${b.narration || ''}`.toLowerCase()
    let kwMatchCount = 0
    keywords.forEach((kw) => {
      if (bankDesc.includes(kw)) {
        kwMatchCount++
      }
    })

    if (kwMatchCount > 0) {
      score += Math.min(20, kwMatchCount * 10)
      matchReasons.push('Description Match')
    }

    // Inclusion criteria: Exact amount OR (near amount & date within 10d) OR score >= 35
    if (amtDiff < 0.05 || (relDiff <= 0.05 && dateDiffDays <= 10) || score >= 35) {
      const confidence = Math.min(99, Math.max(35, Math.round(score)))
      matches.push({
        bankTransaction: b,
        confidence,
        reasons: matchReasons,
        amtDiff,
        dateDiffDays,
      })
    }
  })

  // Sort from top to bottom by highest matching percentage
  return matches.sort((a, b) => b.confidence - a.confidence)
}
