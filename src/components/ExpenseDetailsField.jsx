import { useId, useRef, useState, useLayoutEffect, useCallback } from 'react'
import { findReferenceRange, searchDetails } from '../utils/expenseDetailSuggestions'

export default function ExpenseDetailsField({
  value,
  onChange,
  suggestions = [],          // "previously used" chips (by category+forWhom)
  allDetails = [],           // full details corpus from DB for live search
  category = '',
  autoFilled = false,
  paymentMode,
  onPaymentModeChange,
}) {
  const id = useId()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimerRef = useRef(null)

  const [expanded, setExpanded] = useState(false)
  const [liveResults, setLiveResults] = useState([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [dropOpen, setDropOpen] = useState(false)

  const reference = findReferenceRange(value)
  const alternatives = suggestions.filter((item) => item.details !== value)
  const visibleSuggestions = expanded ? alternatives : alternatives.slice(0, 2)

  // Auto-resize textarea
  useLayoutEffect(() => {
    const input = inputRef.current
    const fit = () => {
      input.style.height = 'auto'
      input.style.height = `${Math.min(200, input.scrollHeight)}px`
    }
    fit()
    let lastWidth = input.clientWidth
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; fit() }
    })
    observer.observe(input)
    return () => observer.disconnect()
  }, [value])

  // Re-run live search whenever value changes
  useLayoutEffect(() => {
    const results = searchDetails(allDetails, value)
    // Don't show the dropdown if value exactly matches the only result (user just selected it)
    const hasMeaningful = results.length > 0 && !(results.length === 1 && results[0] === value)
    setLiveResults(results)
    setActiveIdx(-1)
    if (!hasMeaningful) setDropOpen(false)
  }, [value, allDetails])

  function handleChange(e) {
    const v = e.target.value
    onChange(v)
    if (v.trim().length > 0) {
      setDropOpen(true)
    } else {
      setDropOpen(false)
    }
  }

  function selectItem(text) {
    onChange(text)
    setDropOpen(false)
    setActiveIdx(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (!dropOpen || liveResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((prev) => Math.min(prev + 1, liveResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      selectItem(liveResults[activeIdx])
    } else if (e.key === 'Escape') {
      setDropOpen(false)
      setActiveIdx(-1)
    }
  }

  // Scroll active item into view
  useLayoutEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx]
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  // Close dropdown on blur (delayed to allow click on option)
  const handleBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => setDropOpen(false), 150)
  }, [])
  const handleFocus = useCallback(() => {
    clearTimeout(blurTimerRef.current)
    if (value.trim().length > 0 && liveResults.length > 0) setDropOpen(true)
  }, [value, liveResults.length])

  function editReference() {
    inputRef.current?.focus()
    inputRef.current?.setSelectionRange(reference.start, reference.end)
  }

  // Highlight matched substring
  function highlight(text) {
    const q = value.trim().toLowerCase()
    if (!q) return text
    const idx = text.toLowerCase().indexOf(q)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="details-ac-mark">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  const showDrop = dropOpen && liveResults.length > 0

  return (
    <section className="expense-details-field" aria-labelledby={`${id}-label`}>
      <div className="details-field-heading">
        <label id={`${id}-label`} htmlFor={id}>Details</label>
        <div className="details-heading-actions">
          {value && (
            <button
              type="button"
              className="details-text-action"
              onClick={() => { onChange(''); setDropOpen(false); inputRef.current?.focus() }}
            >
              Clear
            </button>
          )}
          {paymentMode !== undefined && (
            <label className="details-payment-mode">
              <span>Payment</span>
              <select
                aria-label="Payment mode"
                value={paymentMode}
                onChange={(event) => onPaymentModeChange(event.target.value)}
              >
                <option value="Online/UPI">Online/UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Textarea + live-search dropdown wrapper */}
      <div className="details-ac-wrap">
        <textarea
          id={id}
          ref={inputRef}
          className="details-editor"
          rows={2}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="What was this expense for? Add a shop, item or reference…"
          aria-autocomplete="list"
          aria-expanded={showDrop}
          aria-controls={showDrop ? `${id}-ac-list` : undefined}
          aria-activedescendant={activeIdx >= 0 ? `${id}-ac-opt-${activeIdx}` : undefined}
          aria-describedby={`${id}-hint`}
        />

        {showDrop && (
          <ul
            id={`${id}-ac-list`}
            ref={listRef}
            role="listbox"
            aria-label="Details suggestions"
            className="details-ac-dropdown"
          >
            {liveResults.map((text, i) => (
              <li
                key={text}
                id={`${id}-ac-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className={`details-ac-option${i === activeIdx ? ' is-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); selectItem(text) }}
              >
                <span className="details-ac-text">{highlight(text)}</span>
                <span className="details-ac-badge" aria-hidden="true">↵</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="details-field-hint" id={`${id}-hint`}>
        {autoFilled && <span>From your history · check before saving.</span>}
        {reference && (
          <button type="button" className="details-text-action" onClick={editReference}>
            Edit reference
          </button>
        )}
      </div>

      {/* Previously-used chips (unchanged behaviour) */}
      {alternatives.length > 0 && (
        <div className="details-suggestions">
          <div className="details-suggestions-heading">
            <span>Previously used{category ? ` in ${category}` : ''}</span>
            {alternatives.length > 2 && (
              <button
                type="button"
                className="details-text-action"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show less' : `View all (${alternatives.length})`}
              </button>
            )}
          </div>
          {visibleSuggestions.map((item) => (
            <button
              type="button"
              className="details-suggestion"
              key={item.details}
              onClick={() => { onChange(item.details); inputRef.current?.focus() }}
            >
              <span className="details-suggestion-copy">{item.details}</span>
              <span className="details-suggestion-action">Reuse <span aria-hidden="true">↗</span></span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
