import { useState, useEffect, useMemo } from 'react'
import { getAllExpenses } from '../api/expenses'
import { getAllLending, normalizeLendingType } from '../api/lending'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function ReportsView({ allExpenses, allLending, onSelectTxn }) {
  const [reportType, setReportType] = useState('expense')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isAllTime, setIsAllTime] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [pdfSettings, setPdfSettings] = useState({
    showStats: true,
    showBreakdown: true,
    showLedger: true,
    showRemarks: true,
  })
  const [downloading, setDownloading] = useState(false)

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
        doc.text('Transaction Ledger (Details)', 14, currentY + 4)
        currentY += 8

        const columns = []
        columns.push({ header: 'Date', dataKey: 'date' })
        if (reportType === 'expense') {
          columns.push({ header: 'Category', dataKey: 'category' })
          columns.push({ header: 'For Whom', dataKey: 'forWhom' })
          if (pdfSettings.showRemarks) {
            columns.push({ header: 'Details / Remarks', dataKey: 'remarks' })
          }
        } else {
          columns.push({ header: 'Person', dataKey: 'person' })
          columns.push({ header: 'Type', dataKey: 'type' })
          if (pdfSettings.showRemarks) {
            columns.push({ header: 'Remarks', dataKey: 'remarks' })
          }
        }
        columns.push({ header: 'Amount', dataKey: 'amount' })

        const rows = (reportType === 'expense' ? expenseReport.items : lendingReport.items)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map((item) => {
            const isLend = reportType === 'lending'
            const amt = item.amount.toLocaleString('en-IN')
            let typeText = item.type
            let amtStr = `Rs.${amt}`
            
            if (isLend) {
              const norm = normalizeLendingType(item.type)
              if (norm === 'LEND') { typeText = 'Loan Given'; amtStr = `-Rs.${amt}` }
              else if (norm === 'BORROW') { typeText = 'Borrowed'; amtStr = `+Rs.${amt}` }
              else if (norm === 'THEY_RETURN') { typeText = 'Received Return'; amtStr = `+Rs.${amt}` }
              else if (norm === 'I_RETURN') { typeText = 'I Returned'; amtStr = `-Rs.${amt}` }
              else if (norm === 'FORGIVE') { typeText = 'Forgiven'; amtStr = `-Rs.${amt}` }
            } else {
              amtStr = `-Rs.${amt}`
            }

            // Compact date: "25-Jun-26"
            const d = new Date(item.date)
            const day = String(d.getDate()).padStart(2, '0')
            const mon = d.toLocaleString('en', { month: 'short' })
            const yr = String(d.getFullYear()).slice(-2)
            const dateStr = `${day}-${mon}-${yr}`

            const rowData = {
              date: dateStr,
              amount: amtStr
            }

            if (reportType === 'expense') {
              rowData.category = item.category || ''
              rowData.forWhom = item.forWhom || ''
              if (pdfSettings.showRemarks) {
                rowData.remarks = [item.details, item.remarks].filter(Boolean).join(' — ')
              }
            } else {
              rowData.person = item.person || ''
              rowData.type = typeText
              if (pdfSettings.showRemarks) {
                rowData.remarks = item.remarks || '—'
              }
            }

            return rowData
          })

        // Column width config based on report type and remarks toggle
        const colStyles = {}
        if (reportType === 'expense') {
          colStyles.date = { cellWidth: 18 }
          colStyles.category = { cellWidth: 'auto', overflow: 'linebreak' }
          colStyles.forWhom = { cellWidth: 'auto', overflow: 'linebreak' }
          colStyles.amount = { halign: 'right', fontStyle: 'bold', cellWidth: 26 }
          if (pdfSettings.showRemarks) {
            colStyles.remarks = { cellWidth: 'auto', overflow: 'linebreak' }
          }
        } else {
          colStyles.date = { cellWidth: 18 }
          colStyles.person = { cellWidth: 'auto', overflow: 'linebreak' }
          colStyles.type = { cellWidth: 26 }
          colStyles.amount = { halign: 'right', fontStyle: 'bold', cellWidth: 26 }
          if (pdfSettings.showRemarks) {
            colStyles.remarks = { cellWidth: 'auto', overflow: 'linebreak' }
          }
        }

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

      doc.save(`WalletVibe_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not generate PDF. Please try using Print instead.');
    } finally {
      setDownloading(false)
    }
  };

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
        const norm = normalizeLendingType(l.type)
        // Map the options back to normalized values for comparison
        const normOptions = selectedTypes.map(t => normalizeLendingType(t))
        if (!normOptions.includes(norm)) return false
      }
      if (selectedPersons.length && !selectedPersons.includes(l.person)) return false
      return true
    })
  }, [allLending, isAllTime, startDate, endDate, selectedTypes, selectedPersons])

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
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <i className="fas fa-chart-pie" style={{ color: 'var(--accent-500)' }}></i> Report Generator
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              type="button"
              onClick={() => window.print()}
              className="btn-outline"
              title="Open browser print dialogue to save/print as PDF"
              style={{ 
                padding: '6px 12px', 
                fontSize: 11, 
                fontWeight: 700, 
                color: 'var(--accent-600)', 
                borderColor: 'var(--accent-200)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <i className="fas fa-print"></i> Print
            </button>
            <button 
              type="button"
              onClick={handleDownloadPDF}
              className="btn-outline"
              disabled={downloading}
              title="Download PDF directly to Downloads folder"
              style={{ 
                padding: '6px 12px', 
                fontSize: 11, 
                fontWeight: 700, 
                color: 'var(--emerald-600)', 
                borderColor: '#a7f3d0',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: downloading ? 'not-allowed' : 'pointer'
              }}
            >
              <i className="fas fa-download"></i> {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* PDF Export Settings */}
        <div style={{ 
          border: '1px solid var(--border-color)', 
          borderRadius: 'var(--radius-md)', 
          padding: 10, 
          background: 'var(--bg-subtle)', 
          marginBottom: 16 
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="fas fa-cog"></i> PDF & Report Settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={pdfSettings.showStats} 
                onChange={(e) => setPdfSettings(s => ({ ...s, showStats: e.target.checked }))}
                style={{ accentColor: 'var(--accent-600)' }}
              />
              Summary Cards
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={pdfSettings.showBreakdown} 
                onChange={(e) => setPdfSettings(s => ({ ...s, showBreakdown: e.target.checked }))}
                style={{ accentColor: 'var(--accent-600)' }}
              />
              Breakdown Summary
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={pdfSettings.showLedger} 
                onChange={(e) => setPdfSettings(s => ({ ...s, showLedger: e.target.checked }))}
                style={{ accentColor: 'var(--accent-600)' }}
              />
              Details Ledger
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox" 
                checked={pdfSettings.showRemarks} 
                onChange={(e) => setPdfSettings(s => ({ ...s, showRemarks: e.target.checked }))}
                style={{ accentColor: 'var(--accent-600)' }}
              />
              Show Comments/Remarks
            </label>
          </div>
        </div>

        {/* Type Switcher */}
        <div className="report-type-switcher">
          <button className={`report-type-btn ${reportType === 'expense' ? 'active' : ''}`} onClick={() => setReportType('expense')}>Expense</button>
          <button className={`report-type-btn ${reportType === 'lending' ? 'active' : ''}`} onClick={() => setReportType('lending')}>Lend / Borrow</button>
        </div>

        {/* Date Range */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAllTime} onChange={() => setIsAllTime(!isAllTime)} style={{ accentColor: 'var(--accent-600)' }} />
            All Time
          </label>
          {!isAllTime && (
            <div className="date-range-row">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
        </div>

        {/* Filters */}
        {reportType === 'expense' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <MultiSelect
              label="Category"
              options={catOptions}
              selected={selectedCats}
              onToggle={(v) => toggleFilter(selectedCats, setSelectedCats, v)}
              onClear={() => setSelectedCats([])}
              open={showCatDropdown}
              setOpen={setShowCatDropdown}
            />
            <MultiSelect
              label="For Whom"
              options={whomOptions}
              selected={selectedWhom}
              onToggle={(v) => toggleFilter(selectedWhom, setSelectedWhom, v)}
              onClear={() => setSelectedWhom([])}
              open={showWhomDropdown}
              setOpen={setShowWhomDropdown}
            />
          </div>
        )}
        {reportType === 'lending' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <MultiSelect
              label="Type"
              options={typeOptions}
              selected={selectedTypes}
              onToggle={(v) => toggleFilter(selectedTypes, setSelectedTypes, v)}
              onClear={() => setSelectedTypes([])}
              open={showTypeDropdown}
              setOpen={setShowTypeDropdown}
            />
            <MultiSelect
              label="Person"
              options={personOptions}
              selected={selectedPersons}
              onToggle={(v) => toggleFilter(selectedPersons, setSelectedPersons, v)}
              onClear={() => setSelectedPersons([])}
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
      ) : (
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

          <div className="section-title">By Person</div>
          {Object.entries(lendingReport.byPerson).sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net)).map(([person, data]) => (
            <div key={person} className="breakdown-group">
              <div className="breakdown-header" onClick={() => toggleGroup('p-' + person)}>
                <span className="group-name">{person}</span>
                <span className="group-total" style={{ color: data.net >= 0 ? 'var(--emerald-600)' : 'var(--red-500)' }}>
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
          ))}
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

function MultiSelect({ label, options, selected, onToggle, onClear, open, setOpen }) {
  const pluralize = (word) => {
    const lower = word.toLowerCase()
    if (lower === 'category') return 'Categories'
    if (lower === 'person') return 'People'
    if (lower === 'for whom') return 'For Whom'
    if (lower.endsWith('s') || lower.endsWith('sh') || lower.endsWith('ch') || lower.endsWith('x') || lower.endsWith('z')) return word + 'es'
    if (lower.endsWith('y') && !['a','e','i','o','u'].includes(lower[lower.length - 2])) return word.slice(0, -1) + 'ies'
    return word + 's'
  }
  const displayText = selected.length === 0 ? `All ${pluralize(label)}` : selected.join(', ')
  return (
    <div className="multi-select">
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div className="multi-select-trigger" onClick={() => setOpen(!open)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayText}</span>
        <i className="fas fa-chevron-down" style={{ fontSize: 10 }}></i>
      </div>
      {open && (
        <div className="multi-select-options custom-scrollbar">
          <div className="multi-select-option" onClick={onClear} style={{ color: 'var(--accent-600)', fontWeight: 700 }}>
            ✓ All
          </div>
          {options.map((opt) => (
            <label key={opt} className="multi-select-option">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => onToggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
