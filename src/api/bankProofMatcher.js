/**
 * bankProofMatcher.js
 * Scans bank transactions to find matching bank statements / proofs for Expenses & Lending records.
 * Only matches with confidence strictly greater than 85% are verified as Bank Proofs.
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

const GENERIC_STOP_WORDS = new Set([
  'the', 'and', 'for', 'paid', 'via', 'upi', 'transfer', 'to', 'by',
  'payment', 'bank', 'account', 'inr', 'rs', 'from', 'with', 'ref',
  'txn', 'val', 'dr', 'cr', 'null', 'undefined', 'auto', 'self'
])

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

  // Collect key elements: comment, remarks, details, person, category, forWhom
  const rawKeywords = [
    item.comment,
    item.remarks,
    item.details,
    item.person,
    item.category,
    item.forWhom,
    item.merchant,
    item.payee,
  ]
    .filter(Boolean)
    .map((k) => String(k).toLowerCase().trim())
    .filter((k) => k.length > 1)

  // Tokenize key elements into distinct search terms
  const tokenSet = new Set()
  rawKeywords.forEach((phrase) => {
    // Also include full phrase if short and meaningful
    if (phrase.length >= 3 && !GENERIC_STOP_WORDS.has(phrase)) {
      tokenSet.add(phrase)
    }
    phrase.split(/[\s,/\\_-]+/).forEach((word) => {
      const clean = word.replace(/[^a-z0-9]/g, '').trim()
      if (clean.length >= 3 && !GENERIC_STOP_WORDS.has(clean)) {
        tokenSet.add(clean)
      }
    })
  })
  const searchTokens = Array.from(tokenSet)

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

    // 1. PRIMARY FACTOR 1: Amount Match Scoring (Max 50 points)
    const amtDiff = Math.abs(bankAmt - itemAmt)
    const relDiff = itemAmt > 0 ? amtDiff / itemAmt : 1

    if (amtDiff < 0.05 || relDiff < 0.0001) {
      score += 50
      matchReasons.push(`Exact Amount (₹${itemAmt.toLocaleString('en-IN')})`)
    } else if (relDiff <= 0.005) {
      // Within 0.5% (slight rounding/cents)
      score += 42
      matchReasons.push('Amount within 0.5%')
    } else if (relDiff <= 0.01) {
      // Within 1%
      score += 30
      matchReasons.push('Amount within 1%')
    } else if (relDiff <= 0.02) {
      score += 18
      matchReasons.push('Amount within 2%')
    } else {
      // Amount mismatch beyond 2% fails bank proof criteria
      return
    }

    // 2. PRIMARY FACTOR 2: Date Proximity Scoring (Max 30 points)
    const dateDiffDays = Math.abs(bankDate.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24)
    if (dateDiffDays < 0.8) {
      score += 30
      matchReasons.push('Same Date')
    } else if (dateDiffDays <= 1.5) {
      score += 22
      matchReasons.push('Date within 1 day')
    } else if (dateDiffDays <= 2.5) {
      score += 12
      matchReasons.push('Date within 2 days')
    } else if (dateDiffDays <= 3.5) {
      score += 5
      matchReasons.push('Date within 3 days')
    } else {
      // Date difference beyond 3.5 days fails high-confidence proof criteria
      return
    }

    // 3. PRIMARY FACTOR 3: Transaction Details & Key Elements (Comments / Remarks / Details / Merchant) (Max 20 points)
    const bankDesc = `${b.description || ''} ${b.bank || ''} ${b.narration || ''} ${b.merchant || ''} ${b.category || ''}`.toLowerCase()
    
    let matchedTokenCount = 0
    let fullPhraseMatch = false

    rawKeywords.forEach((phrase) => {
      if (phrase.length >= 3 && bankDesc.includes(phrase)) {
        fullPhraseMatch = true
      }
    })

    searchTokens.forEach((token) => {
      if (bankDesc.includes(token)) {
        matchedTokenCount++
      }
    })

    if (fullPhraseMatch || matchedTokenCount >= 2) {
      score += 20
      matchReasons.push('Details & Comments Match')
    } else if (matchedTokenCount === 1) {
      score += 12
      matchReasons.push('Keyword / Merchant Match')
    }

    const confidence = Math.min(100, Math.round(score))

    // STRICT THRESHOLD REQUIREMENT: Bank proof is ONLY shown when confidence > 85%
    if (confidence > 85) {
      matches.push({
        bankTransaction: b,
        confidence,
        reasons: matchReasons,
        amtDiff,
        dateDiffDays,
      })
    }
  })

  // Sort from top to bottom by highest matching percentage and cap to top 10
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
}
