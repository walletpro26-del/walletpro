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
 * Get available Gemini API Keys (custom key + env key)
 */
export function getGeminiApiKeys() {
  const keys = []
  const customKey = localStorage.getItem('wv_custom_gemini_api_key')
  if (customKey && customKey.trim().startsWith('AIzaSy')) {
    keys.push(customKey.trim())
  }
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyBsdYsWG-1eRUAOT5XPFl9AqHSPY9D636c'
  if (envKey && !keys.includes(envKey.trim())) {
    keys.push(envKey.trim())
  }
  return keys
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
  let lastError = null
  let rateLimitErrorOccurred = false

  onProgress?.('Step 2/3: Connecting to Gemini AI Flash models...', 35)

  // Try across API keys & Flash models until one succeeds
  for (const apiKey of apiKeys) {
    for (const modelName of FLASH_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`

      onProgress?.(`Extracting via ${modelName}...`, 55)

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

          onProgress?.('Extraction completed successfully!', 100)
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
