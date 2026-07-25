/**
 * pdfExtractor.js
 * Uses Google Gemini AI API to parse documents, bank statements, receipts, audio notes, & spreadsheets
 * (PDF, Images, Audio, CSV, Text, Excel) with a 10 MB file size limit, real-time progress callbacks,
 * multi-key API rotation, automatic rate-limit retry, and flexible data normalization.
 */

// Supported official active Gemini AI Studio models
const FLASH_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b',
]

export const MAX_PDF_SIZE_MB = 10
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024
export const PDF_RATE_LIMIT_HOURS = 24

/**
 * Helper to extract all valid Google Gemini API Keys from any text or string array
 * Matches standard Google API Key pattern starting with 'AIzaSy' (39 chars long)
 */
export function extractValidGeminiKeys(input) {
  if (!input) return []
  const str = Array.isArray(input) ? input.join('\n') : String(input)
  const matches = str.match(/AIzaSy[A-Za-z0-9_-]{33}/g) || []
  return Array.from(new Set(matches))
}

/**
 * Get available Gemini API Keys (App Config + Custom Local Keys + Env Keys + Fallbacks)
 * Automatically aggregates multiple keys for seamless failover & rotation!
 */
export function getGeminiApiKeys() {
  const keysSet = new Set()

  // 1. User/Admin local custom keys (single key or multiple keys text)
  const localKeys1 = localStorage.getItem('wv_custom_gemini_api_keys')
  const localKeys2 = localStorage.getItem('wv_custom_gemini_api_key')
  extractValidGeminiKeys(localKeys1).forEach((k) => keysSet.add(k))
  extractValidGeminiKeys(localKeys2).forEach((k) => keysSet.add(k))

  // 2. Admin configured keys from appConfig (cached in localStorage)
  const adminKeys = localStorage.getItem('wv_admin_gemini_api_keys')
  extractValidGeminiKeys(adminKeys).forEach((k) => keysSet.add(k))

  try {
    const cachedConfigStr = localStorage.getItem('wv_cached_app_config') || '{}'
    const cachedConfig = JSON.parse(cachedConfigStr)
    if (cachedConfig?.geminiApiKeys) {
      extractValidGeminiKeys(cachedConfig.geminiApiKeys).forEach((k) => keysSet.add(k))
    }
  } catch (e) {}

  // 4. Environment variables fallback
  const envKeys1 = import.meta.env.VITE_GEMINI_API_KEYS
  const envKeys2 = import.meta.env.VITE_GEMINI_API_KEY
  extractValidGeminiKeys(envKeys1).forEach((k) => keysSet.add(k))
  extractValidGeminiKeys(envKeys2).forEach((k) => keysSet.add(k))

  return Array.from(keysSet)
}

/**
 * Check if user is allowed to perform a document statement import.
 */
export function checkPdfRateLimit(isAdmin = false) {
  if (isAdmin) return { allowed: true }

  const lastImportTimeStr = localStorage.getItem('wv_last_pdf_import_time')
  if (!lastImportTimeStr) return { allowed: true }

  const lastTime = parseInt(lastImportTimeStr, 10)
  if (isNaN(lastTime)) return { allowed: true }

  const now = Date.now()
  const elapsedMs = now - lastTime
  const limitMs = PDF_RATE_LIMIT_HOURS * 60 * 60 * 1000

  if (elapsedMs < limitMs) {
    const remainingMs = limitMs - elapsedMs
    const hours = Math.floor(remainingMs / (1000 * 60 * 60))
    const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60))

    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    return {
      allowed: false,
      reason: `⏳ Rate Limit: Only 1 AI document import is allowed within 24 hours for standard accounts. Please try again in ${timeString}.`,
      remainingHours: hours,
      remainingMinutes: minutes,
    }
  }

  return { allowed: true }
}

export function recordPdfImportSuccess() {
  localStorage.setItem('wv_last_pdf_import_time', String(Date.now()))
}

/**
 * Auto-converts extracted JSON items to standard CSV format and triggers a file download to phone/device.
 */
