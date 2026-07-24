/**
 * entityNormalizer.js
 * Intelligent name & entity normalization, alias mapping, and duplicate detection
 * for Expenses (forWhom) and Lending/Borrowing (person).
 */

const ALIASES_STORAGE_KEY = 'wv_person_entity_aliases'
const CATEGORY_ALIASES_STORAGE_KEY = 'wv_category_entity_aliases'

/**
 * Fetch stored category alias mappings from localStorage
 */
export function getCategoryAliases() {
  try {
    const raw = localStorage.getItem(CATEGORY_ALIASES_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

/**
 * Save a new category alias mapping rule (e.g., 'food_' -> 'Food & Dining')
 */
export function saveCategoryAlias(rawCat, canonicalCat) {
  if (!rawCat || !canonicalCat) return
  const cleanRaw = rawCat.trim()
  const cleanCanonical = canonicalCat.trim()
  if (!cleanRaw || !cleanCanonical || cleanRaw.toLowerCase() === cleanCanonical.toLowerCase()) return

  try {
    const aliases = getCategoryAliases()
    aliases[cleanRaw] = cleanCanonical
    aliases[cleanRaw.toLowerCase()] = cleanCanonical
    localStorage.setItem(CATEGORY_ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

/**
 * Remove an existing category alias rule
 */
export function removeCategoryAlias(rawCat) {
  if (!rawCat) return
  try {
    const aliases = getCategoryAliases()
    delete aliases[rawCat]
    delete aliases[rawCat.trim()]
    delete aliases[rawCat.toLowerCase()]
    localStorage.setItem(CATEGORY_ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

/**
 * Clean & normalize a category name
 */
export function normalizeCategoryName(rawCat) {
  if (!rawCat || typeof rawCat !== 'string') return ''
  const trimmed = rawCat.trim()
  if (!trimmed) return ''

  const aliases = getCategoryAliases()
  if (aliases[trimmed]) return aliases[trimmed]
  if (aliases[trimmed.toLowerCase()]) return aliases[trimmed.toLowerCase()]

  let cleaned = trimmed.replace(/^[\s_.,#\-+:]+|[\s_.,#\-+:]+$/g, '').trim()
  if (!cleaned) return trimmed

  if (aliases[cleaned]) return aliases[cleaned]
  if (aliases[cleaned.toLowerCase()]) return aliases[cleaned.toLowerCase()]

  if (cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return cleaned
}

/**
 * Fetch stored alias mappings from localStorage
 * @returns {Record<string, string>} dictionary mapping rawName -> canonicalName
 */
export function getPersonAliases() {
  try {
    const raw = localStorage.getItem(ALIASES_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

/**
 * Save a new alias mapping rule (e.g., 'father_' -> 'Father')
 */
export function savePersonAlias(rawName, canonicalName) {
  if (!rawName || !canonicalName) return
  const cleanRaw = rawName.trim()
  const cleanCanonical = canonicalName.trim()
  if (!cleanRaw || !cleanCanonical || cleanRaw.toLowerCase() === cleanCanonical.toLowerCase()) return

  try {
    const aliases = getPersonAliases()
    aliases[cleanRaw] = cleanCanonical
    // also save lowercased key for case-insensitive matching
    aliases[cleanRaw.toLowerCase()] = cleanCanonical
    localStorage.setItem(ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

/**
 * Remove an existing alias rule
 */
export function removePersonAlias(rawName) {
  if (!rawName) return
  try {
    const aliases = getPersonAliases()
    delete aliases[rawName]
    delete aliases[rawName.trim()]
    delete aliases[rawName.toLowerCase()]
    localStorage.setItem(ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

/**
 * Clean & normalize a person name:
 * 1. Checks exact and case-insensitive saved aliases.
 * 2. Strips common prefixes like "for ", "my ", "to ", "from ", "mr. ", "mr ", "mrs. ", "ms. ".
 * 3. Strips trailing underscores, dashes, dots, and extra whitespace.
 * 4. Capitalizes words nicely (Title Case).
 */
export function normalizePersonName(rawName) {
  if (!rawName || typeof rawName !== 'string') return ''
  const trimmed = rawName.trim()
  if (!trimmed) return ''

  // 1. Check direct saved alias mapping
  const aliases = getPersonAliases()
  if (aliases[trimmed]) return aliases[trimmed]
  if (aliases[trimmed.toLowerCase()]) return aliases[trimmed.toLowerCase()]

  // 2. Strip prefix variations ("for ", "my ", "to ", "from ", "mr. ", "mr ", "mrs. ", "ms. ")
  let cleaned = trimmed
  const lower = cleaned.toLowerCase()
  const prefixes = ['for ', 'my ', 'to ', 'from ', 'mr. ', 'mr ', 'mrs. ', 'ms. ']
  for (const p of prefixes) {
    if (lower.startsWith(p)) {
      cleaned = cleaned.substring(p.length).trim()
      break
    }
  }

  // 3. Strip trailing special characters (punctuation, underscores, hyphens, dots)
  cleaned = cleaned.replace(/^[\s_.,#\-+:]+|[\s_.,#\-+:]+$/g, '').trim()

  if (!cleaned) return trimmed

  // Re-check alias mapping after cleaning prefix/punctuation
  if (aliases[cleaned]) return aliases[cleaned]
  if (aliases[cleaned.toLowerCase()]) return aliases[cleaned.toLowerCase()]

  // 4. Convert to Title Case if all lower/uppercase (e.g. "father" -> "Father", "RAHUL" -> "Rahul")
  if (cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase()) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return cleaned
}

/**
 * Compute key footprint for fuzzy similarity matching
 */
function getFootprintKey(name) {
  if (!name) return ''
  let str = name.toLowerCase().trim()
  // strip common prefixes
  const prefixes = ['for ', 'my ', 'to ', 'from ', 'mr. ', 'mr ', 'mrs. ', 'ms. ']
  for (const p of prefixes) {
    if (str.startsWith(p)) {
      str = str.substring(p.length).trim()
      break
    }
  }
  // strip punctuation, underscores, spaces
  return str.replace(/[^a-z0-9]/g, '')
}

/**
 * Scan expenses and lending data to find duplicate name clusters
 * e.g., groups ["Father", "father", "father_", "My father", "for Father"]
 * @returns {Array<{ footprint: string, canonical: string, names: string[], totalRecords: number }>}
 */
export function findDuplicatePersonCandidates(expenses = [], lending = []) {
  const nameCounts = new Map() // rawName -> count

  // Gather names from expenses forWhom
  expenses.forEach((e) => {
    const w = (e.forWhom || '').trim()
    if (w && w.toLowerCase() !== 'self' && w.toLowerCase() !== 'general') {
      nameCounts.set(w, (nameCounts.get(w) || 0) + 1)
    }
  })

  // Gather names from lending person
  lending.forEach((l) => {
    const p = (l.person || '').trim()
    if (p && p.toLowerCase() !== 'self') {
      nameCounts.set(p, (nameCounts.get(p) || 0) + 1)
    }
  })

  // Group by footprint key
  const clusters = new Map() // footprint -> { names: Set, count: number }

  for (const [name, count] of nameCounts.entries()) {
    const key = getFootprintKey(name)
    if (!key) continue

    if (!clusters.has(key)) {
      clusters.set(key, { names: new Set(), count: 0 })
    }
    const group = clusters.get(key)
    group.names.add(name)
    group.count += count
  }

  // Filter groups with > 1 distinct raw name (or candidates for merging)
  const candidateClusters = []

  for (const [footprint, data] of clusters.entries()) {
    const namesArr = Array.from(data.names)
    if (namesArr.length > 1) {
      // Pick best canonical name: most frequent or cleanest Title Case
      let canonical = namesArr[0]
      let maxCount = 0
      namesArr.forEach((n) => {
        const cnt = nameCounts.get(n) || 0
        const isNiceTitle = n === n.charAt(0).toUpperCase() + n.slice(1) && !n.includes('_')
        if (cnt > maxCount || (cnt === maxCount && isNiceTitle)) {
          maxCount = cnt
          canonical = n
        }
      })

      candidateClusters.push({
        footprint,
        canonical: normalizePersonName(canonical),
        names: namesArr.sort((a, b) => (nameCounts.get(b) || 0) - (nameCounts.get(a) || 0)),
        totalRecords: data.count,
      })
    }
  }

  return candidateClusters.sort((a, b) => b.totalRecords - a.totalRecords)
}

/**
 * Scan expenses data to find duplicate category clusters
 * e.g., groups ["Food", "food", "food_", "Food & Dining"]
 * @returns {Array<{ footprint: string, canonical: string, names: string[], totalRecords: number }>}
 */
export function findDuplicateCategoryCandidates(expenses = []) {
  const catCounts = new Map()

  expenses.forEach((e) => {
    const c = (e.category || '').trim()
    if (c) {
      catCounts.set(c, (catCounts.get(c) || 0) + 1)
    }
  })

  const clusters = new Map()

  for (const [cat, count] of catCounts.entries()) {
    const key = getFootprintKey(cat)
    if (!key) continue

    if (!clusters.has(key)) {
      clusters.set(key, { names: new Set(), count: 0 })
    }
    const group = clusters.get(key)
    group.names.add(cat)
    group.count += count
  }

  const candidateClusters = []

  for (const [footprint, data] of clusters.entries()) {
    const namesArr = Array.from(data.names)
    if (namesArr.length > 1) {
      let canonical = namesArr[0]
      let maxCount = 0
      namesArr.forEach((c) => {
        const cnt = catCounts.get(c) || 0
        const isNiceTitle = c === c.charAt(0).toUpperCase() + c.slice(1) && !c.includes('_')
        if (cnt > maxCount || (cnt === maxCount && isNiceTitle)) {
          maxCount = cnt
          canonical = c
        }
      })

      candidateClusters.push({
        footprint,
        canonical: normalizeCategoryName(canonical),
        names: namesArr.sort((a, b) => (catCounts.get(b) || 0) - (catCounts.get(a) || 0)),
        totalRecords: data.count,
      })
    }
  }

  return candidateClusters.sort((a, b) => b.totalRecords - a.totalRecords)
}

const BANK_ALIASES_STORAGE_KEY = 'wv_bank_entity_aliases'

export function getBankAliases() {
  try {
    const raw = localStorage.getItem(BANK_ALIASES_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

export function saveBankAlias(rawBank, canonicalBank) {
  if (!rawBank || !canonicalBank) return
  const cleanRaw = rawBank.trim()
  const cleanCanonical = canonicalBank.trim()
  if (!cleanRaw || !cleanCanonical || cleanRaw.toLowerCase() === cleanCanonical.toLowerCase()) return

  try {
    const aliases = getBankAliases()
    aliases[cleanRaw] = cleanCanonical
    aliases[cleanRaw.toLowerCase()] = cleanCanonical
    localStorage.setItem(BANK_ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

export function removeBankAlias(rawBank) {
  if (!rawBank) return
  try {
    const aliases = getBankAliases()
    delete aliases[rawBank]
    delete aliases[rawBank.trim()]
    delete aliases[rawBank.toLowerCase()]
    localStorage.setItem(BANK_ALIASES_STORAGE_KEY, JSON.stringify(aliases))
  } catch (e) {
    // quiet catch
  }
}

export function normalizeBankName(rawBank) {
  if (!rawBank || typeof rawBank !== 'string') return ''
  const trimmed = rawBank.trim()
  if (!trimmed) return ''

  const aliases = getBankAliases()
  if (aliases[trimmed]) return aliases[trimmed]
  if (aliases[trimmed.toLowerCase()]) return aliases[trimmed.toLowerCase()]

  let cleaned = trimmed.replace(/^[\s_.,#\-+:]+|[\s_.,#\-+:]+$/g, '').trim()
  if (!cleaned) return trimmed

  if (aliases[cleaned]) return aliases[cleaned]
  if (aliases[cleaned.toLowerCase()]) return aliases[cleaned.toLowerCase()]

  return cleaned
}

export function findDuplicateBankCandidates(bankRecords = []) {
  const bankCounts = new Map()

  bankRecords.forEach((b) => {
    const name = (b.bank || '').trim()
    if (name) {
      bankCounts.set(name, (bankCounts.get(name) || 0) + 1)
    }
  })

  const clusters = new Map()

  for (const [bName, count] of bankCounts.entries()) {
    const key = getFootprintKey(bName)
    if (!key) continue

    if (!clusters.has(key)) {
      clusters.set(key, { names: new Set(), count: 0 })
    }
    const group = clusters.get(key)
    group.names.add(bName)
    group.count += count
  }

  const candidateClusters = []

  for (const [footprint, data] of clusters.entries()) {
    const namesArr = Array.from(data.names)
    if (namesArr.length > 1) {
      let canonical = namesArr[0]
      let maxCount = 0
      namesArr.forEach((b) => {
        const cnt = bankCounts.get(b) || 0
        if (cnt > maxCount) {
          maxCount = cnt
          canonical = b
        }
      })

      candidateClusters.push({
        footprint,
        canonical: normalizeBankName(canonical),
        names: namesArr.sort((a, b) => (bankCounts.get(b) || 0) - (bankCounts.get(a) || 0)),
        totalRecords: data.count,
      })
    }
  }

  return candidateClusters.sort((a, b) => b.totalRecords - a.totalRecords)
}
