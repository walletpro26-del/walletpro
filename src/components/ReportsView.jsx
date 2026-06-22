import { useState, useEffect, useMemo } from 'react'
import { getAllExpenses } from '../api/expenses'
import { getAllLending, normalizeLendingType } from '../api/lending'

export default function ReportsView({ allExpenses, allLending }) {
  const [reportType, setReportType] = useState('expense')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isAllTime, setIsAllTime] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState({})

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
        <h3 style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <i className="fas fa-chart-pie" style={{ color: 'var(--accent-500)' }}></i> Report Generator
        </h3>

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
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--slate-100)' }}>
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
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--slate-100)' }}>
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
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--slate-100)' }}>
                        <span>{formatDate(l.date)} — {displayType}</span>
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
    </div>
  )
}

function MultiSelect({ label, options, selected, onToggle, onClear, open, setOpen }) {
  const displayText = selected.length === 0 ? `All ${label}s` : selected.join(', ')
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
