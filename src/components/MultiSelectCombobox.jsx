import { useState, useRef, useEffect, useMemo, useId } from 'react'

export default function MultiSelectCombobox({ label, value, onChange, suggestions = [], placeholder = ' ', allowMulti = true }) {
  const id = useId()
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [multiMode, setMultiMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const selected = useMemo(() => String(value || '').split('|||').map(s => s.trim()).filter(Boolean), [value])
  const choices = useMemo(() => [...new Set(suggestions.flatMap(item => typeof item === 'string' ? item.split('|||').map(s => s.trim()).filter(Boolean) : []))], [suggestions])
  const filtered = choices.filter(item => item.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 60)
  const custom = multiMode && search.trim() && !choices.some(item => item.toLowerCase() === search.trim().toLowerCase())
  const options = custom ? [...filtered, search.trim()] : filtered
  const displayValue = String(value || '').includes('|||') ? selected.join(', ') : String(value || '')

  function close() {
    setOpen(false)
    setSearch('')
    setMultiMode(false)
    setActiveIndex(-1)
  }

  function openOptions() {
    if (open) return
    setSearch('')
    setActiveIndex(-1)
    setOpen(true)
    window.dispatchEvent(new CustomEvent('wv-combobox-open', { detail: { id } }))
  }

  useEffect(() => {
    const otherOpened = event => { if (event.detail?.id !== id) close() }
    const outside = event => { if (!containerRef.current?.contains(event.target)) close() }
    window.addEventListener('wv-combobox-open', otherOpened)
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('wv-combobox-open', otherOpened)
      document.removeEventListener('pointerdown', outside)
    }
  }, [id])

  function choose(item) {
    if (multiMode) {
      onChange((selected.includes(item) ? selected.filter(s => s !== item) : [...selected, item]).join('|||'))
      setSearch('')
      setActiveIndex(-1)
    } else {
      onChange(item)
      close()
    }
    inputRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openOptions()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(index => Math.max(0, Math.min(options.length - 1, index + direction)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (open && options[activeIndex]) choose(options[activeIndex])
      else if (multiMode && search.trim()) choose(search.trim())
      else close()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') close()
  }

  return (
    <div className={`float-group entry-combobox${open ? ' is-open' : ''}`} ref={containerRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
      <label className="entry-field-label" htmlFor={id}>{label}</label>
      <div className="combobox-input-wrap">
        <input
          id={id}
          ref={inputRef}
          type="text"
          className="float-input"
          placeholder={placeholder.trim() || `Choose or type ${label.toLowerCase()}`}
          value={multiMode ? search : displayValue}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          onChange={event => {
            openOptions()
            setSearch(event.target.value)
            setActiveIndex(-1)
            if (!multiMode) onChange(event.target.value)
          }}
          onClick={openOptions}
          onKeyDown={handleKeyDown}
        />
        <div className="combobox-field-actions">
          {(value || search) && <button type="button" className="combobox-icon-button" aria-label={`Clear ${label}`} onClick={() => { onChange(''); setSearch(''); setActiveIndex(-1); inputRef.current?.focus() }}>×</button>}
          <button type="button" className="combobox-icon-button" aria-label={`${open ? 'Close' : 'Show'} ${label} options`} aria-expanded={open} onClick={() => { if (open) close(); else { openOptions(); inputRef.current?.focus() } }}>
            <span className={`combobox-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {allowMulti && selected.length > 1 && (
        <div className="combobox-tags">
          {selected.map(item => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(selected.filter(s => s !== item).join('|||'))}>×</button></span>)}
        </div>
      )}
      {open && (
        <div className="combobox-panel">
          <div className="combobox-toolbar">
            <span>{multiMode ? `${selected.length} selected` : 'Suggestions'}</span>
            <div>
              {allowMulti && <button type="button" aria-pressed={multiMode} onClick={() => { setMultiMode(!multiMode); setSearch(''); setActiveIndex(-1); inputRef.current?.focus() }}>{multiMode ? 'Single select' : 'Select multiple'}</button>}
              {multiMode && filtered.length > 0 && <button type="button" onClick={() => onChange([...new Set([...selected, ...filtered])].join('|||'))}>Select all</button>}
              <button type="button" onClick={close}>Done</button>
            </div>
          </div>
          <div id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`} aria-multiselectable={multiMode || undefined} className="combobox-options custom-scrollbar">
            {options.map((item, index) => (
              <button type="button" role="option" id={`${id}-option-${index}`} key={item} aria-selected={selected.includes(item)} className={`combobox-option${index === activeIndex ? ' is-active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
                <span>{custom && index === options.length - 1 ? `Add “${item}”` : item}</span>
                {selected.includes(item) && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            {!options.length && <p className="combobox-empty">{search ? 'Your typed value is ready to use.' : 'Type a new value to get started.'}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
