import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import MultiSelectCombobox from './MultiSelectCombobox'
import ExpenseDetailsField from './ExpenseDetailsField'
import { getDetailSuggestions } from '../utils/expenseDetailSuggestions'
import { normalizePersonName } from '../api/entityNormalizer'

export default function QuickFillModal({
  isOpen,
  onClose,
  quickFillItem,
  suggestions,
  onImport,
  onDirectSave,
  loading = false,
}) {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [forWhom, setForWhom] = useState('')
  const [category, setCategory] = useState('')
  const [paymentMode, setPaymentMode] = useState('Online/UPI')
  const [details, setDetails] = useState('')
  const [remarks, setRemarks] = useState('')

  // Sync state whenever quickFillItem changes or modal opens
  useEffect(() => {
    if (quickFillItem && isOpen) {
      setDate(today)
      setAmount(quickFillItem.amount !== undefined && quickFillItem.amount !== null ? String(quickFillItem.amount) : '')
      setForWhom(quickFillItem.whom || quickFillItem.forWhom || 'Self')
      setCategory(quickFillItem.category || 'Food & Dining')
      setPaymentMode(quickFillItem.mode || quickFillItem.paymentMode || 'Online/UPI')
      setDetails(quickFillItem.details || quickFillItem.label || '')
      setRemarks(quickFillItem.remarks || '')
    }
  }, [quickFillItem, isOpen])

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !quickFillItem) return null

  const originalAmount = quickFillItem.amount !== undefined && quickFillItem.amount !== null ? Number(quickFillItem.amount) : 0

  function adjustAmount(delta) {
    const current = parseFloat(amount) || 0
    const next = Math.max(0, current + delta)
    setAmount(next % 1 === 0 ? String(next) : next.toFixed(2))
  }

  function handleImportToForm(e) {
    e?.preventDefault()
    onImport({
      date,
      amount: amount || '0',
      forWhom: normalizePersonName(forWhom || 'Self'),
      category: category || 'Food & Dining',
      paymentMode: paymentMode || 'Online/UPI',
      details: details || '',
      remarks: remarks || '',
    })
    onClose()
  }

  function handleDirectSave(e) {
    e?.preventDefault()
    if (!onDirectSave) {
      handleImportToForm(e)
      return
    }
    onDirectSave({
      date,
      amount: amount || '0',
      forWhom: normalizePersonName(forWhom || 'Self'),
      category: category || 'Food & Dining',
      paymentMode: paymentMode || 'Online/UPI',
      details: details || '',
      remarks: remarks || '',
      formType: 'expense',
    })
    onClose()
  }

  const paymentModes = [
    { id: 'Online/UPI', label: 'Online/UPI', icon: 'fa-qrcode' },
    { id: 'Cash', label: 'Cash', icon: 'fa-money-bill-wave' },
    { id: 'Bank Transfer', label: 'Bank', icon: 'fa-university' },
    { id: 'Card', label: 'Card', icon: 'fa-credit-card' },
  ]

  const categorySuggestions = Array.from(
    new Set([
      'Food & Dining',
      'Health & Medical',
      'Education',
      'Electricity & Utilities',
      'Groceries',
      'Shopping',
      'Travel & Fuel',
      'Rent & Housing',
      'Entertainment',
      ...(suggestions?.categories || []),
    ])
  )

  const detailSuggestions = getDetailSuggestions(suggestions?.detailPatterns, category, forWhom)

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      {/* Frosted Backdrop */}
      <div className="modal-backdrop" onClick={onClose} />

      {/* Modal Dialog Card */}
      <div
        className="modal-container animate-fade-in"
        style={{
          maxWidth: 450,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 'auto',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-2xl, 20px)',
          boxShadow: 'var(--shadow-premium)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          zIndex: 100001,
          boxSizing: 'border-box',
        }}
      >
        {/* Consistent Modal Header */}
        <div className="modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <div className="modal-header-info">
            <div
              className="modal-header-icon"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(79, 70, 229, 0.12)',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              <i className="fas fa-bolt" style={{ color: '#f59e0b' }}></i>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Quick Fill Customizer
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 99,
                    background: 'var(--bg-subtle)',
                    color: 'var(--accent-600, #286348)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  Template
                </span>
              </div>
              <div className="modal-date" style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                Review or adjust before importing into form
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close" type="button">
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div
          className="modal-body custom-scrollbar"
          style={{
            padding: '14px 18px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flex: 1,
          }}
        >
          {/* Date & Amount 2-Column Row (Date on Left, Amount on Right - consistent with ExpenseForm) */}
          <div
            className="expense-amount-row"
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'stretch',
              flexWrap: 'nowrap',
              width: '100%',
              margin: 0,
            }}
          >
            {/* Date Box */}
            <div
              className="compact-input-block date-input-block"
              style={{
                flex: '1 1 138px',
                maxWidth: 160,
                minWidth: 0,
                padding: '6px 9px',
                borderRadius: 11,
                border: '1.5px solid var(--border-color)',
                background: 'var(--bg-card)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label
                  style={{
                    fontSize: 8.5,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    letterSpacing: 0.5,
                    margin: 0,
                  }}
                >
                  Date
                </label>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button
                    type="button"
                    onClick={() => setDate(today)}
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: 4,
                      border: 'none',
                      background: date === today ? '#4f46e5' : 'var(--bg-subtle)',
                      color: date === today ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setDate(yesterday)}
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: 4,
                      border: 'none',
                      background: date === yesterday ? '#4f46e5' : 'var(--bg-subtle)',
                      color: date === yesterday ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Yday
                  </button>
                </div>
              </div>
              <input
                aria-label="Expense date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{
                  padding: '2px 0',
                  fontSize: 12.5,
                  fontWeight: 700,
                  width: '100%',
                  boxSizing: 'border-box',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Amount Box */}
            <div
              className="compact-input-block amount-input-block"
              style={{
                flex: '1.5 1 160px',
                minWidth: 0,
                padding: '6px 12px',
                borderRadius: 11,
                border: '1.5px solid var(--border-color)',
                background: 'var(--bg-card)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
              }}
            >
              <label
                style={{
                  fontSize: 8.5,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 2,
                  display: 'block',
                  letterSpacing: 0.5,
                }}
              >
                Amount
              </label>
              <div className="amount-row" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="currency-sym" style={{ fontSize: 18, fontWeight: 900, marginRight: 4, color: '#4f46e5' }}>
                  ₹
                </span>
                <input
                  aria-label="Expense amount"
                  type="number"
                  step="0.01"
                  className="amount-input"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={{
                    padding: 0,
                    fontSize: 20,
                    fontWeight: 900,
                    width: '100%',
                    boxSizing: 'border-box',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Quick Adjust Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: -2 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Quick Adjust:
            </span>
            {[10, 20, 50, 100, 500].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => adjustAmount(delta)}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 99,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                +{delta}
              </button>
            ))}
            {originalAmount > 0 && String(amount) !== String(originalAmount) && (
              <button
                type="button"
                onClick={() => setAmount(String(originalAmount))}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 99,
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: 'var(--amber-600, #d97706)',
                  cursor: 'pointer',
                }}
              >
                Reset (₹{originalAmount})
              </button>
            )}
          </div>

          {/* Context Row: For Whom & Category side-by-side */}
          <div className="expense-context-row">
            <MultiSelectCombobox
              label="For whom"
              placeholder="e.g. Home"
              value={forWhom}
              onChange={(val) => setForWhom(val)}
              suggestions={suggestions?.forWhom || ['Self', 'Home', 'Family']}
            />
            <MultiSelectCombobox
              label="Category"
              placeholder="e.g. Fuel"
              value={category}
              onChange={(val) => setCategory(val)}
              allowMulti={false}
              suggestions={categorySuggestions}
            />
          </div>

          {/* Payment Mode Selector Pills */}
          <div>
            <label
              style={{
                fontSize: 8.5,
                fontWeight: 900,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 5,
                display: 'block',
                letterSpacing: 0.5,
              }}
            >
              Payment Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {paymentModes.map((m) => {
                const isSelected = paymentMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMode(m.id)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid #4f46e5' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-subtle)',
                      color: isSelected ? '#4f46e5' : 'var(--text-secondary)',
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <i className={`fas ${m.icon}`} style={{ fontSize: 11 }}></i>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Details / Description */}
          <div>
            <ExpenseDetailsField
              value={details}
              onChange={(val) => setDetails(val)}
              category={category}
              suggestions={detailSuggestions}
              allDetails={suggestions?.details || []}
              autoFilled={false}
            />
          </div>

          {/* Remarks (Optional) */}
          <div className="float-group" style={{ margin: 0 }}>
            <input
              type="text"
              className="float-input"
              placeholder=" "
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={{ fontSize: 12.5 }}
            />
            <label className={`float-label ${remarks ? 'active' : ''}`}>Optional Remarks / Bill Ref</label>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div
          className="modal-footer"
          style={{
            padding: '12px 18px',
            background: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              flex: '0 0 auto',
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
            {onDirectSave && (
              <button
                type="button"
                className="btn-outline"
                onClick={handleDirectSave}
                disabled={loading}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--emerald-500, #10b981)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: 'var(--emerald-600, #059669)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fas fa-check-circle"></i> Save Directly
              </button>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleImportToForm}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                width: 'auto',
                minHeight: 'auto',
              }}
            >
              <i className="fas fa-arrow-down"></i> Import to Form
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
