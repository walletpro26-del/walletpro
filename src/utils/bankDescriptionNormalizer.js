/**
 * bankDescriptionNormalizer.js
 *
 * Normalizes raw bank transaction description strings across major Indian bank formats
 * (UPI, SBI WDL TFR, IMPS, NEFT, RTGS, CWDR/ATM, POS, CHQ) into structured JSON tokens:
 *
 * Example 1 (J&K / YESB): "UPI/YESB/657305676228/DR/Google Cloud /P2M"
 * Output: { channel: "UPI", bank: "YESB", reference: "657305676228", merchant: "google cloud", type: "P2M", ... }
 *
 * Example 2 (SBI Multi-line): "WDL TFR\nUPI/DR/395104798731/Sheikh G/jaka/01 76040100/Sent 0097693162093 AT 01478 ANANTNAG"
 * Output: { channel: "UPI", bank: "SBI", reference: "395104798731", merchant: "sheikh g", type: "WDL TFR", ... }
 */

export function extractValidReferenceNumber(raw) {
  if (!raw) return ''
  // Clean multi-line breaks to spaces
  const s = String(raw).replace(/[\r\n]+/g, ' ').trim()
  const sUpper = s.toUpperCase()

  // Ignore bank account numbers & interest payout narrations (e.g. 0176040100003271:Int.Pd:03-05-15)
  if (sUpper.includes('INT.PD') || sUpper.includes('INTEREST') || sUpper.includes('A/C') || sUpper.includes('ACCT')) {
    return ''
  }

  // UPI 12-digit RRN / Ref Number pattern (e.g. 657305676228, 395104798731, 298008229749)
  const upiMatch = s.match(/\b\d{12}\b/)
  if (upiMatch) return upiMatch[0]

  // Generic 6-18 digit number, ignoring static account prefixes like 0176 or 0000
  const matches = s.match(/\b\d{6,18}\b/g) || []
  for (const m of matches) {
    if (!m.startsWith('0000') && !m.startsWith('0176')) {
      return m
    }
  }
  return ''
}

export function normalizeBankDescription(description, amount = 0, date = '') {
  if (!description) {
    return { channel: '', bank: '', reference: '', merchant: '', type: '', amount: 0, date: '' }
  }

  // Replace multi-line breaks with spaces so the entire description is processed as one continuous line
  const raw = String(description).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  const rawUpper = raw.toUpperCase()

  // 1. UPI Standard Slash & SBI WDL TFR Pattern: UPI/... or WDL TFR UPI/...
  if (rawUpper.includes('UPI/') || rawUpper.includes('/UPI/')) {
    const reference = extractValidReferenceNumber(raw)
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean)
    const upiIdx = parts.findIndex((p) => p.toUpperCase().includes('UPI'))

    let bank = ''
    if (upiIdx !== -1 && parts[upiIdx + 1] && parts[upiIdx + 1].length <= 6 && !['DR', 'CR', reference].includes(parts[upiIdx + 1].toUpperCase())) {
      bank = parts[upiIdx + 1].toUpperCase()
    } else if (rawUpper.includes('SBI')) {
      bank = 'SBI'
    }

    const type = parts.find((p) => ['P2M', 'P2P', 'P2A'].includes(p.toUpperCase())) || (rawUpper.includes('WDL TFR') ? 'WDL TFR' : '')
    const drCr = parts.find((p) => ['DR', 'CR'].includes(p.toUpperCase())) || (rawUpper.includes('DR') ? 'DR' : 'CR')

    const excludeSet = new Set(['UPI', 'WDL', 'TFR', 'WDL TFR', bank, reference, type, drCr, 'BY', 'TO', 'FOR', 'PAYMENT', 'TRANSFER', 'SENT', 'AT'])
    const merchantParts = parts.filter((p) => !excludeSet.has(p.toUpperCase()) && !/^\d+$/.test(p))
    const merchant = merchantParts.join(' ').toLowerCase().trim()

    return {
      channel: 'UPI',
      bank,
      reference,
      merchant: merchant || raw.toLowerCase(),
      type: type || drCr,
      amount: parseFloat(amount) || 0,
      date: String(date || '').trim()
    }
  }

  // 2. ATM / CWDR Pattern: CWDR/000000258265/19-MAR-15
  if (rawUpper.includes('CWDR') || rawUpper.includes('ATM-WDR')) {
    const reference = extractValidReferenceNumber(raw)
    return {
      channel: 'ATM',
      bank: '',
      reference,
      merchant: 'cash withdrawal',
      type: 'CWDR',
      amount: parseFloat(amount) || 0,
      date: String(date || '').trim()
    }
  }

  // 3. IMPS / NEFT / RTGS Pattern: IMPS/618381893325/Ajmeri/HDFC
  if (rawUpper.includes('IMPS') || rawUpper.includes('NEFT') || rawUpper.includes('RTGS')) {
    const channel = rawUpper.includes('IMPS') ? 'IMPS' : (rawUpper.includes('NEFT') ? 'NEFT' : 'RTGS')
    const reference = extractValidReferenceNumber(raw)
    const parts = raw.split(/[-/]/).map((p) => p.trim()).filter(Boolean)
    const excludeSet = new Set([channel, reference, 'BY', 'TO', 'FOR', 'TRANSFER', 'PAYMENT'])
    const merchantParts = parts.filter((p) => !excludeSet.has(p.toUpperCase()) && !/^\d+$/.test(p))
    const merchant = merchantParts.join(' ').toLowerCase().trim()

    return {
      channel,
      bank: '',
      reference,
      merchant: merchant || raw.toLowerCase(),
      type: channel,
      amount: parseFloat(amount) || 0,
      date: String(date || '').trim()
    }
  }

  // 4. POS / Card Swipe Pattern: POS 491024 AMZN Mktp IN
  if (rawUpper.startsWith('POS ') || rawUpper.includes('CARD SWIPE')) {
    const reference = extractValidReferenceNumber(raw)
    const cleanMerchant = raw.replace(/^POS\s+\d+/i, '').replace(/card swipe/i, '').trim().toLowerCase()
    return {
      channel: 'POS',
      bank: '',
      reference,
      merchant: cleanMerchant || raw.toLowerCase(),
      type: 'POS',
      amount: parseFloat(amount) || 0,
      date: String(date || '').trim()
    }
  }

  // 5. Generic Fallback
  const reference = extractValidReferenceNumber(raw)
  const cleanWords = raw.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['transfer', 'payment', 'bank', 'ltd', 'pvt', 'dr', 'cr', 'cwdr', 'wdl', 'tfr', 'int', 'pd'].includes(w) && !/^\d+$/.test(w))

  return {
    channel: 'GENERIC',
    bank: '',
    reference,
    merchant: cleanWords.join(' '),
    type: '',
    amount: parseFloat(amount) || 0,
    date: String(date || '').trim()
  }
}
