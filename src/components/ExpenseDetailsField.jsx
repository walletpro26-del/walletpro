import { useId, useRef, useState, useLayoutEffect } from 'react'
import { findReferenceRange } from '../utils/expenseDetailSuggestions'

export default function ExpenseDetailsField({ value, onChange, suggestions = [], category = '', autoFilled = false, paymentMode, onPaymentModeChange }) {
  const id = useId()
  const inputRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const reference = findReferenceRange(value)
  const alternatives = suggestions.filter(item => item.details !== value)
  const visibleSuggestions = expanded ? alternatives : alternatives.slice(0, 2)
  useLayoutEffect(() => {
    const input = inputRef.current
    const fit = () => { input.style.height = 'auto'; input.style.height = `${Math.min(200, input.scrollHeight)}px` }
    fit()
    let lastWidth = input.clientWidth
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; fit() }
    })
    observer.observe(input)
    return () => observer.disconnect()
  }, [value])

  function editReference() {
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(reference.start, reference.end)
  }

  return (
    <section className="expense-details-field" aria-labelledby={`${id}-label`}>
      <div className="details-field-heading">
        <label id={`${id}-label`} htmlFor={id}>Details</label>
        <div className="details-heading-actions">
          {value && <button type="button" className="details-text-action" onClick={() => { onChange(''); inputRef.current?.focus() }}>Clear</button>}
          {paymentMode !== undefined && <label className="details-payment-mode"><span>Payment</span><select aria-label="Payment mode" value={paymentMode} onChange={event => onPaymentModeChange(event.target.value)}><option value="Online/UPI">Online/UPI</option><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="Card">Card</option></select></label>}
        </div>
      </div>
      <textarea
        id={id}
        ref={inputRef}
        className="details-editor"
        rows={2}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="What was this expense for? Add a shop, item or reference…"
        aria-describedby={`${id}-hint`}
      />
      <div className="details-field-hint" id={`${id}-hint`}>
        {autoFilled && <span>From your history · check before saving.</span>}
        {reference && <button type="button" className="details-text-action" onClick={editReference}>Edit reference</button>}
      </div>
      {alternatives.length > 0 && (
        <div className="details-suggestions">
          <div className="details-suggestions-heading">
            <span>Previously used{category ? ` in ${category}` : ''}</span>
            {alternatives.length > 2 && <button type="button" className="details-text-action" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `View all (${alternatives.length})`}</button>}
          </div>
          {visibleSuggestions.map(item => (
            <button type="button" className="details-suggestion" key={item.details} onClick={() => { onChange(item.details); inputRef.current?.focus() }}>
              <span className="details-suggestion-copy">{item.details}</span>
              <span className="details-suggestion-action">Reuse <span aria-hidden="true">↗</span></span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
