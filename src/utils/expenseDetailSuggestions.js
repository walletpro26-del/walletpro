const referencePattern = /\bref(?:erence)?\.?\s*[:#=-]?\s*(\d[\w./-]*)/i

/**
 * Real-time search: filters and ranks `allDetails` strings against `query`.
 * Returns at most `limit` results, ranked: prefix > word-start > contains.
 */
export function searchDetails(allDetails = [], query = '', limit = 6) {
  const q = query.trim().toLowerCase()
  if (!q || q.length < 1) return []
  const results = []
  for (const raw of allDetails) {
    const text = String(raw || '').trim()
    if (!text) continue
    const lower = text.toLowerCase()
    let score = 0
    if (lower === q) score = 4                      // exact match
    else if (lower.startsWith(q)) score = 3         // prefix match
    else if (/(^|\s)/.test(lower.slice(lower.indexOf(q) < 0 ? 0 : lower.indexOf(q))) && lower.includes(q)) score = 2  // word-start match
    else if (lower.includes(q)) score = 1           // substring match
    if (score > 0) results.push({ text, score })
  }
  results.sort((a, b) => b.score - a.score || a.text.length - b.text.length)
  return results.slice(0, limit).map((r) => r.text)
}

export function findReferenceRange(details = '') {
  const match = referencePattern.exec(details)
  if (!match) return null
  const start = match.index + match[0].lastIndexOf(match[1])
  return { start, end: start + match[1].length }
}

// References vary between otherwise identical recurring expenses. Preserve the
// latest original text for reuse; only the grouping key replaces the reference.
export function detailSignature(details = '') {
  return details.trim().toLowerCase().replace(referencePattern, 'ref {reference}').replace(/\s+/g, ' ')
}

export function buildDetailPatterns(expenses = []) {
  const patterns = new Map()
  for (const expense of expenses) {
    const details = String(expense.details || '').trim()
    const category = String(expense.category || '').trim()
    if (!details || !category) continue
    const forWhom = String(expense.forWhom || '').trim()
    const key = JSON.stringify([category.toLowerCase(), forWhom.toLowerCase(), detailSignature(details)])
    const date = expense.dateObj || expense.date
    const timestamp = new Date(date).getTime() || 0
    const existing = patterns.get(key)
    if (!existing) patterns.set(key, { details, category, forWhom, count: 1, timestamp })
    else {
      existing.count++
      if (timestamp > existing.timestamp) {
        existing.details = details
        existing.timestamp = timestamp
      }
    }
  }
  return [...patterns.values()]
}

export function getDetailSuggestions(patterns = [], category = '', forWhom = '') {
  const normalize = value => String(value || '').trim().toLowerCase()
  if (!normalize(category)) return []
  const ranked = patterns.filter(item => normalize(item.category) === normalize(category))
    .sort((a, b) => {
      const aMatches = normalize(forWhom) && normalize(a.forWhom) === normalize(forWhom) ? 1 : 0
      const bMatches = normalize(forWhom) && normalize(b.forWhom) === normalize(forWhom) ? 1 : 0
      return bMatches - aMatches || b.count - a.count || b.timestamp - a.timestamp
    })
  const seen = new Set()
  return ranked.filter(item => {
    const signature = detailSignature(item.details)
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  }).slice(0, 5)
}
