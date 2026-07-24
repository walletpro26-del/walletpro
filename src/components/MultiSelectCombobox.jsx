import { useState, useRef, useEffect } from 'react'

/**
 * MultiSelectCombobox
 * 
 * Default UX: clicking an item sets value + CLOSES dropdown (fast single-select)
 * Multi-select: user can click the ⊞ toggle in dropdown header to enable checkboxes
 * allowMulti prop: if false, always single-select (no toggle shown)
 */
export default function MultiSelectCombobox({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = ' ',
  allowMulti = true,   // Show the multi-select toggle option
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [multiMode, setMultiMode] = useState(false) // user-toggled multi-select
  const containerRef = useRef(null)

  // Parse value into array using unique separator
  const SEPARATOR = '|||'
  const selected = value ? (
    value.includes(SEPARATOR)
      ? value.split(SEPARATOR).map(s => s.trim()).filter(Boolean)
      : [value.trim()].filter(Boolean)
  ) : []

  const displayValue = selected.length > 1 ? `${selected.length} Selected` : (selected[0] || '')

  function closeAndSave(newVal) {
    const finalVal = newVal !== undefined ? newVal : (isDirty ? search.trim() : value)
    onChange(finalVal || '')
    setOpen(false)
    setSearch('')
    setIsDirty(false)
    setMultiMode(false) // reset multi mode on close
  }

  function openDropdown() {
    setOpen(true)
    setSearch('')
    setIsDirty(false)
    // Auto-scroll active input field into clear view so suggestions are immediately visible
    setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }, 50)
  }

  // Close when clicking or tapping outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (isDirty && search.trim()) {
          onChange(search.trim())
        }
        setOpen(false)
        setSearch('')
        setIsDirty(false)
        setMultiMode(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [search, isDirty, onChange])

  function toggleMultiSelect(item) {
    // Multi-select: toggle checkbox, keep dropdown open
    let newSelected
    if (selected.includes(item)) {
      newSelected = selected.filter(s => s !== item)
    } else {
      newSelected = [...selected, item]
    }
    onChange(newSelected.join(SEPARATOR))
  }

  function singleSelect(item) {
    // Single-select: set value immediately and close
    onChange(item)
    setOpen(false)
    setSearch('')
    setIsDirty(false)
    setMultiMode(false)
  }

  function handleItemClick(item) {
    if (multiMode) {
      toggleMultiSelect(item)
    } else {
      singleSelect(item)
    }
  }

  function handleSelectAll() {
    const all = Array.from(new Set([...selected, ...filteredSuggestions]))
    onChange(all.join(SEPARATOR))
  }

  function handleClearAll() {
    onChange('')
  }

  function editItem(item) {
    setSearch(item)
    setOpen(true)
    setIsDirty(true)
    const newSelected = selected.filter(s => s !== item)
    onChange(newSelected.join(SEPARATOR))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (search.trim()) {
        if (multiMode) {
          toggleMultiSelect(search.trim())
          setSearch('')
          setIsDirty(false)
        } else {
          singleSelect(search.trim())
        }
      } else {
        setOpen(false)
        setMultiMode(false)
      }
    } else if (e.key === 'Tab') {
      if (isDirty && search.trim()) onChange(search.trim())
      setOpen(false)
      setSearch('')
      setIsDirty(false)
      setMultiMode(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
      setIsDirty(false)
      setMultiMode(false)
    }
  }

  // Filter suggestions based on search
  const filteredSuggestions = suggestions.filter(s =>
    s.toLowerCase().includes(search.toLowerCase())
  )

  // Show "Add" option if typing a new value not in suggestions
  const showAddOption = search.trim() && !suggestions.some(
    s => s.toLowerCase() === search.trim().toLowerCase()
  )

  return (
    <div className="float-group" ref={containerRef} style={open ? { zIndex: 100 } : undefined}>
      <input
        type="text"
        className="float-input"
        placeholder={placeholder}
        value={open ? search : displayValue}
        onChange={(e) => {
          setSearch(e.target.value)
          setIsDirty(true)
          if (!open) openDropdown()
        }}
        onFocus={() => {
          openDropdown()
          setSearch(displayValue)
        }}
        onKeyDown={handleKeyDown}
      />
      <label className={`float-label ${open || displayValue ? 'active' : ''}`}>{label}</label>

      {/* Chevron icon */}
      <i
        className={open ? 'select-chevron fas fa-chevron-up' : 'select-chevron fas fa-chevron-down'}
        onClick={() => {
          if (open) {
            if (isDirty && search.trim()) onChange(search.trim())
            setOpen(false)
            setSearch('')
            setIsDirty(false)
            setMultiMode(false)
          } else {
            openDropdown()
          }
        }}
        style={{
          cursor: 'pointer', zIndex: 2,
          color: open ? 'var(--accent-500)' : 'var(--text-muted)',
          fontSize: 12,
        }}
        title={open ? 'Close dropdown' : 'Open Options'}
      />

      {/* Selected tags in multi mode */}
      {!open && selected.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '2px 14px 6px', marginTop: -8 }}>
          {selected.map((s, i) => (
            <span key={i} className="selected-tag">
              {s}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleMultiSelect(s); if (!open) onChange(selected.filter(x => x !== s).join(SEPARATOR)) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 2, color: 'inherit', fontSize: 9, padding: 0 }}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div
          className="search-dropdown"
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(190px, 30vh)',
            overflow: 'hidden',
            top: '100%',
            zIndex: 9999,
            marginTop: 4,
            background: 'var(--bg-card)',
            animation: 'dropdown-spring 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
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
              {multiMode && filteredSuggestions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{
                      padding: '2px 5px',
                      fontSize: 9.5,
                      fontWeight: 700,
                      background: 'rgba(99,102,241,0.1)',
                      color: '#6366f1',
                      border: '1px solid rgba(99,102,241,0.25)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title="Select all matching suggestions"
                  >
                    ✓ All
                  </button>
                  {selected.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      style={{
                        padding: '2px 5px',
                        fontSize: 9.5,
                        fontWeight: 700,
                        background: 'rgba(239,68,68,0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="Clear all selected items"
                    >
                      ✕ Clear
                    </button>
                  )}
                </>
              )}

              {allowMulti && (
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
              )}

              <button
                type="button"
                onClick={() => {
                  if (isDirty && search.trim()) onChange(search.trim())
                  setOpen(false)
                  setSearch('')
                  setIsDirty(false)
                  setMultiMode(false)
                }}
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
                <i className="fas fa-times" style={{ fontSize: 9 }} />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {showAddOption && (
              <div
                className="search-dropdown-item"
                onClick={() => {
                  if (multiMode) { toggleMultiSelect(search.trim()); setSearch(''); setIsDirty(false) }
                  else singleSelect(search.trim())
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--accent-600)' }}>+ Add "{search.trim()}"</span>
              </div>
            )}
            {filteredSuggestions.map((item, i) => (
              <div
                key={i}
                className={`search-dropdown-item${selected.includes(item) ? ' selected' : ''}`}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: selected.includes(item) ? 'rgba(99,102,241,0.08)' : 'transparent',
                  borderLeft: selected.includes(item) ? '3px solid #6366f1' : '3px solid transparent',
                  paddingLeft: selected.includes(item) ? 9 : 12,
                }}
              >
                {multiMode ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(item)}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--accent-600)', width: 13, height: 13, cursor: 'pointer' }}
                  />
                ) : (
                  selected.includes(item) && (
                    <i className="fas fa-check" style={{ fontSize: 9, color: 'var(--accent-500)', width: 13 }} />
                  )
                )}
                {!multiMode && !selected.includes(item) && <span style={{ width: 13 }} />}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: selected.includes(item) ? 700 : 500,
                    color: selected.includes(item) ? 'var(--accent-600)' : 'var(--text-primary)',
                  }}
                >
                  {item}
                </span>
              </div>
            ))}
            {filteredSuggestions.length === 0 && !showAddOption && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                <i className="fas fa-search" style={{ marginRight: 6 }} />
                No matches — press Enter to add
              </div>
            )}
          </div>

          {/* Multi mode footer — Done button */}
          {multiMode && selected.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', padding: '6px 10px', background: 'var(--bg-subtle)' }}>
              <button
                type="button"
                onClick={() => { setOpen(false); setMultiMode(false); setSearch(''); setIsDirty(false) }}
                style={{
                  width: '100%',
                  padding: '7px',
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'var(--accent-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <i className="fas fa-check" /> Done ({selected.length} selected)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