export function downloadConvertedCsv(items, sourceFileName = 'statement', mode = 'bank') {
  if (!Array.isArray(items) || items.length === 0) return null

  let csvContent = '\uFEFF' // UTF-8 BOM for Excel compatibility
  function escapeCSV(val) {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  if (mode === 'bank') {
    csvContent += 'Date,Bank,Description,Debit,Credit,Balance\n'
    items.forEach(b => {
      const dStr = b.date ? (b.date instanceof Date ? b.date.toISOString().slice(0, 10) : String(b.date).slice(0, 10)) : ''
      csvContent += [
        escapeCSV(dStr),
        escapeCSV(b.bank || ''),
        escapeCSV(b.description || ''),
        escapeCSV(b.debit || 0),
        escapeCSV(b.credit || 0),
        escapeCSV(b.balance || 0)
      ].join(',') + '\n'
    })
  } else if (mode === 'expense') {
    csvContent += 'Date,Category,For Whom,Details,Amount,Payment Mode,Remarks\n'
    items.forEach(e => {
      const dStr = e.date ? (e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10)) : ''
      csvContent += [
        escapeCSV(dStr),
        escapeCSV(e.category || ''),
        escapeCSV(e.forWhom || ''),
        escapeCSV(e.details || ''),
        escapeCSV(e.amount || 0),
        escapeCSV(e.paymentMode || ''),
        escapeCSV(e.remarks || '')
      ].join(',') + '\n'
    })
  } else if (mode === 'lending') {
    csvContent += 'Date,Type,Person,Amount,Remarks\n'
    items.forEach(l => {
      const dStr = l.date ? (l.date instanceof Date ? l.date.toISOString().slice(0, 10) : String(l.date).slice(0, 10)) : ''
      csvContent += [
        escapeCSV(dStr),
        escapeCSV(l.type || ''),
        escapeCSV(l.person || ''),
        escapeCSV(l.amount || 0),
        escapeCSV(l.remarks || '')
      ].join(',') + '\n'
    })
  }

  const cleanBaseName = (sourceFileName || 'statement').replace(/\.[^/.]+$/, "")
  const todayStr = new Date().toISOString().slice(0, 10)
  const outName = `WalletVibe_Converted_${cleanBaseName}_${todayStr}.csv`

  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.warn('Auto CSV download trigger failed:', err)
  }

  return { csvContent, outName }
}

/**
 * Saves AI-converted statement in local device cache to prevent re-parsing & save AI credits / Firebase quota.
 */
