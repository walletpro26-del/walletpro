import { useState, useRef, useEffect } from 'react'

export default function MultiSelectCombobox({ label, value, onChange, suggestions = [], placeholder = ' ' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  // Parse value into array
  const selected = value ? value.split('-').map(s => s.trim()).filter(Boolean) : []

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
    onChange(newSelected.join('-'))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (search.trim()) {
        if (!selected.includes(search.trim())) {
          const newSelected = [...selected, search.trim()]
          onChange(newSelected.join('-'))
        }
        setSearch('')
      } else {
        setOpen(false)
      }
    }
  }

  const displayValue = selected.join('-')
  
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
              <span style={{ flex: 1, fontSize: 13, fontWeight: selected.includes(item) ? 700 : 500 }}>{item}</span>
            </label>
          ))}
          {filteredSuggestions.length === 0 && !showAddOption && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              No matches found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
