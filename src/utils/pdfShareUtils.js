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
  if (returnDocObj) {
    return { doc, fileName }
  }
  doc.save(fileName)
  return fileName
}

/**
 * Generate a PDF document for a Person's full Lend/Borrow ledger
 */
export function generatePersonLedgerPDF(person, data, normalizeFn, returnDocObj = false) {
  const doc = new jsPDF()
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const netAmt = Math.abs(data.net).toLocaleString('en-IN')
  const netStatus = data.net >= 0 ? 'Receivable (You will get)' : 'Payable (You need to pay)'

  // Header Banner
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 45, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('WalletVibe', 14, 22)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text(`Account Statement & Ledger — ${person}`, 14, 30)

  doc.setFontSize(8)
  doc.text(`Generated: ${dateStr}`, 196, 22, { align: 'right' })
  doc.text('Confidential', 196, 30, { align: 'right' })

  // Summary Card
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 52, 182, 34, 4, 4, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, 52, 182, 34, 4, 4, 'D')

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.text('NET SETTLEMENT POSITION', 22, 64)

  doc.setFontSize(16)
  doc.setTextColor(data.net >= 0 ? 16 : 220, data.net >= 0 ? 185 : 38, data.net >= 0 ? 129 : 38)
  doc.text(`Rs.${netAmt} (${netStatus})`, 22, 76)

  // Ledger Table
  const recordsList = data.records || data.items || []
  const tableRows = recordsList.map((r, index) => {
    const isGave = r.type === 'Gave' || r.type === 'Give' || r.label === 'Gave' || r.label === 'Give'
    const isGot = r.type === 'Got' || r.type === 'Receive' || r.label === 'Got' || r.label === 'Receive'
    const isBorrow = r.type === 'Borrow' || r.label === 'Borrow'
    const isReturn = r.type === 'They Return' || r.label === 'They Return'

    let displayType = r.type || r.label || 'Entry'
    if (isGave) displayType = 'Gave (You Paid)'
    else if (isGot) displayType = 'Got (You Received)'
    else if (isBorrow) displayType = 'Borrowed'
    else if (isReturn) displayType = 'Returned'

    const rDate = r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    const rAmt = `Rs.${Number(r.amount || 0).toLocaleString('en-IN')}`
    const rDetails = r.remarks || r.details || '—'

    return [index + 1, rDate, displayType, rAmt, rDetails]
  })

  autoTable(doc, {
    startY: 94,
    head: [['#', 'Date', 'Transaction Type', 'Amount', 'Remarks / Details']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 42, fontStyle: 'bold' },
      3: { cellWidth: 32, fontStyle: 'bold', halign: 'right' },
      4: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
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
  if (returnDocObj) {
    return { doc, fileName }
  }
  doc.save(fileName)
  return fileName
}

/**
 * Execute Share via WhatsApp with PDF or Text option
 */
export async function shareViaWhatsApp({ phone, item, person, personData, normalizeFn, format = 'text' }) {
  const cleanPhone = cleanPhoneNumber(phone || item?.mobileNo || item?.phone)

  if (format === 'pdf') {
    let pdfRes = null
    if (person && personData) {
      pdfRes = generatePersonLedgerPDF(person, personData, normalizeFn, true)
    } else if (item) {
      pdfRes = generateSingleTxnPDF(item, true)
    }

    if (!pdfRes) return

    const { doc, fileName } = pdfRes
    const personName = person || item?.person || 'Friend'
    const msg = `Hi ${personName}, here is the official WalletVibe PDF Statement (${fileName}).`

    try {
      const blob = doc.output('blob')
      const pdfFile = new File([blob], fileName, { type: 'application/pdf' })

      // 1. Mobile / Browser Native Direct File Share Sheet (attaches file directly into WhatsApp without manual download!)
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: 'WalletVibe PDF Statement',
          text: msg,
          files: [pdfFile],
        })
        return
      }
    } catch (err) {
      console.warn('[shareViaWhatsApp] Web Share API notice:', err?.message)
    }

    // 2. Desktop Browsers: Download PDF + Open WhatsApp Web with guidance notice
    doc.save(fileName)
    const encodedMsg = cleanPhone
      ? `Hi ${personName}, I have generated and downloaded our WalletVibe PDF Statement (${fileName}). Please check the attached file.`
      : `WalletVibe PDF Statement (${fileName})`

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(encodedMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(encodedMsg)}`

    window.open(url, '_blank', 'noopener,noreferrer')

    alert(`📄 PDF Statement "${fileName}" has been downloaded to your device!\n\nWhatsApp Web is now opening. Simply click the 📎 Attach icon in your WhatsApp chat to attach the downloaded PDF file.`)
  } else {
    let msg = ''
    if (person && personData) {
      msg = generatePersonSummaryMessage(person, personData, normalizeFn)
    } else if (item) {
      msg = generateLendingMessage(item)
    }
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
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
