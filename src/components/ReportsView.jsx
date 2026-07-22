import { useState, useEffect, useMemo, useRef } from 'react'
import { getAllExpenses } from '../api/expenses'
import { getAllLending, normalizeLendingType } from '../api/lending'
import { loadSnapshot } from '../api/localCache'
import { openWhatsApp, openEmail, getPersonContactMap, openWhatsAppPerson, openEmailPerson } from '../utils/commUtils'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function ReportsView({ allExpenses, allLending, onSelectTxn }) {
  const [reportType, setReportType] = useState('expense') // 'expense' | 'lending' | 'bank'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isAllTime, setIsAllTime] = useState(true)
  const [activeRange, setActiveRange] = useState('allTime')
  const [bankRecords, setBankRecords] = useState([])
  const [pdfSettings, setPdfSettings] = useState({
    showStats: true,
    showBreakdown: true,
    showLedger: true,
    showRemarks: true,
  })

  const [pdfColumns, setPdfColumns] = useState({
    date: true,
    catPerson: true,
    whomType: true,
    paymentBank: true,
    contact: true,
    remarks: true,
    amount: true,
  })

  useEffect(() => {
    const cached = loadSnapshot('bank')
    if (cached && cached.length > 0) {
      setBankRecords(cached.map((r) => ({
        ...r,
        dateObj: r.date ? new Date(r.date) : new Date(),
      })))
    }
  }, [])

  function toYYYYMMDD(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  function applyQuickRange(rangeKey) {
    setActiveRange(rangeKey)
    const now = new Date()
    if (rangeKey === 'allTime') {
      setIsAllTime(true)
      setStartDate('')
      setEndDate('')
      return
    }
    setIsAllTime(false)
    if (rangeKey === 'today') {
      const s = toYYYYMMDD(now)
      setStartDate(s)
      setEndDate(s)
    } else if (rangeKey === 'yesterday') {
      const yest = new Date(now)
      yest.setDate(yest.getDate() - 1)
      const s = toYYYYMMDD(yest)
      setStartDate(s)
      setEndDate(s)
    } else if (rangeKey === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setStartDate(toYYYYMMDD(start))
      setEndDate(toYYYYMMDD(end))
    } else if (rangeKey === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      setStartDate(toYYYYMMDD(start))
      setEndDate(toYYYYMMDD(end))
    } else if (rangeKey === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      setStartDate(toYYYYMMDD(start))
      setEndDate(toYYYYMMDD(end))
    } else if (rangeKey === 'custom') {
      if (!startDate || !endDate) {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        setStartDate(toYYYYMMDD(start))
        setEndDate(toYYYYMMDD(now))
      }
    }
  }

  const [expandedGroups, setExpandedGroups] = useState({})
  const [downloading, setDownloading] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [personSearch, setPersonSearch] = useState('')

  // Build contact map from ALL lending transactions (most recent phone/email per person)
  const personContactMap = useMemo(() => getPersonContactMap(allLending), [allLending])

  function exportToExcelCSV(scope = 'full') {
    let csvContent = '\uFEFF' // UTF-8 BOM for Microsoft Excel compatibility
    let fileName = ''

    function escapeCSV(val) {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    if (scope === 'full') {
      fileName = `WalletVibe_Full_Database_${toYYYYMMDD(new Date())}.csv`
      
      csvContent += '=== WALLETVIBE FULL DATABASE EXPORT ===\n'
      csvContent += `Generated Date,${toYYYYMMDD(new Date())}\n\n`

      // 1. EXPENSES SECTION
      csvContent += '--- SECTION 1: ALL EXPENSES ---\n'
      csvContent += 'ID,Date,For Whom,Category,Details,Amount (INR),Payment Mode,Remarks,Attachment\n'
      ;(allExpenses || []).forEach(e => {
        const dStr = e.dateObj ? toYYYYMMDD(e.dateObj) : (e.date ? e.date.slice(0, 10) : '')
        csvContent += [
          escapeCSV(e.id),
          escapeCSV(dStr),
          escapeCSV(e.forWhom || 'Self'),
          escapeCSV(e.category || ''),
          escapeCSV(e.details || ''),
          escapeCSV(e.amount || 0),
          escapeCSV(e.paymentMode || 'Cash'),
          escapeCSV(e.remarks || ''),
          escapeCSV(e.hasAttachment ? 'Yes' : 'No')
        ].join(',') + '\n'
      })

      // 2. LENDING & BORROWING SECTION
      csvContent += '\n--- SECTION 2: LENDING & BORROWING ---\n'
      csvContent += 'ID,Date,Type/Label,Person,Amount (INR),Remarks,Attachment\n'
      ;(allLending || []).forEach(l => {
        const dStr = l.dateObj ? toYYYYMMDD(l.dateObj) : (l.date ? l.date.slice(0, 10) : '')
        csvContent += [
          escapeCSV(l.id),
          escapeCSV(dStr),
          escapeCSV(l.label || l.type || ''),
          escapeCSV(l.person || ''),
          escapeCSV(l.amount || 0),
          escapeCSV(l.remarks || ''),
          escapeCSV(l.hasAttachment ? 'Yes' : 'No')
        ].join(',') + '\n'
      })

      // 3. BANK TRANSACTIONS SECTION
      csvContent += '\n--- SECTION 3: BANK TRANSACTIONS ---\n'
      csvContent += 'ID,Date,Bank,Description,Debit (INR),Credit (INR),Balance (INR)\n'
      ;(bankRecords || []).forEach(b => {
        const dStr = b.dateObj ? toYYYYMMDD(b.dateObj) : (b.date ? String(b.date).slice(0, 10) : '')
        csvContent += [
          escapeCSV(b.id),
          escapeCSV(dStr),
          escapeCSV(b.bank || ''),
          escapeCSV(b.description || ''),
          escapeCSV(b.debit || 0),
          escapeCSV(b.credit || 0),
          escapeCSV(b.balance || 0)
        ].join(',') + '\n'
      })

    } else {
      // Current Range Export
      const rangeLabel = activeRange === 'allTime' ? 'AllTime' : (startDate && endDate ? `${startDate}_to_${endDate}` : activeRange)
      fileName = `WalletVibe_${reportType === 'expense' ? 'Expenses' : reportType === 'lending' ? 'Lending' : 'BankHistory'}_${rangeLabel}.csv`

      if (reportType === 'expense') {
        csvContent += `=== WALLETVIBE EXPENSES EXPORT (${rangeLabel}) ===\n`
        csvContent += `Generated Date,${toYYYYMMDD(new Date())}\n\n`
        csvContent += 'Date,For Whom,Category,Details,Amount (INR),Payment Mode,Remarks\n'
        ;(filteredExpenses || []).forEach(e => {
          const dStr = e.dateObj ? toYYYYMMDD(e.dateObj) : (e.date ? e.date.slice(0, 10) : '')
          csvContent += [
            escapeCSV(dStr),
            escapeCSV(e.forWhom || 'Self'),
            escapeCSV(e.category || ''),
            escapeCSV(e.details || ''),
            escapeCSV(e.amount || 0),
            escapeCSV(e.paymentMode || 'Cash'),
            escapeCSV(e.remarks || '')
          ].join(',') + '\n'
        })
      } else if (reportType === 'lending') {
        csvContent += `=== WALLETVIBE LENDING EXPORT (${rangeLabel}) ===\n`
        csvContent += `Generated Date,${toYYYYMMDD(new Date())}\n\n`
        csvContent += 'Date,Type,Person,Amount (INR),Remarks\n'
        ;(filteredLending || []).forEach(l => {
          const dStr = l.dateObj ? toYYYYMMDD(l.dateObj) : (l.date ? l.date.slice(0, 10) : '')
          csvContent += [
            escapeCSV(dStr),
            escapeCSV(l.label || l.type || ''),
            escapeCSV(l.person || ''),
            escapeCSV(l.amount || 0),
            escapeCSV(l.remarks || '')
          ].join(',') + '\n'
        })
      } else {
        csvContent += `=== WALLETVIBE BANK TRANSACTIONS EXPORT (${rangeLabel}) ===\n`
        csvContent += `Generated Date,${toYYYYMMDD(new Date())}\n\n`
        csvContent += 'Date,Bank,Description,Debit (INR),Credit (INR),Balance (INR)\n'
        ;(filteredBankTxns || []).forEach(b => {
          const dStr = b.dateObj ? toYYYYMMDD(b.dateObj) : (b.date ? String(b.date).slice(0, 10) : '')
          csvContent += [
            escapeCSV(dStr),
            escapeCSV(b.bank || ''),
            escapeCSV(b.description || ''),
            escapeCSV(b.debit || 0),
            escapeCSV(b.credit || 0),
            escapeCSV(b.balance || 0)
          ].join(',') + '\n'
        })
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const handleDownloadPDF = () => {
    setDownloading(true)
    try {
      const doc = new jsPDF()

      // Set document properties
      doc.setProperties({
        title: `WalletVibe Report — ${reportType === 'expense' ? 'Expenses' : 'Lend / Borrow'}`,
        author: 'WalletVibe App',
      })

      // Header branding
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(30, 58, 138) // dark blue #1e3a8a
      doc.text('WalletVibe Report', 14, 20)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139) // Slate-500 #64748b
      doc.text('Personal Financial Statement', 14, 25)

      // Right-aligned header metadata
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105) // Slate-600 #475569
      const generatedText = `Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`
      const typeText = `Type: ${reportType === 'expense' ? 'Expenses Statement' : 'Lend / Borrow Ledger'}`
      doc.text(generatedText, 196, 20, { align: 'right' })
      doc.text(typeText, 196, 25, { align: 'right' })

      // Divider line
      doc.setDrawColor(51, 65, 85) // Slate-700 #334155
      doc.setLineWidth(0.5)
      doc.line(14, 28, 196, 28)

      let currentY = 36

      // Report Parameters Card
      doc.setFillColor(248, 250, 252) // Slate-50 #f8fafc
      doc.setDrawColor(226, 232, 240) // Slate-200 #e2e8f0
      doc.roundedRect(14, currentY, 182, 22, 2, 2, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(51, 65, 85)
      doc.text('REPORT PARAMETERS', 18, currentY + 6)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      const periodLabel = `Period: ${isAllTime ? 'All Time' : `${formatDate(startDate)} to ${formatDate(endDate)}`}`
      doc.text(periodLabel, 18, currentY + 12)

      let filterLabel = ''
      if (reportType === 'expense') {
        const catStr = selectedCats.length ? selectedCats.join(', ') : 'All'
        const whomStr = selectedWhom.length ? selectedWhom.join(', ') : 'All'
        filterLabel = `Categories: ${catStr.length > 30 ? catStr.slice(0, 30) + '...' : catStr}  |  For Whom: ${whomStr}`
      } else {
        const typeStr = selectedTypes.length ? selectedTypes.join(', ') : 'All'
        const personStr = selectedPersons.length ? selectedPersons.join(', ') : 'All'
        filterLabel = `Types: ${typeStr}  |  Persons: ${personStr.length > 35 ? personStr.slice(0, 35) + '...' : personStr}`
      }
      doc.text(filterLabel, 18, currentY + 17)

      currentY += 28

      // Summary Stats Cards
      if (pdfSettings.showStats) {
        doc.setFillColor(248, 250, 252)
        doc.setDrawColor(203, 213, 225) // Slate-300 #cbd5e1

        // Left Box
        doc.roundedRect(14, currentY, 88, 16, 2, 2, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(100, 116, 139)
        const stat1Label = reportType === 'expense' ? 'TOTAL EXPENSES' : 'TOTAL RECEIVABLE'
        doc.text(stat1Label, 18, currentY + 5)
        
        doc.setFontSize(12)
        const val1 = reportType === 'expense' ? expenseReport.total : lendingReport.receivable
        doc.setTextColor(reportType === 'expense' ? 239 : 5, reportType === 'expense' ? 68 : 150, reportType === 'expense' ? 68 : 105)
        doc.text(`Rs.${val1.toLocaleString('en-IN')}`, 18, currentY + 12)

        // Right Box
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(108, currentY, 88, 16, 2, 2, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(100, 116, 139)
        const stat2Label = reportType === 'expense' ? 'TOTAL TRANSACTIONS' : 'TOTAL PAYABLE'
        doc.text(stat2Label, 112, currentY + 5)
        
        doc.setFontSize(12)
        const val2Str = reportType === 'expense' ? expenseReport.items.length.toString() : `Rs.${lendingReport.payable.toLocaleString('en-IN')}`
        doc.setTextColor(reportType === 'expense' ? 15 : 239, reportType === 'expense' ? 23 : 68, reportType === 'expense' ? 42 : 68)
        doc.text(val2Str, 112, currentY + 12)

        currentY += 22
      }

      // Breakdown Summary Tables
      if (pdfSettings.showBreakdown) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(15, 23, 42)
        doc.text('Summary Breakdown', 14, currentY + 4)
        currentY += 8

        if (reportType === 'expense') {
          const catEntries = Object.entries(expenseReport.byCat).sort((a, b) => b[1] - a[1])
          const whomEntries = Object.entries(expenseReport.byWhom).sort((a, b) => b[1] - a[1])

          autoTable(doc, {
            startY: currentY,
            margin: { left: 14, right: 108 },
            head: [['Category', 'Total Amount']],
            body: catEntries.map(([cat, total]) => [cat, `Rs.${total.toLocaleString('en-IN')}`]),
            theme: 'striped',
            headStyles: { fillColor: [49, 46, 129], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 1: { halign: 'right' } },
          })

          autoTable(doc, {
            startY: currentY,
            margin: { left: 108, right: 14 },
            head: [['For Whom', 'Total Amount']],
            body: whomEntries.map(([whom, total]) => [whom, `Rs.${total.toLocaleString('en-IN')}`]),
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 1: { halign: 'right' } },
          })

          currentY = Math.max(doc.lastAutoTable.finalY || currentY, currentY) + 10
        } else {
          const personEntries = Object.entries(lendingReport.byPerson).sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))
          
          autoTable(doc, {
            startY: currentY,
            head: [['Person', 'Net Balance']],
            body: personEntries.map(([person, d]) => [
              person, 
              `${d.net >= 0 ? '+' : ''}Rs.${d.net.toLocaleString('en-IN')}`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [5, 150, 105], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
            didParseCell: function(data) {
              if (data.column.index === 1 && data.section === 'body') {
                const isPositive = data.cell.raw.startsWith('+');
                data.cell.styles.textColor = isPositive ? [5, 150, 105] : [239, 68, 68];
              }
            }
          })
          currentY = (doc.lastAutoTable.finalY || currentY) + 10
        }
      }

      // Detailed Transaction Ledger
      if (pdfSettings.showLedger) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(15, 23, 42)
        doc.text('Transaction Ledger (Detailed Report)', 14, currentY + 4)
        currentY += 8

        const columns = []
        if (pdfColumns.date) columns.push({ header: 'Date', dataKey: 'date' })
        if (pdfColumns.catPerson) columns.push({ header: reportType === 'expense' ? 'Category' : reportType === 'lending' ? 'Person' : 'Bank', dataKey: 'catPerson' })
        if (pdfColumns.whomType) columns.push({ header: reportType === 'expense' ? 'For Whom' : reportType === 'lending' ? 'Type' : 'Description', dataKey: 'whomType' })
        if (pdfColumns.paymentBank) columns.push({ header: reportType === 'expense' ? 'Payment' : reportType === 'lending' ? 'Mode' : 'Type', dataKey: 'paymentBank' })
        if (pdfColumns.contact) columns.push({ header: 'Contact', dataKey: 'contact' })
        if (pdfColumns.remarks) columns.push({ header: 'Remarks / Details', dataKey: 'remarks' })
        if (pdfColumns.amount) columns.push({ header: 'Amount', dataKey: 'amount' })

        const rawItems = reportType === 'expense' ? expenseReport.items : reportType === 'lending' ? lendingReport.items : filteredBankTxns
        const rows = (rawItems || [])
          .sort((a, b) => new Date(b.date || b.dateObj) - new Date(a.date || a.dateObj))
          .map((item) => {
            const isLend = reportType === 'lending'
            const isBank = reportType === 'bank'
            const amtVal = item.amount || (item.debit ? parseFloat(item.debit) : parseFloat(item.credit || 0))
            const amt = (amtVal || 0).toLocaleString('en-IN')
            
            let typeText = item.type
            let amtStr = `Rs.${amt}`
            
            if (isLend) {
              const norm = normalizeLendingType(item.type)
              if (norm === 'LEND') { typeText = 'Loan Given'; amtStr = `-Rs.${amt}` }
              else if (norm === 'BORROW') { typeText = 'Borrowed'; amtStr = `+Rs.${amt}` }
              else if (norm === 'THEY_RETURN') { typeText = 'Received Return'; amtStr = `+Rs.${amt}` }
              else if (norm === 'I_RETURN') { typeText = 'I Returned'; amtStr = `-Rs.${amt}` }
              else if (norm === 'FORGIVE') { typeText = 'Forgiven'; amtStr = `-Rs.${amt}` }
            } else if (isBank) {
              amtStr = item.debit ? `-Rs.${amt}` : `+Rs.${amt}`
            } else {
              amtStr = `-Rs.${amt}`
            }

            const d = new Date(item.date || item.dateObj)
            const day = String(d.getDate()).padStart(2, '0')
            const mon = d.toLocaleString('en', { month: 'short' })
            const yr = String(d.getFullYear()).slice(-2)
            const dateStr = `${day}-${mon}-${yr}`

            const rowData = {}
            if (pdfColumns.date) rowData.date = dateStr
            if (pdfColumns.catPerson) rowData.catPerson = isBank ? (item.bank || 'Bank') : isLend ? (item.person || '—') : (item.category || 'Uncategorized')
            if (pdfColumns.whomType) rowData.whomType = isBank ? (item.description || '—') : isLend ? typeText : (item.forWhom || 'Self')
            if (pdfColumns.paymentBank) rowData.paymentBank = isBank ? (item.debit ? 'Debit' : 'Credit') : isLend ? (item.paymentMode || '—') : (item.paymentMode || '—')
            if (pdfColumns.contact) rowData.contact = [item.mobileNo || item.phone, item.email].filter(Boolean).join(' | ') || '—'
            if (pdfColumns.remarks) rowData.remarks = [item.details, item.remarks].filter(Boolean).join(' — ') || '—'
            if (pdfColumns.amount) rowData.amount = amtStr

            return rowData
          })

        const colStyles = {}
        if (pdfColumns.date) colStyles.date = { cellWidth: 18 }
        if (pdfColumns.amount) colStyles.amount = { halign: 'right', fontStyle: 'bold', cellWidth: 26 }

        autoTable(doc, {
          startY: currentY,
          columns: columns,
          body: rows,
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], fontSize: 7, cellPadding: 2 },
          bodyStyles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
          columnStyles: colStyles,
          margin: { left: 14, right: 14 },
          tableWidth: 182,
          didParseCell: function(data) {
            if (data.column.dataKey === 'amount' && data.section === 'body') {
              const isPositive = data.cell.raw.startsWith('+');
              const isNeutral = data.cell.raw.includes('Forgiven');
              if (isPositive) {
                data.cell.styles.textColor = [5, 150, 105];
              } else if (!isNeutral) {
                data.cell.styles.textColor = [239, 68, 68];
              } else {
                data.cell.styles.textColor = [100, 116, 139];
              }
            }
          }
        })
      }

      // Add Page Numbers in footer of every page
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text(`Page ${i} of ${pageCount}`, 196, 287, { align: 'right' })
      }

      doc.save(`WalletVibe_${reportType.toUpperCase()}_Detailed_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not generate PDF. Please try using Print instead.');
    } finally {
      setDownloading(false)
    }
  };

  const handleShareReportWhatsApp = () => {
    const rawItems = reportType === 'expense' ? expenseReport.items : reportType === 'lending' ? lendingReport.items : filteredBankTxns
    const count = rawItems.length
    const title = reportType === 'expense' ? 'Expenses Detailed Statement' : reportType === 'lending' ? 'Lend / Borrow Detailed Statement' : 'Bank History Statement'
    const summaryText = reportType === 'expense' ? `Total: ₹${expenseReport.total.toLocaleString('en-IN')}` : reportType === 'lending' ? `Receivable: ₹${lendingReport.receivable.toLocaleString('en-IN')} | Payable: ₹${lendingReport.payable.toLocaleString('en-IN')}` : `Debits: ₹${bankStats.debit.toLocaleString('en-IN')} | Credits: ₹${bankStats.credit.toLocaleString('en-IN')}`

    const header = `📋 *WalletVibe ${title}*\n${summaryText}\nTotal Records: ${count}\n\n`
    const rows = rawItems.slice(0, 30).map((it, idx) => {
      const dateStr = formatDate(it.date || it.dateObj)
      const amtStr = `₹${(it.amount || it.debit || it.credit || 0).toLocaleString('en-IN')}`
      if (reportType === 'expense') {
        return `${idx + 1}. ${dateStr} - ${it.category || 'Expense'} (${it.forWhom || 'Self'}): ${amtStr}${it.remarks ? ' [' + it.remarks + ']' : ''}`
      } else if (reportType === 'lending') {
        return `${idx + 1}. ${dateStr} - ${it.person} (${it.type}): ${amtStr}${it.remarks ? ' [' + it.remarks + ']' : ''}`
      } else {
        return `${idx + 1}. ${dateStr} - ${it.bank || 'Bank'} (${it.description || ''}): ${amtStr}`
      }
    }).join('\n')

    const footer = count > 30 ? `\n\n...and ${count - 30} more transactions.` : ''
    const fullMsg = header + rows + footer
    window.open(`https://wa.me/?text=${encodeURIComponent(fullMsg)}`, '_blank', 'noopener,noreferrer')
  }

  const handleShareReportEmail = () => {
    const rawItems = reportType === 'expense' ? expenseReport.items : reportType === 'lending' ? lendingReport.items : filteredBankTxns
    const count = rawItems.length
    const title = reportType === 'expense' ? 'Expenses Detailed Statement' : reportType === 'lending' ? 'Lend / Borrow Detailed Statement' : 'Bank History Statement'
    const summaryText = reportType === 'expense' ? `Total: ₹${expenseReport.total.toLocaleString('en-IN')}` : reportType === 'lending' ? `Receivable: ₹${lendingReport.receivable.toLocaleString('en-IN')} | Payable: ₹${lendingReport.payable.toLocaleString('en-IN')}` : `Debits: ₹${bankStats.debit.toLocaleString('en-IN')} | Credits: ₹${bankStats.credit.toLocaleString('en-IN')}`

    const subject = `WalletVibe Report: ${title}`
    const header = `WalletVibe ${title}\n${summaryText}\nTotal Records: ${count}\n\n`
    const rows = rawItems.map((it, idx) => {
      const dateStr = formatDate(it.date || it.dateObj)
      const amtStr = `₹${(it.amount || it.debit || it.credit || 0).toLocaleString('en-IN')}`
      if (reportType === 'expense') {
        return `${idx + 1}. ${dateStr} | ${it.category || 'Expense'} | ${it.forWhom || 'Self'} | ${amtStr} | ${it.remarks || ''}`
      } else if (reportType === 'lending') {
        return `${idx + 1}. ${dateStr} | ${it.person} | ${it.type} | ${amtStr} | ${it.remarks || ''}`
      } else {
        return `${idx + 1}. ${dateStr} | ${it.bank || 'Bank'} | ${it.description || ''} | ${amtStr}`
      }
    }).join('\n')

    const body = header + rows
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self')
  }

  // Expense filters
  const [selectedCats, setSelectedCats] = useState([])
  const [selectedWhom, setSelectedWhom] = useState([])
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const [showWhomDropdown, setShowWhomDropdown] = useState(false)

  // Lending filters
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedPersons, setSelectedPersons] = useState([])
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showPersonDropdown, setShowPersonDropdown] = useState(false)

  // Available filter options
  const catOptions = useMemo(() => [...new Set(allExpenses.map((e) => e.category).filter(Boolean))], [allExpenses])
  const whomOptions = useMemo(() => [...new Set(allExpenses.map((e) => e.forWhom).filter(Boolean))], [allExpenses])
  const personOptions = useMemo(() => [...new Set(allLending.map((l) => l.person).filter(Boolean))], [allLending])
  const typeOptions = ['Lend', 'Borrow', 'They Return', 'I Return', 'Forgive']

  // Filtered data
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter((e) => {
      if (!isAllTime && startDate && endDate) {
        const d = new Date(e.date)
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (d < start || d > end) return false
      }
      if (selectedCats.length && !selectedCats.includes(e.category)) return false
      if (selectedWhom.length && !selectedWhom.includes(e.forWhom)) return false
      return true
    })
  }, [allExpenses, isAllTime, startDate, endDate, selectedCats, selectedWhom])

  const filteredLending = useMemo(() => {
    return allLending.filter((l) => {
      if (!isAllTime && startDate && endDate) {
        const d = new Date(l.date)
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (d < start || d > end) return false
      }
      if (selectedTypes.length) {
        const norm = normalizeLendingType(l.type || l.label)
        const match = selectedTypes.some((t) => normalizeLendingType(t) === norm)
        if (!match) return false
      }
      if (selectedPersons.length && !selectedPersons.includes(l.person)) return false
      return true
    })
  }, [allLending, isAllTime, startDate, endDate, selectedTypes, selectedPersons])

  const filteredBankTxns = useMemo(() => {
    return (bankRecords || []).filter((b) => {
      if (!isAllTime && startDate && endDate) {
        const dt = b.dateObj || new Date(b.date)
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (dt < start || dt > end) return false
      }
      return true
    })
  }, [bankRecords, isAllTime, startDate, endDate])

  const bankStats = useMemo(() => {
    let debit = 0
    let credit = 0
    filteredBankTxns.forEach((b) => {
      debit += parseFloat(b.debit || 0)
      credit += parseFloat(b.credit || 0)
    })
    return { debit, credit, net: credit - debit, count: filteredBankTxns.length }
  }, [filteredBankTxns])

  // Expense report
  const expenseReport = useMemo(() => {
    let total = 0
    const byCat = {}
    const byWhom = {}
    for (const e of filteredExpenses) {
      total += e.amount
      byCat[e.category || 'Uncategorized'] = (byCat[e.category || 'Uncategorized'] || 0) + e.amount
      byWhom[e.forWhom || 'Self'] = (byWhom[e.forWhom || 'Self'] || 0) + e.amount
    }
    return { total, byCat, byWhom, items: filteredExpenses }
  }, [filteredExpenses])

  // Lending report
  const lendingReport = useMemo(() => {
    let totalLent = 0, totalBorrowed = 0, receivable = 0, payable = 0
    const byPerson = {}
    for (const l of filteredLending) {
      const norm = normalizeLendingType(l.type)
      if (!byPerson[l.person]) byPerson[l.person] = { net: 0, items: [] }
      byPerson[l.person].items.push(l)
      if (norm === 'LEND') { receivable += l.amount; totalLent += l.amount; byPerson[l.person].net += l.amount }
      else if (norm === 'BORROW') { payable += l.amount; totalBorrowed += l.amount; byPerson[l.person].net -= l.amount }
      else if (norm === 'THEY_RETURN') { receivable -= l.amount; byPerson[l.person].net -= l.amount }
      else if (norm === 'I_RETURN') { payable -= l.amount; byPerson[l.person].net += l.amount }
      else if (norm === 'FORGIVE') { receivable -= l.amount; byPerson[l.person].net -= l.amount }
    }
    return { totalLent, totalBorrowed, receivable, payable, byPerson, items: filteredLending }
  }, [filteredLending])

  function toggleGroup(key) {
    setExpandedGroups((g) => ({ ...g, [key]: !g[key] }))
  }

  function toggleFilter(arr, setArr, val) {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val))
    else setArr([...arr, val])
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) }
    catch { return '' }
  }

  return (
    <div className="animate-fade-in">
      <div className="report-card">
        {/* ── Compact Header Row ── */}
        <div className="report-compact-header">
          <h3 className="report-title">
            <i className="fas fa-chart-pie"></i> Report Generator
          </h3>
          <div className="report-header-actions" style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
            {/* Unified Export / Download Menu */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="export-menu-btn"
                title="Export Statement or Full Database"
              >
                <i className="fas fa-download" style={{ fontSize: 10 }}></i>
                Export
                <i className="fas fa-caret-down" style={{ fontSize: 9, marginLeft: 1 }}></i>
              </button>

              {exportMenuOpen && (
                <>
                  <div className="dropdown-overlay" onClick={() => setExportMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  <div className="pdf-dropdown-menu custom-scrollbar" style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    boxShadow: 'var(--shadow-lg)',
                    minWidth: '240px',
                    maxHeight: 'min(380px, 65vh)',
                    overflowY: 'auto',
                    zIndex: 100,
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Excel / CSV Exports
                    </div>

                    <button
                      type="button"
                      onClick={() => { setExportMenuOpen(false); exportToExcelCSV('full') }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--slate-50)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                        textAlign: 'left', width: '100%', transition: 'all 0.15s'
                      }}
                    >
                      <i className="fas fa-database" style={{ color: 'var(--accent-600)', fontSize: 14 }} />
                      <div>
                        <div>Full Database (Excel CSV)</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Expenses + Lending + Bank history</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setExportMenuOpen(false); exportToExcelCSV('range') }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--slate-50)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                        textAlign: 'left', width: '100%', transition: 'all 0.15s'
                      }}
                    >
                      <i className="fas fa-filter" style={{ color: 'var(--emerald-600)', fontSize: 14 }} />
                      <div>
                        <div>Filtered Range (Excel CSV)</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{activeRange === 'allTime' ? 'All Time' : activeRange} {reportType} data</div>
                      </div>
                    </button>

                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PDF & Print Statements
                    </div>

                    <button
                      type="button"
                      onClick={() => { setExportMenuOpen(false); handleDownloadPDF() }}
                      disabled={downloading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--slate-50)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                        textAlign: 'left', width: '100%', transition: 'all 0.15s'
                      }}
                    >
                      <i className="fas fa-file-pdf" style={{ color: 'var(--red-500)', fontSize: 14 }} />
                      <div>
                        <div>Download PDF Detailed Report</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Customized printable report</div>
                      </div>
                    </button>

                    {/* WhatsApp & Email Full Detailed Statement Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => { setExportMenuOpen(false); handleShareReportWhatsApp() }}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '7px 8px', borderRadius: 6, border: 'none', background: '#25D366',
                          color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                        }}
                        title="Share full statement text via WhatsApp"
                      >
                        <i className="fab fa-whatsapp" style={{ fontSize: 13 }} /> WhatsApp
                      </button>

                      <button
                        type="button"
                        onClick={() => { setExportMenuOpen(false); handleShareReportEmail() }}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '7px 8px', borderRadius: 6, border: 'none', background: '#3b82f6',
                          color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                        }}
                        title="Send full detailed statement via Email"
                      >
                        <i className="fas fa-envelope" style={{ fontSize: 11 }} /> Email
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setExportMenuOpen(false); window.print() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--slate-50)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                        textAlign: 'left', width: '100%', transition: 'all 0.15s'
                      }}
                    >
                      <i className="fas fa-print" style={{ color: 'var(--indigo-600)', fontSize: 14 }} />
                      <div>
                        <div>Print Statement</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Send directly to printer</div>
                      </div>
                    </button>

                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PDF Sections
                    </div>
                    {[
                      { key: 'showStats', icon: 'fa-chart-bar', label: 'Summary' },
                      { key: 'showBreakdown', icon: 'fa-layer-group', label: 'Breakdown' },
                      { key: 'showLedger', icon: 'fa-list', label: 'Transaction Ledger' },
                    ].map(({ key, icon, label }) => (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                        borderRadius: '6px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-primary)',
                        userSelect: 'none'
                      }}>
                        <input
                          type="checkbox"
                          checked={pdfSettings[key]}
                          onChange={() => setPdfSettings(s => ({ ...s, [key]: !s[key] }))}
                          style={{ margin: 0, width: '13px', height: '13px', accentColor: 'var(--primary)' }}
                        />
                        <i className={`fas ${icon}`} style={{ color: 'var(--text-secondary)', width: '14px', textAlign: 'center', fontSize: 10 }}></i>
                        {label}
                      </label>
                    ))}

                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      PDF Columns to Include
                    </div>
                    {[
                      { key: 'date', label: 'Date' },
                      { key: 'catPerson', label: reportType === 'expense' ? 'Category' : reportType === 'lending' ? 'Person' : 'Bank' },
                      { key: 'whomType', label: reportType === 'expense' ? 'For Whom' : reportType === 'lending' ? 'Type' : 'Description' },
                      { key: 'paymentBank', label: 'Payment Mode' },
                      { key: 'contact', label: 'Contact (Mobile / Email)' },
                      { key: 'remarks', label: 'Remarks / Details' },
                      { key: 'amount', label: 'Amount' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                        borderRadius: '6px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-primary)',
                        userSelect: 'none'
                      }}>
                        <input
                          type="checkbox"
                          checked={pdfColumns[key]}
                          onChange={() => setPdfColumns(c => ({ ...c, [key]: !c[key] }))}
                          style={{ margin: 0, width: '13px', height: '13px', accentColor: 'var(--primary)' }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Type Switcher ── */}
        <div className="report-type-switcher">
          <button className={`report-type-btn ${reportType === 'expense' ? 'active' : ''}`} onClick={() => setReportType('expense')}>Expense</button>
          <button className={`report-type-btn ${reportType === 'lending' ? 'active' : ''}`} onClick={() => setReportType('lending')}>Lend / Borrow</button>
          <button className={`report-type-btn ${reportType === 'bank' ? 'active' : ''}`} onClick={() => setReportType('bank')}>Bank History</button>
        </div>

        {/* ── Date Range ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            <i className="fas fa-calendar-alt" style={{ marginRight: 4 }} /> Time Range
          </div>
          <div className="chips-container no-scrollbar" style={{ padding: '2px 0 6px', display: 'flex', gap: 6, overflowX: 'auto' }}>
            {[
              { id: 'allTime', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'thisMonth', label: 'This Month' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'thisYear', label: 'This Year' },
              { id: 'custom', label: 'Custom' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                className={`chip ${activeRange === r.id ? 'active' : ''}`}
                onClick={() => applyQuickRange(r.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 99,
                  border: activeRange === r.id ? '1px solid var(--accent-500)' : '1px solid var(--border-color)',
                  background: activeRange === r.id ? 'var(--accent-gradient)' : 'var(--bg-card)',
                  color: activeRange === r.id ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: activeRange === r.id ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {activeRange === 'custom' && (
            <div className="date-range-row" style={{ marginTop: 8 }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setIsAllTime(false) }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setIsAllTime(false) }}
              />
            </div>
          )}
        </div>

        {/* ── Filters ── */}
        {reportType === 'expense' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <MultiSelect
              label="Category"
              options={catOptions}
              selected={selectedCats}
              onChange={setSelectedCats}
              open={showCatDropdown}
              setOpen={setShowCatDropdown}
            />
            <MultiSelect
              label="For Whom"
              options={whomOptions}
              selected={selectedWhom}
              onChange={setSelectedWhom}
              open={showWhomDropdown}
              setOpen={setShowWhomDropdown}
            />
          </div>
        )}
        {reportType === 'lending' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <MultiSelect
              label="Type"
              options={typeOptions}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              open={showTypeDropdown}
              setOpen={setShowTypeDropdown}
            />
            <MultiSelect
              label="Person"
              options={personOptions}
              selected={selectedPersons}
              onChange={setSelectedPersons}
              open={showPersonDropdown}
              setOpen={setShowPersonDropdown}
            />
          </div>
        )}
      </div>

      {/* Results */}
      {reportType === 'expense' ? (
        <div>
          <div className="report-summary">
            <div className="report-stat">
              <div className="label">Total</div>
              <div className="value">₹{expenseReport.total.toLocaleString('en-IN')}</div>
            </div>
            <div className="report-stat">
              <div className="label">Transactions</div>
              <div className="value">{expenseReport.items.length}</div>
            </div>
          </div>

          {/* By Category */}
          <div className="section-title">By Category</div>
          {Object.entries(expenseReport.byCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
            <div key={cat} className="breakdown-group">
              <div className="breakdown-header" onClick={() => toggleGroup('cat-' + cat)}>
                <span className="group-name">{cat}</span>
                <span className="group-total">₹{total.toLocaleString('en-IN')}</span>
              </div>
              {expandedGroups['cat-' + cat] && (
                <div style={{ padding: '8px 12px' }}>
                  {expenseReport.items.filter((e) => (e.category || 'Uncategorized') === cat).map((e, i) => (
                    <div 
                      key={i} 
                      onClick={() => onSelectTxn?.(e)}
                      className="report-txn-row"
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '6px 8px', 
                        fontSize: 12, 
                        borderBottom: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                    >
                      <span>{formatDate(e.date)} — {e.details}</span>
                      <span style={{ fontWeight: 700 }}>₹{e.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* By ForWhom */}
          <div className="section-title" style={{ marginTop: 20 }}>By Person</div>
          {Object.entries(expenseReport.byWhom).sort((a, b) => b[1] - a[1]).map(([whom, total]) => (
            <div key={whom} className="breakdown-group">
              <div className="breakdown-header" onClick={() => toggleGroup('whom-' + whom)}>
                <span className="group-name">{whom}</span>
                <span className="group-total">₹{total.toLocaleString('en-IN')}</span>
              </div>
              {expandedGroups['whom-' + whom] && (
                <div style={{ padding: '8px 12px' }}>
                  {expenseReport.items.filter((e) => (e.forWhom || 'Self') === whom).map((e, i) => (
                    <div 
                      key={i} 
                      onClick={() => onSelectTxn?.(e)}
                      className="report-txn-row"
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '6px 8px', 
                        fontSize: 12, 
                        borderBottom: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                    >
                      <span>{formatDate(e.date)} — {e.category} — {e.details}</span>
                      <span style={{ fontWeight: 700 }}>₹{e.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : reportType === 'lending' ? (
        <div>
          <div className="report-summary">
            <div className="report-stat">
              <div className="label">Receivable</div>
              <div className="value" style={{ color: 'var(--emerald-600)' }}>₹{lendingReport.receivable.toLocaleString('en-IN')}</div>
            </div>
            <div className="report-stat">
              <div className="label">Payable</div>
              <div className="value" style={{ color: 'var(--red-500)' }}>₹{lendingReport.payable.toLocaleString('en-IN')}</div>
            </div>
          </div>

          {/* Search & Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div className="section-title" style={{ margin: 0 }}>By Person</div>
            <div style={{ position: 'relative', flex: '0 1 200px' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search person…"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px 6px 26px',
                  fontSize: 11,
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {personSearch && (
                <button
                  onClick={() => setPersonSearch('')}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
                >✕</button>
              )}
            </div>
          </div>

          {Object.entries(lendingReport.byPerson)
            .sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))
            .filter(([person]) => !personSearch || person.toLowerCase().includes(personSearch.toLowerCase()))
            .map(([person, data]) => {
            const pKey = person.trim().toLowerCase()
            const contactInfo = personContactMap[pKey] || {}
            const hasPhone = !!(contactInfo.mobileNo)
            const hasEmail = !!(contactInfo.email)

            return (
              <div key={person} className="breakdown-group">
                <div className="breakdown-header" onClick={() => toggleGroup('p-' + person)}>
                  <span className="group-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person}</span>
                    {hasPhone && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openWhatsAppPerson(contactInfo.mobileNo, person, data, normalizeLendingType) }}
                        title={`WhatsApp ${person} (${contactInfo.mobileNo})`}
                        style={{ border: 'none', background: 'rgba(37,211,102,0.12)', color: '#25D366', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}
                      >
                        <i className="fab fa-whatsapp" />
                      </button>
                    )}
                    {hasEmail && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEmailPerson(contactInfo.email, person, data, normalizeLendingType) }}
                        title={`Email ${person} (${contactInfo.email})`}
                        style={{ border: 'none', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}
                      >
                        <i className="fas fa-envelope" />
                      </button>
                    )}
                  </span>
                  <span className="group-total" style={{ color: data.net >= 0 ? 'var(--emerald-600)' : 'var(--red-500)', flexShrink: 0 }}>
                    {data.net >= 0 ? '+' : ''}₹{data.net.toLocaleString('en-IN')}
                  </span>
                </div>
                {expandedGroups['p-' + person] && (
                  <div style={{ padding: '8px 12px' }}>
                    {data.items.map((l, i) => {
                      const norm = normalizeLendingType(l.type)
                      let displayType = l.type
                      if (norm === 'LEND') displayType = 'Loan Given'
                      if (norm === 'BORROW') displayType = 'Borrowed'
                      if (norm === 'THEY_RETURN') displayType = 'Received Return'
                      if (norm === 'I_RETURN') displayType = 'I Returned'
                      if (norm === 'FORGIVE') displayType = 'Forgiven'
                      
                      return (
                        <div 
                          key={i} 
                          onClick={() => onSelectTxn?.(l)}
                          className="report-txn-row"
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            padding: '6px 8px', 
                            fontSize: 12, 
                            borderBottom: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          <span>{formatDate(l.date)} — {displayType} {l.remarks ? `(${l.remarks})` : ''}</span>
                          <span style={{ fontWeight: 700 }}>₹{l.amount.toLocaleString('en-IN')}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ marginTop: 14, width: '100%', boxSizing: 'border-box' }}>
          {/* BANK HISTORY VIEW */}
          <div className="report-summary">
            <div className="report-stat">
              <div className="label">Total Debits</div>
              <div className="value negative" style={{ color: 'var(--red-500)' }}>₹{bankStats.debit.toLocaleString('en-IN')}</div>
            </div>
            <div className="report-stat">
              <div className="label">Total Credits</div>
              <div className="value positive" style={{ color: 'var(--emerald-600)' }}>₹{bankStats.credit.toLocaleString('en-IN')}</div>
            </div>
            <div className="report-stat">
              <div className="label">Transactions</div>
              <div className="value">{bankStats.count}</div>
            </div>
          </div>

          {!filteredBankTxns.length ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <i className="fas fa-university" style={{ fontSize: 24, color: 'var(--accent-400)', marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No bank transactions found</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Upload CSV statements in Bank Sync to view records here.</div>
            </div>
          ) : (
            <div className="ledger-card" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', padding: 12 }}>
              <div className="ledger-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Bank Records ({filteredBankTxns.length})
                </span>
              </div>
              <div style={{ overflowX: 'hidden', width: '100%' }}>
                <table className="ledger-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '32%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '12%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '6px 4px' }}>Date</th>
                      <th style={{ padding: '6px 4px' }}>Bank</th>
                      <th style={{ padding: '6px 4px' }}>Description</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right' }}>Debit</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right' }}>Credit</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBankTxns.map((b, idx) => (
                      <tr key={b.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 4px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 10 }}>
                          {b.dateObj ? b.dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : ''}
                        </td>
                        <td style={{ padding: '6px 4px', fontWeight: 700, color: 'var(--text-primary)', fontSize: 10 }}>{b.bank}</td>
                        <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.3, fontSize: 10 }} title={b.description}>
                          {b.description}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--red-500)', fontWeight: b.debit ? 700 : 400, whiteSpace: 'nowrap', fontSize: 10 }}>
                          {b.debit ? `-₹${parseFloat(b.debit).toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--emerald-600)', fontWeight: b.credit ? 700 : 400, whiteSpace: 'nowrap', fontSize: 10 }}>
                          {b.credit ? `+₹${parseFloat(b.credit).toLocaleString('en-IN')}` : '-'}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontSize: 10 }}>
                          {b.balance ? `₹${parseFloat(b.balance).toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF Export / Print Document Layout */}
      <div className="print-only" style={{ padding: '20px', color: '#0f172a', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #334155', paddingBottom: 15, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e3a8a', margin: 0 }}>WalletVibe Report</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Personal Financial Statement</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>Generated: {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
            <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>Type: {reportType === 'expense' ? 'Expenses Statement' : 'Lend / Borrow Ledger'}</p>
          </div>
        </div>

        {/* Filters Summary */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: 12, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 }}>Report Parameters</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 11, color: '#475569' }}>
            <div><strong>Period:</strong> {isAllTime ? 'All Time' : `${formatDate(startDate)} to ${formatDate(endDate)}`}</div>
            {reportType === 'expense' ? (
              <>
                <div><strong>Categories:</strong> {selectedCats.length ? selectedCats.join(', ') : 'All'}</div>
                <div><strong>For Whom:</strong> {selectedWhom.length ? selectedWhom.join(', ') : 'All'}</div>
              </>
            ) : (
              <>
                <div><strong>Types:</strong> {selectedTypes.length ? selectedTypes.join(', ') : 'All'}</div>
                <div><strong>Persons:</strong> {selectedPersons.length ? selectedPersons.join(', ') : 'All'}</div>
              </>
            )}
          </div>
        </div>

        {/* Summary Stat Cards */}
        {pdfSettings.showStats && (
          reportType === 'expense' ? (
            <div style={{ display: 'flex', gap: 15, marginBottom: 25 }}>
              <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Expenses</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>₹{expenseReport.total.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Transactions</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{expenseReport.items.length}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 15, marginBottom: 25 }}>
              <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Net Receivable</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', marginTop: 4 }}>₹{lendingReport.receivable.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Net Payable</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', marginTop: 4 }}>₹{lendingReport.payable.toLocaleString('en-IN')}</div>
              </div>
            </div>
          )
        )}

        {/* Section: Breakdown Summary */}
        {pdfSettings.showBreakdown && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #cbd5e1', paddingBottom: 6, marginBottom: 10 }}>Summary Breakdown</h2>
            {reportType === 'expense' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 25 }}>
                <div>
                  <h3 style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>By Category</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <tbody>
                      {Object.entries(expenseReport.byCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                        <tr key={cat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 0', color: '#0f172a' }}>{cat}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>₹{total.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>By For Whom</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <tbody>
                      {Object.entries(expenseReport.byWhom).sort((a, b) => b[1] - a[1]).map(([whom, total]) => (
                        <tr key={whom} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 0', color: '#0f172a' }}>{whom}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>₹{total.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 25 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: 6 }}>Person</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Net Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(lendingReport.byPerson).sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net)).map(([person, data]) => (
                      <tr key={person} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 6, fontWeight: 600 }}>{person}</td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: data.net >= 0 ? '#059669' : '#dc2626' }}>
                          {data.net >= 0 ? '+' : ''}₹{data.net.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Section: Transaction Ledger */}
        {pdfSettings.showLedger && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #cbd5e1', paddingBottom: 6, marginBottom: 10 }}>Transaction Ledger (Details)</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: 6 }}>Date</th>
                  {reportType === 'expense' ? (
                    <>
                      <th style={{ padding: 6 }}>Category</th>
                      <th style={{ padding: 6 }}>For Whom</th>
                      {pdfSettings.showRemarks && <th style={{ padding: 6 }}>Details / Remarks</th>}
                    </>
                  ) : (
                    <>
                      <th style={{ padding: 6 }}>Person</th>
                      <th style={{ padding: 6 }}>Type</th>
                      {pdfSettings.showRemarks && <th style={{ padding: 6 }}>Remarks</th>}
                    </>
                  )}
                  <th style={{ padding: 6, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(reportType === 'expense' ? expenseReport.items : lendingReport.items)
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((item, idx) => {
                    const isLend = reportType === 'lending'
                    const amt = item.amount.toLocaleString('en-IN')
                    let typeText = item.type
                    let amtColor = '#0f172a'
                    
                    if (isLend) {
                      const norm = normalizeLendingType(item.type)
                      if (norm === 'LEND') { typeText = 'Loan Given'; amtColor = '#dc2626' }
                      else if (norm === 'BORROW') { typeText = 'Borrowed'; amtColor = '#059669' }
                      else if (norm === 'THEY_RETURN') { typeText = 'Received Return'; amtColor = '#059669' }
                      else if (norm === 'I_RETURN') { typeText = 'I Returned'; amtColor = '#dc2626' }
                      else if (norm === 'FORGIVE') { typeText = 'Forgiven'; amtColor = '#64748b' }
                    } else {
                      amtColor = '#dc2626'
                    }

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding: 6 }}>{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        {reportType === 'expense' ? (
                          <>
                            <td style={{ padding: 6 }}>{item.category}</td>
                            <td style={{ padding: 6 }}>{item.forWhom}</td>
                            {pdfSettings.showRemarks && <td style={{ padding: 6 }}>{[item.details, item.remarks].filter(Boolean).join(' — ')}</td>}
                          </>
                        ) : (
                          <>
                            <td style={{ padding: 6 }}>{item.person}</td>
                            <td style={{ padding: 6 }}>{typeText}</td>
                            {pdfSettings.showRemarks && <td style={{ padding: 6 }}>{item.remarks || '—'}</td>}
                          </>
                        )}
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: amtColor }}>
                          {isLend ? (['BORROW', 'THEY_RETURN'].includes(normalizeLendingType(item.type)) ? '+' : '-') : ''}₹{amt}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

function MultiSelect({ label, options, selected, onChange, open, setOpen }) {
  const containerRef = useRef(null)
  const [multiMode, setMultiMode] = useState(false)

  // Sync multiMode with selected length on open
  useEffect(() => {
    if (open) {
      setMultiMode(selected.length > 1)
    }
  }, [open, selected])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, setOpen])

  const pluralize = (word) => {
    const lower = word.toLowerCase()
    if (lower === 'category') return 'Categories'
    if (lower === 'person') return 'People'
    if (lower === 'for whom') return 'For Whom'
    return word + 's'
  }

  const displayText = selected.length === 0
    ? `All ${pluralize(label)}`
    : selected.length === 1
      ? selected[0]
      : `${selected[0]} +${selected.length - 1}`

  function handleOptionClick(opt) {
    if (multiMode) {
      if (selected.includes(opt)) {
        onChange(selected.filter((x) => x !== opt))
      } else {
        onChange([...selected, opt])
      }
    } else {
      onChange([opt])
      setOpen(false)
    }
  }

  return (
    <div className="multi-select" ref={containerRef} style={{ position: 'relative', zIndex: open ? 100 : 1 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <div className="multi-select-trigger" onClick={() => setOpen(!open)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 12, fontWeight: selected.length ? 700 : 500, color: selected.length ? 'var(--accent-600)' : 'var(--text-secondary)' }}>{displayText}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 9, color: 'var(--text-muted)' }}></i>
      </div>
      {open && (
        <div className="multi-select-options custom-scrollbar" style={{ animation: 'dropdown-spring 0.18s cubic-bezier(0.34,1.56,0.64,1)', zIndex: 9999 }}>
          {/* Header: label + multi toggle + Close button */}
          <div style={{
            borderBottom: '1px solid var(--border-color)',
            padding: '5px 8px',
            display: 'flex',
            gap: 4,
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-subtle)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {multiMode ? 'Multi' : 'Select'}
            </span>
            
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setMultiMode(m => !m)}
                style={{
                  padding: '3px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: multiMode ? 'var(--accent-gradient)' : 'var(--slate-100)',
                  color: multiMode ? '#fff' : 'var(--accent-600)',
                  border: multiMode ? 'none' : '1px solid var(--accent-200)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  boxShadow: multiMode ? 'var(--shadow-xs)' : 'none',
                }}
                title={multiMode ? 'Switch to single-select mode' : 'Enable multi-select mode'}
              >
                <i className={multiMode ? 'fas fa-check-double' : 'fas fa-tasks'} style={{ fontSize: 9 }} />
                {multiMode ? 'Multi' : 'Multi'}
              </button>

              <button
                type="button"
                onClick={() => { setOpen(false); setMultiMode(false) }}
                style={{
                  padding: '3px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'var(--red-50)',
                  color: 'var(--red-600)',
                  border: '1px solid var(--red-200)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
                title="Close dropdown"
              >
                <i className="fas fa-times" style={{ fontSize: 10 }} />
              </button>
            </div>
          </div>

          <div className="custom-scrollbar" style={{ maxHeight: 150, overflowY: 'auto' }}>
            {/* All option */}
            <div
              className={`multi-select-option${selected.length === 0 ? ' selected' : ''}`}
              onClick={() => { onChange([]); setOpen(false); setMultiMode(false) }}
            >
              {selected.length === 0 && <i className="fas fa-check" style={{ fontSize: 9, color: 'var(--accent-500)', marginRight: 4 }}></i>}
              <span style={{ fontWeight: 600, color: 'var(--accent-600)' }}>All {pluralize(label)}</span>
            </div>
            {options.map((opt) => (
              <div
                key={opt}
                className={`multi-select-option${selected.includes(opt) ? ' selected' : ''}`}
                onClick={() => handleOptionClick(opt)}
                style={{ display: 'flex', gap: 6, alignItems: 'center' }}
              >
                {multiMode ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--accent-600)', width: 12, height: 12, cursor: 'pointer' }}
                  />
                ) : (
                  selected.includes(opt)
                    ? <i className="fas fa-check" style={{ fontSize: 9, color: 'var(--accent-500)', width: 12 }} />
                    : <span style={{ display: 'inline-block', width: 12 }} />
                )}
                <span>{opt}</span>
              </div>
            ))}
          </div>

          {selected.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', padding: '5px 8px', background: 'var(--bg-subtle)', display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); setMultiMode(false) }}
                style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ✕ Clear all
              </button>
              {multiMode && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 9,
                    fontWeight: 700,
                    background: 'var(--accent-gradient)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
