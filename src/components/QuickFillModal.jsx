import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import MultiSelectCombobox from './MultiSelectCombobox'
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
    // Round to 2 decimals if needed
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

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 12px',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      }}
    >
      {/* Frosted Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Modal Dialog Card */}
      <div
        className="card-premium animate-fade-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 'auto',
          background: 'var(--bg-primary, #ffffff)',
          borderRadius: 20,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          overflow: 'hidden',
          zIndex: 1000000,
          boxSizing: 'border-box',
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            padding: '14px 18px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
                color: '#fbbf24',
              }}
            >
              <i className="fas fa-bolt"></i>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: '#ffffff', letterSpacing: '0.2px' }}>
                  Quick Fill Customizer
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 99,
                    background: 'rgba(251, 191, 36, 0.25)',
                    color: '#fef08a',
                    border: '1px solid rgba(251, 191, 36, 0.4)',
                  }}
                >
                  Template
                </span>
              </div>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.82)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 280,
                }}
              >
                Review or edit before importing into form
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div
          className="custom-scrollbar"
          style={{
            padding: '16px 18px 40px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxHeight: 'calc(90vh - 130px)',
          }}
        >
          {/* Amount & Date 2-Column Row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            {/* Amount Box */}
            <div
              style={{
                flex: '1.2 1 150px',
                padding: '8px 12px',
                borderRadius: 12,
                border: '1.5px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-card, #ffffff)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <label
                style={{
                  fontSize: 8.5,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  color: 'var(--text-muted, #64748b)',
                  marginBottom: 2,
                  display: 'block',
                  letterSpacing: 0.5,
                }}
              >
                Amount (₹)
              </label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 900, marginRight: 4, color: '#4f46e5' }}>₹</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={{
                    padding: 0,
                    fontSize: 18,
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

            {/* Date Box */}
            <div
              style={{
                flex: '1 1 120px',
                padding: '8px 10px',
                borderRadius: 12,
                border: '1.5px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-card, #ffffff)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label
                  style={{
                    fontSize: 8.5,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted, #64748b)',
                    letterSpacing: 0.5,
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
                      background: date === today ? '#4f46e5' : 'var(--slate-100, #f1f5f9)',
                      color: date === today ? '#fff' : 'var(--text-muted, #64748b)',
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
                      background: date === yesterday ? '#4f46e5' : 'var(--slate-100, #f1f5f9)',
                      color: date === yesterday ? '#fff' : 'var(--text-muted, #64748b)',
                      cursor: 'pointer',
                    }}
                  >
                    Yday
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{
                  padding: '2px 0',
                  fontSize: 12,
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
          </div>

          {/* Quick Amount Quick-Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: -4 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--bg-subtle, #f8fafc)',
                  color: 'var(--text-secondary, #475569)',
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
                  border: '1px solid #f59e0b',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#d97706',
                  cursor: 'pointer',
                }}
              >
                Reset (₹{originalAmount})
              </button>
            )}
          </div>

          {/* For Whom */}
          <div>
            <MultiSelectCombobox
              label="For Whom? (e.g. Self, Home, Name)"
              title="Specify who this expense was for"
              value={forWhom}
              onChange={(val) => setForWhom(val)}
              suggestions={suggestions?.forWhom || ['Self', 'Home', 'Family']}
            />
          </div>

          {/* Category */}
          <div>
            <MultiSelectCombobox
              label="Category"
              title="Select spending category"
              value={category}
              onChange={(val) => setCategory(val)}
              suggestions={Array.from(
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
              )}
            />
          </div>

          {/* Payment Mode Selector Pills */}
          <div>
            <label
              style={{
                fontSize: 9,
                fontWeight: 900,
                textTransform: 'uppercase',
                color: 'var(--text-muted, #64748b)',
                marginBottom: 6,
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
                      padding: '8px 4px',
                      borderRadius: 10,
                      border: isSelected ? '1.5px solid #4f46e5' : '1px solid var(--border-color, #e2e8f0)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-card, #ffffff)',
                      color: isSelected ? '#4f46e5' : 'var(--text-secondary, #64748b)',
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: 10.5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none',
                    }}
                  >
                    <i className={`fas ${m.icon}`} style={{ fontSize: 13 }}></i>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Details / Description */}
          <div>
            <MultiSelectCombobox
              label="Details (e.g. Swiggy Order, Fuel)"
              title="Brief description or particulars"
              value={details}
              onChange={(val) => setDetails(val)}
              suggestions={suggestions?.details || []}
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

          {/* Live Preview Card */}
          <div
            style={{
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px dashed var(--border-color, #cbd5e1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Summary to Import
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 1,
                }}
              >
                {category || 'Expense'} · {details || 'No description'} ({forWhom || 'Self'})
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {date} · {paymentMode}
              </div>
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: '#ef4444',
                flexShrink: 0,
                textAlign: 'right',
              }}
            >
              -₹{parseFloat(amount) ? parseFloat(amount).toLocaleString('en-IN') : '0'}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--bg-subtle, #f8fafc)',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-card, #ffffff)',
              color: 'var(--text-secondary, #475569)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          {onDirectSave && (
            <button
              type="button"
              onClick={handleDirectSave}
              disabled={loading}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <i className="fas fa-check-circle"></i> Save Directly
            </button>
          )}

          <button
            type="button"
            onClick={handleImportToForm}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <i className="fas fa-arrow-down"></i> Import to Form
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
