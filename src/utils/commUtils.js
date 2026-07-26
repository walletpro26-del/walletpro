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

/**
 * Generate WhatsApp-formatted message (uses WhatsApp markdown bold/italic/bullet syntax)
 */
export function generateLendingMessageWhatsApp(item) {
  const dateStr = item?.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const amountStr = `₹${Number(item?.amount || 0).toLocaleString('en-IN')}`
  const type = item?.type || item?.label || item?.lendType || 'Lend'
  const person = item?.person || 'Friend'
  const remarks = item?.remarks ? `\n💬 *Remarks:* ${item.remarks}` : ''

  if (type === 'Lend' || type === 'OUT') {
    return `Hi *${person}* 👋\n\nRegarding our record on *WalletVibe*:\nI gave *${amountStr}* to you on _${dateStr}_.${remarks}\n\n📲 _Sent via WalletVibe App_`
  } else if (type === 'Borrow') {
    return `Hi *${person}* 👋\n\nRegarding our record on *WalletVibe*:\nI borrowed *${amountStr}* from you on _${dateStr}_.${remarks}\n\n📲 _Sent via WalletVibe App_`
  } else if (type === 'They Return') {
    return `Hi *${person}* 👋\n\nPayment entry of *${amountStr}* returned to me on _${dateStr}_ has been updated on *WalletVibe*.${remarks}\n\n📲 _Sent via WalletVibe App_`
  } else if (type === 'I Return') {
    return `Hi *${person}* 👋\n\nPayment entry of *${amountStr}* returned to you on _${dateStr}_ has been updated on *WalletVibe*.${remarks}\n\n📲 _Sent via WalletVibe App_`
  } else if (type === 'Forgive') {
    return `Hi *${person}* 👋\n\nRecord of *${amountStr}* on _${dateStr}_ on *WalletVibe* has been written off / forgiven.`
  } else {
    return `Hi *${person}* 👋\n\nRegarding our record on *WalletVibe*:\nAmount: *${amountStr}* | Date: _${dateStr}_${remarks}`
  }
}

/**
 * Generate Email-formatted text message (formal multi-line structured layout)
 */
export function generateLendingMessageEmail(item) {
  const dateStr = item?.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const amountStr = `₹${Number(item?.amount || 0).toLocaleString('en-IN')}`
  const type = item?.type || item?.label || item?.lendType || 'Lend'
  const person = item?.person || 'Friend'
  const remarks = item?.remarks ? `\n• Remarks: ${item.remarks}` : ''

  return `Dear ${person},

This is an automated ledger notification regarding a record updated on WalletVibe:

• Transaction Type: ${type}
• Amount: ${amountStr}
• Date: ${dateStr}${remarks}

You can track all your shared ledgers and personal finances anytime at:
https://walletvibe.netlify.app

Regards,
WalletVibe Personal Finance`
}

export function generateLendingMessage(item) {
  return generateLendingMessageWhatsApp(item)
}

export function openWhatsApp(phone, item) {
  const cleanPhone = cleanPhoneNumber(phone || item?.mobileNo || item?.phone)
  if (!cleanPhone) {
    alert('Please enter or provide a valid mobile number first!')
    return
  }
  const msg = generateLendingMessageWhatsApp(item)
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
  const subject = `WalletVibe Ledger Update: ${person} — ${amountStr}`
  const body = generateLendingMessageEmail(item)
  const url = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_self')
}

/**
 * Generate a WhatsApp summary message for all transactions with a person
 */
export function generatePersonSummaryMessageWhatsApp(person, data, normalizeFn) {
  const lines = [`*WalletVibe — Ledger Summary for ${person}*`]
  const netAmtStr = `₹${Math.abs(data.net).toLocaleString('en-IN')}`
  const netStatusStr = data.net >= 0 ? '*Receivable (You will get)*' : '*Payable (You need to pay)*'
  lines.push(`💰 *Net Balance:* ${netAmtStr} ${netStatusStr}`)
  lines.push('')
  lines.push('📋 *Transaction History:*')
  
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
      const remarks = item.remarks ? ` (_${item.remarks}_)` : ''
      lines.push(`${i + 1}. *${dateStr}* | ${typeText} | *₹${Number(item.amount).toLocaleString('en-IN')}*${remarks}`)
    })

  lines.push('')
  lines.push('📲 _Sent via WalletVibe Personal Finance_')
  return lines.join('\n')
}

/**
 * Generate an Email summary message for all transactions with a person
 */
export function generatePersonSummaryMessageEmail(person, data, normalizeFn) {
  const lines = [`Dear ${person},`, '']
  const netAmtStr = `₹${Math.abs(data.net).toLocaleString('en-IN')}`
  const netStatusStr = data.net >= 0 ? 'Receivable (You will get)' : 'Payable (You need to pay)'
  lines.push(`Please find your consolidated account statement summary from WalletVibe below:`)
  lines.push('')
  lines.push(`• Person / Account: ${person}`)
  lines.push(`• Net Outstanding Balance: ${netAmtStr} (${netStatusStr})`)
  lines.push('')
  lines.push('Detailed Transactions:')
  lines.push('--------------------------------------------------')
  
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
      const remarks = item.remarks ? ` | Remarks: ${item.remarks}` : ''
      lines.push(`${i + 1}. ${dateStr} | ${typeText} | ₹${Number(item.amount).toLocaleString('en-IN')}${remarks}`)
    })

  lines.push('--------------------------------------------------')
  lines.push('')
  lines.push('Track your transactions anytime on WalletVibe: https://walletvibe.netlify.app')
  lines.push('')
  lines.push('Regards,')
  lines.push('WalletVibe Personal Finance')
  return lines.join('\n')
}

export function generatePersonSummaryMessage(person, data, normalizeFn) {
  return generatePersonSummaryMessageWhatsApp(person, data, normalizeFn)
}

export function openWhatsAppPerson(phone, person, data, normalizeFn) {
  const cleanPhone = cleanPhoneNumber(phone)
  if (!cleanPhone) {
    alert('No mobile number available for this person.')
    return
  }
  const msg = generatePersonSummaryMessageWhatsApp(person, data, normalizeFn)
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openEmailPerson(emailAddress, person, data, normalizeFn) {
  if (!emailAddress || !emailAddress.includes('@')) {
    alert('No email address available for this person.')
    return
  }
  const amtStr = `₹${Math.abs(data.net).toLocaleString('en-IN')}`
  const subject = `WalletVibe Ledger Statement: ${person} — Net ${data.net >= 0 ? 'Receivable' : 'Payable'} ${amtStr}`
  const body = generatePersonSummaryMessageEmail(person, data, normalizeFn)
  const url = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_self')
}