export function saveConvertedStatementToCache(fileName, items, csvContent, mode = 'bank') {
  try {
    const existingJson = localStorage.getItem('wv_cached_ai_converted_statements') || '[]'
    let cacheList = JSON.parse(existingJson)
    if (!Array.isArray(cacheList)) cacheList = []

    // Deduplicate if same file converted recently
    cacheList = cacheList.filter(c => c.fileName !== fileName)

    const newItem = {
      id: `ai_conv_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      fileName,
      mode,
      convertedDate: new Date().toISOString(),
      recordCount: items.length,
      csvContent,
      items
    }

    cacheList.unshift(newItem)
    if (cacheList.length > 20) cacheList = cacheList.slice(0, 20)

    localStorage.setItem('wv_cached_ai_converted_statements', JSON.stringify(cacheList))
    return newItem
  } catch (err) {
    console.warn('Cache save failed:', err)
    return null
  }
}

export function getCachedConvertedStatements() {
  try {
    const existingJson = localStorage.getItem('wv_cached_ai_converted_statements') || '[]'
    const cacheList = JSON.parse(existingJson)
    return Array.isArray(cacheList) ? cacheList : []
  } catch {
    return []
  }
}

export function deleteCachedConvertedStatement(id) {
  try {
    const list = getCachedConvertedStatements().filter(c => c.id !== id)
    localStorage.setItem('wv_cached_ai_converted_statements', JSON.stringify(list))
    return list
  } catch {
    return []
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const base64 = dataUrl.split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

function getMimeType(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.heic')) return 'image/heic'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.mp3')) return 'audio/mp3'
  if (name.endsWith('.wav')) return 'audio/wav'
  if (name.endsWith('.m4a')) return 'audio/m4a'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  if (name.endsWith('.flac')) return 'audio/flac'
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.txt')) return 'text/plain'
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'

  return file.type || 'application/pdf'
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalizes JSON response from AI into consistent transaction format
 */
function normalizeExtractedItems(rawResult, mode) {
  let list = rawResult
  if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
    list = rawResult.transactions || rawResult.data || rawResult.items || rawResult.records || []
  }

  if (!Array.isArray(list)) return []

  return list.map((item) => {
    // Flexible Field Normalization
    const dateRaw = item.date || item.txnDate || item.transactionDate || item.Date || new Date().toISOString().split('T')[0]
    
    // Amount extraction
    let amt = parseFloat(item.amount || item.amt || item.value || item.Amount) || 0
    let debit = parseFloat(item.debit || item.Debit || item.withdrawal || item.Withdrawal) || 0
    let credit = parseFloat(item.credit || item.Credit || item.deposit || item.Deposit) || 0

    if (!debit && !credit && amt) {
      const typeStr = (item.type || item.typeStr || '').toLowerCase()
      if (typeStr.includes('debit') || typeStr.includes('dr') || typeStr.includes('out') || typeStr.includes('expense')) {
        debit = amt
      } else {
        credit = amt
      }
    }

    const desc = item.description || item.details || item.narration || item.particulars || item.remarks || item.Description || 'Transaction'
    const bank = item.bank || item.bankName || item.institution || item.Bank || 'Bank'
    const category = item.category || item.Category || 'General'
    const forWhom = item.forWhom || item.ForWhom || item.person || 'Self'
    const paymentMode = item.paymentMode || item.PaymentMode || 'Online/UPI'
    const remarks = item.remarks || item.Remarks || ''
    const person = item.person || item.Person || 'Person'
    const type = (item.type || item.Type || 'Lent').toLowerCase().includes('borrow') ? 'Borrowed' : 'Lent'
    const balance = parseFloat(item.balance || item.Balance) || 0

    if (mode === 'expense') {
      return {
        date: dateRaw,
        amount: amt || debit || credit,
        category,
        forWhom,
        details: desc,
        paymentMode,
        remarks,
      }
    } else if (mode === 'lending') {
      return {
        date: dateRaw,
        amount: amt || debit || credit,
        person,
        type,
        remarks: desc || remarks,
        isSettled: Boolean(item.isSettled),
      }
    } else {
      return {
        date: dateRaw,
        bank,
        description: desc,
        debit: debit || (amt && !credit ? amt : 0),
        credit: credit || (amt && !debit ? amt : 0),
        balance,
      }
    }
  })
}

export async function parsePdfWithGemini(file, mode = 'expense', onProgress = null, isAdmin = false) {
  if (!file) throw new Error('No file provided.')

  // Check 24-hour rate limit
  const rateLimitStatus = checkPdfRateLimit(isAdmin)
  if (!rateLimitStatus.allowed) {
    throw new Error(rateLimitStatus.reason)
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    const actualMB = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`File size (${actualMB} MB) exceeds the 10 MB limit. Please select a smaller file.`)
  }

  const mimeType = getMimeType(file)
  onProgress?.(`Step 1/3: Validating & encoding ${file.name.split('.').pop().toUpperCase()} file...`, 15)
  const base64Data = await fileToBase64(file)

  let systemPrompt = ''
  if (mode === 'expense') {
    systemPrompt = `Analyze this document/receipt/statement/sheet. Extract all expense records into a JSON array:
[
  {
    "date": "YYYY-MM-DD",
    "amount": number,
    "category": "string (e.g. Food & Drinks, Bills & Utility, Shopping, Fuel, Medical, Salary, General)",
    "forWhom": "string",
    "details": "string",
    "paymentMode": "string",
    "remarks": "string"
  }
]
Return ONLY raw JSON without markdown or markdown code fences.`
  } else if (mode === 'lending') {
    systemPrompt = `Analyze this document/statement/sheet. Extract all lend/borrow transactions into a JSON array:
[
  {
    "date": "YYYY-MM-DD",
    "amount": number,
    "person": "string",
    "type": "Lent" or "Borrowed",
    "remarks": "string",
    "isSettled": boolean
  }
]
Return ONLY raw JSON without markdown or markdown code fences.`
  } else if (mode === 'bank') {
    systemPrompt = `Analyze this bank statement/passbook/receipt document. Extract ALL bank transactions into a JSON array:
[
  {
    "date": "YYYY-MM-DD",
    "bank": "string (e.g. HDFC Bank, SBI, ICICI, J&K BANK)",
    "description": "string (particulars/narration)",
    "debit": number,
    "credit": number,
    "balance": number
  }
]
Return ONLY raw JSON without markdown or markdown code fences.`
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
  }

  const apiKeys = getGeminiApiKeys()
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('⚠️ No Gemini AI API Key configured. Please add your free Gemini AI API Key(s) in Admin Panel or Settings Modal to enable document parsing.')
  }

  let lastError = null
  let rateLimitErrorOccurred = false

  onProgress?.(`Step 2/3: Rotating across ${apiKeys.length} Gemini AI API key(s)...`, 35)

  // Try across API keys & Flash models until one succeeds
  let keyIndex = 0
  for (const apiKey of apiKeys) {
    keyIndex++
    for (const modelName of FLASH_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

      onProgress?.(`AI Extraction via Key #${keyIndex} of ${apiKeys.length} (${modelName})...`, 55)

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (!response.ok) {
            const errText = await response.text()
            if (response.status === 429) {
              rateLimitErrorOccurred = true
              if (attempt === 1) {
                await delay(1500)
                continue
              }
            }
            lastError = new Error(`Gemini AI (${modelName}) [${response.status}]: ${errText || response.statusText}`)
            break
          }

          onProgress?.('Step 3/3: Normalizing & building preview checklist...', 90)

          const result = await response.json()
          const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

          if (!rawText.trim()) {
            throw new Error(`Gemini AI (${modelName}) returned empty response.`)
          }

          const cleanedJson = rawText
            .replace(/```json/gi, '')
            .replace(/```/gi, '')
            .trim()

          const parsedData = JSON.parse(cleanedJson)
          const items = normalizeExtractedItems(parsedData, mode)

          if (!items || items.length === 0) {
            throw new Error('No valid transactions detected in document.')
          }

          if (!isAdmin) {
            recordPdfImportSuccess()
          }

          // Auto-download converted CSV file to user's phone/device & save in local cache
          const { csvContent } = downloadConvertedCsv(items, file.name, mode) || {}
          if (csvContent) {
            saveConvertedStatementToCache(file.name, items, csvContent, mode)
          }

          onProgress?.('Extraction completed & saved as CSV to device!', 100)
          return items
        } catch (err) {
          lastError = err
        }
      }
    }
  }

  if (rateLimitErrorOccurred) {
    throw new Error('⚡ Google Gemini AI Quota Limit Exceeded (429). The free tier per-minute request limit was reached. You can add your custom API Key in App Settings to bypass limits!')
  }

  throw lastError || new Error('Failed to extract data using Gemini Flash models.')
}
