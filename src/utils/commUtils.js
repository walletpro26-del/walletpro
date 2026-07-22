/**
 * Utility functions for Mobile & Email communications in Lend/Borrow transactions
 */

export function cleanPhoneNumber(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return '91' + digits
  return digits
}

export function getPersonContactMap(allLending = []) {
  const map = {}
  if (!Array.isArray(allLending)) return map
  // Sort ascending by date so newer entries overwrite older ones
  const sorted = [...allLending].sort((a, b) => new Date(a.date) - new Date(b.date))
  sorted.forEach((item) => {
    if (!item.person) return
    const pKey = item.person.trim().toLowerCase()
    if (!map[pKey]) map[pKey] = { mobileNo: '', email: '' }
    if (item.mobileNo || item.phone) map[pKey].mobileNo = item.mobileNo || item.phone
    if (item.email) map[pKey].email = item.email
  })
  return map
}

export function getEffectiveContact(item, personContactMap = {}) {
  if (!item) return { mobileNo: '', email: '' }
  const pKey = (item.person || '').trim().toLowerCase()
  const mapContact = personContactMap[pKey] || {}
  
  return {
    mobileNo: item.mobileNo || item.phone || mapContact.mobileNo || '',
    email: item.email || mapContact.email || '',
  }
}

export function generateLendingMessage(item) {
  const dateStr = item?.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const amountStr = `₹${Number(item?.amount || 0).toLocaleString('en-IN')}`
  const type = item?.type || item?.label || item?.lendType || 'Lend'
  const person = item?.person || 'Friend'
  const remarks = item?.remarks ? ` (Remarks: ${item.remarks})` : ''

  if (type === 'Lend' || type === 'OUT') {
    return `Hi ${person}, regarding our record on WalletVibe: I have given ${amountStr} to you on ${dateStr}${remarks}.`
  } else if (type === 'Borrow') {
    return `Hi ${person}, regarding our record on WalletVibe: I borrowed ${amountStr} from you on ${dateStr}${remarks}.`
  } else if (type === 'They Return') {
    return `Hi ${person}, payment entry of ${amountStr} returned to me on ${dateStr} has been updated in WalletVibe${remarks}.`
  } else if (type === 'I Return') {
    return `Hi ${person}, payment entry of ${amountStr} returned to you on ${dateStr} has been updated in WalletVibe${remarks}.`
  } else if (type === 'Forgive') {
    return `Hi ${person}, record of ${amountStr} on ${dateStr} on WalletVibe has been written off / forgiven.`
  } else {
    return `Hi ${person}, record of ${amountStr} on ${dateStr} on WalletVibe${remarks}.`
  }
}

export function openWhatsApp(phone, item) {
  const cleanPhone = cleanPhoneNumber(phone || item?.mobileNo || item?.phone)
  if (!cleanPhone) {
    alert('Please enter or provide a valid mobile number first!')
    return
  }
  const msg = generateLendingMessage(item)
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openEmail(emailAddress, item) {
  const targetEmail = emailAddress || item?.email
  if (!targetEmail || !targetEmail.includes('@')) {
    alert('Please enter or provide a valid email address first!')
    return
  }
  const person = item?.person || 'Friend'
  const amountStr = `₹${Number(item?.amount || 0).toLocaleString('en-IN')}`
  const subject = `WalletVibe Record: ${person} - ${amountStr}`
  const body = generateLendingMessage(item)
  const url = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_self')
}

/**
 * Generate a summary message for all transactions with a person
 */
export function generatePersonSummaryMessage(person, data, normalizeFn) {
  const lines = [`WalletVibe — Ledger Summary for ${person}`]
  lines.push(`Net Balance: ₹${Math.abs(data.net).toLocaleString('en-IN')} ${data.net >= 0 ? '(Receivable)' : '(Payable)'}`)
  lines.push('')
  lines.push('Transactions:')
  
  data.items
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((item, i) => {
      const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
      const norm = normalizeFn ? normalizeFn(item.type) : item.type
      let typeText = item.type
      if (norm === 'LEND') typeText = 'Loan Given'
      else if (norm === 'BORROW') typeText = 'Borrowed'
      else if (norm === 'THEY_RETURN') typeText = 'Received Return'
      else if (norm === 'I_RETURN') typeText = 'I Returned'
      else if (norm === 'FORGIVE') typeText = 'Forgiven'
      const remarks = item.remarks ? ` — ${item.remarks}` : ''
      lines.push(`${i + 1}. ${dateStr} | ${typeText} | ₹${Number(item.amount).toLocaleString('en-IN')}${remarks}`)
    })

  lines.push('')
  lines.push('— Sent from WalletVibe')
  return lines.join('\n')
}

export function openWhatsAppPerson(phone, person, data, normalizeFn) {
  const cleanPhone = cleanPhoneNumber(phone)
  if (!cleanPhone) {
    alert('No mobile number available for this person.')
    return
  }
  const msg = generatePersonSummaryMessage(person, data, normalizeFn)
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openEmailPerson(emailAddress, person, data, normalizeFn) {
  if (!emailAddress || !emailAddress.includes('@')) {
    alert('No email address available for this person.')
    return
  }
  const amtStr = `₹${Math.abs(data.net).toLocaleString('en-IN')}`
  const subject = `WalletVibe Ledger Summary: ${person} — Net ${data.net >= 0 ? 'Receivable' : 'Payable'} ${amtStr}`
  const body = generatePersonSummaryMessage(person, data, normalizeFn)
  const url = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_self')
}
