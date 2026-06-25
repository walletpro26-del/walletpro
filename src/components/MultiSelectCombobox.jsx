import { useState, useRef, useEffect } from 'react'

export default function MultiSelectCombobox({ label, value, onChange, suggestions = [], placeholder = ' ' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  // Parse value into array using unique separator to avoid issues with hyphens in values
  const SEPARATOR = '|||'
  // For backward compatibility: only use new separator if value contains it, otherwise treat as single value
  const selected = value ? (
    value.includes(SEPARATOR) ? 
      value.split(SEPARATOR).map(s => s.trim()).filter(Boolean) :
      [value.trim()]
  ) : []

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    const newSelected = selected.filter(s => s !== item)
    onChange(newSelected.join(SEPARATOR))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (search.trim()) {
        if (!selected.includes(search.trim())) {
          const newSelected = [...selected, search.trim()]
          onChange(newSelected.join(SEPARATOR))
        }
        setSearch('')
      } else {
        setOpen(false)
      }
    }
  }

  const displayValue = selected.join(' - ')
  
  // Filter suggestions based on search
  const filteredSuggestions = suggestions.filter(s => s.toLowerCase().includes(search.toLowerCase()))
  
  // Show "Add" option if typing a new value
  const showAddOption = search.trim() && !suggestions.some(s => s.toLowerCase() === search.trim().toLowerCase())

  return (
    <div className="float-group" ref={containerRef}>
      <input
        type="text"
        className="float-input"
        placeholder={placeholder}
        value={open ? search : displayValue}
        onChange={(e) => {
          setSearch(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      <label className={`float-label ${open || displayValue ? 'active' : ''}`}>{label}</label>
      <i 
        className={`select-chevron fas fa-chevron-${open ? 'up' : 'down'}`} 
        onClick={() => setOpen(!open)} 
        style={{ cursor: 'pointer', zIndex: 2 }}
      ></i>

      {open && (
        <div className="search-dropdown custom-scrollbar" style={{ display: 'block', top: '100%', zIndex: 60, marginTop: 4 }}>
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
          
          {/* OK Button to close dropdown */}
          <div style={{ borderTop: '1px solid var(--border-color)', padding: '8px 10px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setSearch('')
              }}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--accent-600)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className="fas fa-check"></i> OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
