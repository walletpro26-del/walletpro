/**
 * csvRateLimit.js
 * Tracks and enforces CSV import rate limits for non-admin users.
 * Limit: Max 3 CSV imports per day AND max 3 CSV imports per month.
 * Admin users are exempt (unlimited CSV imports).
 */

export function getCsvImportStats() {
  try {
    const raw = localStorage.getItem('wv_csv_import_timestamps')
    const timestamps = raw ? JSON.parse(raw) : []
    if (!Array.isArray(timestamps)) return { todayCount: 0, monthCount: 0, total: 0 }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const currentDateStr = now.toDateString()

    const todayCount = timestamps.filter((ts) => {
      const d = new Date(ts)
      return d.toDateString() === currentDateStr
    }).length

    const monthCount = timestamps.filter((ts) => {
      const d = new Date(ts)
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth
    }).length

    return { todayCount, monthCount, total: timestamps.length }
  } catch (e) {
    return { todayCount: 0, monthCount: 0, total: 0 }
  }
}

export function checkCsvRateLimit(isAdmin = false) {
  if (isAdmin) {
    return { allowed: true, isAdmin: true, todayCount: 0, monthCount: 0 }
  }

  const { todayCount, monthCount } = getCsvImportStats()

  if (todayCount >= 3) {
    return {
      allowed: false,
      reason: `🚫 Daily CSV Import Limit Reached: Standard accounts are limited to 3 CSV imports per day (used ${todayCount}/3 today). Admin accounts have unlimited access.`,
      todayCount,
      monthCount,
    }
  }

  if (monthCount >= 3) {
    return {
      allowed: false,
      reason: `🚫 Monthly CSV Import Limit Reached: Standard accounts are limited to 3 CSV imports per month (used ${monthCount}/3 this month). Admin accounts have unlimited access.`,
      todayCount,
      monthCount,
    }
  }

  return { allowed: true, todayCount, monthCount }
}

export function recordCsvImportSuccess() {
  try {
    const raw = localStorage.getItem('wv_csv_import_timestamps')
    let timestamps = raw ? JSON.parse(raw) : []
    if (!Array.isArray(timestamps)) timestamps = []

    timestamps.push(Date.now())

    // Prune timestamps older than 60 days to keep localStorage clean
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
    timestamps = timestamps.filter((ts) => typeof ts === 'number' && ts > sixtyDaysAgo)

    localStorage.setItem('wv_csv_import_timestamps', JSON.stringify(timestamps))
  } catch (e) {
    // quiet catch
  }
}
