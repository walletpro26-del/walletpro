import { useState, useRef, useEffect } from 'react'

export default function MultiSelectCombobox({ label, value, onChange, suggestions = [], placeholder = ' ' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const containerRef = useRef(null)

  // Parse value into array using unique separator to avoid issues with hyphens in values
  const SEPARATOR = '|||'
  // For backward compatibility: only use new separator if value contains it, otherwise treat as single value
  const selected = value ? (
    value.includes(SEPARATOR) ? 
      value.split(SEPARATOR).map(s => s.trim()).filter(Boolean) :
      [value.trim()]
  ) : []

  const displayValue = selected.join(' - ')

  function closeAndSave() {
    if (isDirty) {
      onChange(search.trim())
    }
    setOpen(false)
    setSearch('')
    setIsDirty(false)
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (isDirty) {
          onChange(search.trim())
        }
        setOpen(false)
        setSearch('')
        setIsDirty(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [search, isDirty, onChange])

  // Sync search input with checkboxes when user has not typed anything manually
  useEffect(() => {
    if (open && !isDirty) {
      setSearch(displayValue)
    }
  }, [displayValue, open, isDirty])

  function toggleSelect(item) {
    let newSelected
    if (selected.includes(item)) {
      newSelected = selected.filter(s => s !== item)
    } else {
      newSelected = [...selected, item]
    }
    onChange(newSelected.join(SEPARATOR))
  }

  // Allow editing an already-selected item: put it into the input for modification
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
      closeAndSave()
    } else if (e.key === 'Tab') {
      if (isDirty) {
        onChange(search.trim())
      }
      setOpen(false)
      setSearch('')
      setIsDirty(false)
    }
  }

  // Filter suggestions based on search
  const filteredSuggestions = suggestions.filter(s => s.toLowerCase().includes(search.toLowerCase()))
  
  // Show "Add" option if typing a new value
  const showAddOption = search.trim() && !suggestions.some(s => s.toLowerCase() === search.trim().toLowerCase())

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
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setSearch(displayValue)
          setIsDirty(false)
        }}
        onKeyDown={handleKeyDown}
      />
      <label className={`float-label ${open || displayValue ? 'active' : ''}`}>{label}</label>
      <i 
        className={open ? "select-chevron fas fa-check-circle" : "select-chevron fas fa-chevron-down"} 
        onClick={() => {
          if (open) {
            closeAndSave()
          } else {
            setOpen(true)
            setSearch(displayValue)
            setIsDirty(false)
          }
        }} 
        style={{ cursor: 'pointer', zIndex: 2, color: open ? 'var(--emerald-500)' : 'var(--text-muted)' }}
        title={open ? "Done" : "Open Options"}
      ></i>

      {open && (
        <div className="search-dropdown" style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflow: 'hidden', top: '100%', zIndex: 60, marginTop: 4, background: 'var(--bg-card)' }}>
          {/* Sticky OK Button Header at the top of the dropdown */}
          <div style={{ borderBottom: '1px solid var(--border-color)', padding: '8px 10px', display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 }}>Select Option(s)</span>
            <button
              type="button"
              onClick={closeAndSave}
              style={{
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 700,
                background: 'var(--accent-600)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <i className="fas fa-check"></i> OK
            </button>
          </div>

          {/* Scrollable list items */}
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {showAddOption && (
              <div className="search-dropdown-item" onClick={() => {
                toggleSelect(search.trim())
                setSearch('')
              }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-600)' }}>+ Add "{search.trim()}"</span>
              </div>
            )}
            {filteredSuggestions.map((item, i) => (
              <label key={i} className="search-dropdown-item" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selected.includes(item)}
                  onChange={() => toggleSelect(item)}
                  style={{ accentColor: 'var(--accent-600)', width: 14, height: 14 }}
                />
                <span
                  onClick={(e) => { e.stopPropagation(); editItem(item) }}
                  style={{ flex: 1, fontSize: 13, fontWeight: selected.includes(item) ? 700 : 500, cursor: 'text' }}
                  title="Click to edit"
                >{item}</span>
              </label>
            ))}
            {filteredSuggestions.length === 0 && !showAddOption && (
              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                No matches found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
