import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { cleanPhoneNumber, generateLendingMessage, generatePersonSummaryMessage } from './commUtils'

/**
 * Generate a PDF document for a single transaction (Expense or Lend/Borrow)
 */
export function generateSingleTxnPDF(item) {
  const doc = new jsPDF()
  const isLend = item.isLend || item.sheet === 'lending'
  const personOrCategory = isLend ? (item.person || 'Person') : (item.category || 'Expense')
  const amountStr = `Rs.${Number(item.amount || 0).toLocaleString('en-IN')}`
  const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN')

  // Header Banner
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 40, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('WalletVibe', 14, 22)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text('Transaction Receipt & Voucher', 14, 30)

  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 196, 25, { align: 'right' })

  // Amount Box
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 48, 182, 32, 4, 4, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, 48, 182, 32, 4, 4, 'D')

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.text('TRANSACTION AMOUNT', 22, 60)

  doc.setFontSize(20)
  const normType = (item.type || '').toUpperCase()
  const isPositive = ['BORROW', 'THEY_RETURN'].includes(normType)
  doc.setTextColor(isPositive ? 5 : 220, isPositive ? 150 : 38, isPositive ? 105 : 38)
  doc.text(amountStr, 22, 72)

  // Details Table
  const tableRows = [
    ['Date', dateStr],
    ['Record Type', item.label || item.type || (isLend ? 'Lend / Borrow' : 'Expense')],
    [isLend ? 'Person Name' : 'Category', personOrCategory],
  ]

  if (!isLend && item.forWhom) {
    tableRows.push(['For Whom', item.forWhom])
  }
  if (item.mobileNo || item.phone) {
    tableRows.push(['Mobile Number', item.mobileNo || item.phone])
  }
  if (item.email) {
    tableRows.push(['Email Address', item.email])
  }
  if (item.paymentMode) {
    tableRows.push(['Payment Mode', item.paymentMode])
  }
  if (item.details) {
    tableRows.push(['Details', item.details])
  }
  if (item.remarks) {
    tableRows.push(['Remarks', item.remarks])
  }

  autoTable(doc, {
    startY: 88,
    head: [['Field', 'Information']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  })

  // Footer Note
  const finalY = doc.lastAutoTable.finalY + 15
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(148, 163, 184)
  doc.text('This digital voucher was generated automatically via WalletVibe Personal Finance.', 14, finalY)

  const fileName = `WalletVibe_${personOrCategory.replace(/\s+/g, '_')}_${dateStr.replace(/\s+/g, '_')}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * Generate a PDF document for a Person's full Lend/Borrow ledger
 */
export function generatePersonLedgerPDF(person, data, normalizeFn) {
  const doc = new jsPDF()
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const netAmt = Math.abs(data.net).toLocaleString('en-IN')
  const netStatus = data.net >= 0 ? 'Receivable (You will get)' : 'Payable (You need to pay)'

  // Header Banner
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 42, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('WalletVibe', 14, 22)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text(`Ledger Statement for ${person}`, 14, 32)

  doc.text(`Date: ${dateStr}`, 196, 25, { align: 'right' })

  // Net Balance Summary Box
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 50, 182, 34, 4, 4, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, 50, 182, 34, 4, 4, 'D')

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.text('NET BALANCE STATUS', 22, 61)

  doc.setFontSize(18)
  doc.setTextColor(data.net >= 0 ? 5 : 220, data.net >= 0 ? 150 : 38, data.net >= 0 ? 105 : 38)
  doc.text(`Rs.${netAmt}  (${netStatus})`, 22, 74)

  // Transactions Table
  const rows = (data.items || [])
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((item, idx) => {
      const dStr = item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
      const norm = normalizeFn ? normalizeFn(item.type) : item.type
      let typeText = item.type
      let amtPrefix = '-'
      if (norm === 'LEND') { typeText = 'Loan Given'; amtPrefix = '-' }
      else if (norm === 'BORROW') { typeText = 'Borrowed'; amtPrefix = '+' }
      else if (norm === 'THEY_RETURN') { typeText = 'Received Return'; amtPrefix = '+' }
      else if (norm === 'I_RETURN') { typeText = 'I Returned'; amtPrefix = '-' }
      else if (norm === 'FORGIVE') { typeText = 'Forgiven'; amtPrefix = '-' }

      return [
        idx + 1,
        dStr,
        typeText,
        item.remarks || '—',
        `${amtPrefix}Rs.${Number(item.amount).toLocaleString('en-IN')}`
      ]
    })

  autoTable(doc, {
    startY: 92,
    head: [['#', 'Date', 'Transaction Type', 'Remarks', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 28 },
      2: { cellWidth: 35 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: function(cellData) {
      if (cellData.column.index === 4 && cellData.section === 'body') {
        const isPos = cellData.cell.raw.startsWith('+')
        cellData.cell.styles.textColor = isPos ? [5, 150, 105] : [239, 68, 68]
      }
    }
  })

  // Footer Note
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`WalletVibe Statement — Page ${i} of ${pageCount}`, 196, 287, { align: 'right' })
  }

  const fileName = `WalletVibe_Statement_${person.replace(/\s+/g, '_')}_${dateStr.replace(/\s+/g, '_')}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * Execute Share via WhatsApp with PDF or Text option
 */
export function shareViaWhatsApp({ phone, item, person, personData, normalizeFn, format = 'text' }) {
  const cleanPhone = cleanPhoneNumber(phone || item?.mobileNo || item?.phone)
  if (!cleanPhone) {
    alert('Please enter or select a valid mobile number!')
    return
  }

  if (format === 'pdf') {
    let fileName = ''
    if (person && personData) {
      fileName = generatePersonLedgerPDF(person, personData, normalizeFn)
    } else if (item) {
      fileName = generateSingleTxnPDF(item)
    }
    const msg = `Hi ${person || item?.person || 'there'}, I have generated and downloaded our WalletVibe PDF Statement (${fileName}). Please check the attached document.`
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    let msg = ''
    if (person && personData) {
      msg = generatePersonSummaryMessage(person, personData, normalizeFn)
    } else if (item) {
      msg = generateLendingMessage(item)
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Execute Share via Email with PDF or Text option
 */
export function shareViaEmail({ email, item, person, personData, normalizeFn, format = 'text' }) {
  const targetEmail = email || item?.email
  if (!targetEmail || !targetEmail.includes('@')) {
    alert('Please enter or select a valid email address!')
    return
  }

  const personName = person || item?.person || 'Friend'
  const subject = `WalletVibe Financial Statement — ${personName}`

  if (format === 'pdf') {
    let fileName = ''
    if (person && personData) {
      fileName = generatePersonLedgerPDF(person, personData, normalizeFn)
    } else if (item) {
      fileName = generateSingleTxnPDF(item)
    }
    const body = `Hi ${personName},\n\nAttached / generated is the official WalletVibe PDF Statement (${fileName}).\n\n— WalletVibe`
    const url = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_self')
  } else {
    let body = ''
    if (person && personData) {
      body = generatePersonSummaryMessage(person, personData, normalizeFn)
    } else if (item) {
      body = generateLendingMessage(item)
    }
    const url = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_self')
  }
}
