import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * MultiSelectCombobox
 * 
 * Features:
 * 1. Global mutual exclusion (only 1 dropdown open at any time; clicking next cell auto-closes previous).
 * 2. Decomposes multi-person `|||` strings into clean individual names in suggestion lists.
 * 3. Shows clean comma-separated names (`Hamid, Gulfam, Zakir`) in input and modern tag chips.
 * 4. Fast single-select (click item -> sets value & closes immediately).
 * 5. Optional Multi-Select mode with checkboxes and bulk select/clear actions.
 */
export default function MultiSelectCombobox({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = ' ',
  allowMulti = true,
  title = '',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [multiMode, setMultiMode] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const instanceId = useRef('cb_' + Math.random().toString(36).substring(2))

  const SEPARATOR = '|||'

  // Parse value into array
  const selected = useMemo(() => {
    if (!value) return []
    if (typeof value === 'string' && value.includes(SEPARATOR)) {
      return value.split(SEPARATOR).map((s) => s.trim()).filter(Boolean)
    }
    return [String(value).trim()].filter(Boolean)
  }, [value])

  // Clean suggestions: decompose any composite ||| strings and deduplicate
  const cleanSuggestions = useMemo(() => {
    const set = new Set()
    suggestions.forEach((s) => {
      if (!s) return
      if (typeof s === 'string' && s.includes(SEPARATOR)) {
        s.split(SEPARATOR).map((p) => p.trim()).filter(Boolean).forEach((p) => set.add(p))
      } else if (typeof s === 'string') {
        const trimmed = s.trim()
        if (trimmed) set.add(trimmed)
      }
    })
    return Array.from(set)
  }, [suggestions])

  // Formatted display value (e.g. "Hamid, Gulfam, Zakir")
  const displayValue = selected.length > 0 ? selected.join(', ') : ''

  function openDropdown() {
    setOpen(true)
    setSearch('')
    setIsDirty(false)

    // Announce to other comboboxes on the page to close immediately
    window.dispatchEvent(new CustomEvent('wv-combobox-open', { detail: { id: instanceId.current } }))

    const scrollToTop = () => {
      if (!containerRef.current) return
      try {
        containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
      } catch (e) {}
    }
    scrollToTop()
    setTimeout(scrollToTop, 80)
    setTimeout(scrollToTop, 240)
  }

  function closeDropdown() {
    if (isDirty && search.trim()) {
      onChange(search.trim())
    }
    setOpen(false)
    setSearch('')
    setIsDirty(false)
    setMultiMode(false)
  }

  // Close when ANY other combobox opens
  useEffect(() => {
    function handleOtherOpen(e) {
      if (e.detail?.id !== instanceId.current) {
        if (isDirty && search.trim()) {
          onChange(search.trim())
        }
        setOpen(false)
        setSearch('')
        setIsDirty(false)
        setMultiMode(false)
      }
    }
    window.addEventListener('wv-combobox-open', handleOtherOpen)
    return () => window.removeEventListener('wv-combobox-open', handleOtherOpen)
  }, [isDirty, search, onChange])

  // Close when clicking or tapping outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown()
      }
    }
    function handleFocusOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    document.addEventListener('focusin', handleFocusOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('focusin', handleFocusOutside)
    }
  }, [search, isDirty, onChange])

  function toggleMultiSelect(item) {
    let newSelected
    if (selected.includes(item)) {
      newSelected = selected.filter((s) => s !== item)
    } else {
      newSelected = [...selected, item]
    }
    onChange(newSelected.join(SEPARATOR))
  }

  function singleSelect(item) {
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
    } else if (e.key === 'Tab' || e.key === 'Escape') {
      closeDropdown()
    }
  }

  // Filter suggestions based on search
  const filteredSuggestions = cleanSuggestions.filter((s) =>
    s.toLowerCase().includes(search.toLowerCase())
  )

  // Show "Add" option if typing a new value not in suggestions
  const showAddOption = search.trim() && !cleanSuggestions.some(
    (s) => s.toLowerCase() === search.trim().toLowerCase()
  )

  return (
    <div
      className="float-group"
      ref={containerRef}
      style={{ position: 'relative', zIndex: open ? 80 : 1 }}
      title={title || label}
    >
      <input
        ref={inputRef}
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
        style={{
          paddingRight: 32,
          fontWeight: selected.length > 1 ? 700 : 500,
        }}
      />
      <label className={`float-label ${open || displayValue ? 'active' : ''}`}>{label}</label>

      {/* Chevron icon */}
      <i
        className={open ? 'select-chevron fas fa-chevron-up' : 'select-chevron fas fa-chevron-down'}
        onClick={() => {
          if (open) {
            closeDropdown()
          } else {
            openDropdown()
          }
        }}
        style={{
          cursor: 'pointer',
          zIndex: 2,
          color: open ? 'var(--accent-600, #4f46e5)' : 'var(--text-muted)',
          fontSize: 12,
          transition: 'color 0.2s, transform 0.2s',
        }}
        title={open ? 'Close options' : 'Open Options'}
      />

      {/* Selected tags chip row in multi-selected state */}
      {!open && selected.length > 1 && (
        <div
          className="custom-scrollbar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            padding: '4px 10px 6px',
            marginTop: -4,
            maxHeight: 60,
            overflowY: 'auto',
          }}
        >
          {selected.map((s, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 8px',
                borderRadius: 99,
                fontSize: 10.5,
                fontWeight: 800,
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#4f46e5',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{s}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const next = selected.filter((x) => x !== s)
                  onChange(next.join(SEPARATOR))
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4f46e5',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
                title={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div
          className="search-dropdown custom-scrollbar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(240px, 42vh)',
            minHeight: (filteredSuggestions.length > 0 || showAddOption) ? 130 : 'auto',
            overflow: 'hidden',
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--bg-card, #ffffff)',
            boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.25), 0 0 0 1.5px rgba(99, 102, 241, 0.35)',
            borderRadius: 12,
            border: 'none',
            animation: 'dropdown-spring 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Header Toolbar */}
          <div
            style={{
              borderBottom: '1px solid var(--border-color, #e2e8f0)',
              padding: '6px 10px',
              display: 'flex',
              gap: 6,
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-subtle, #f8fafc)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                color: multiMode ? '#4f46e5' : 'var(--text-muted, #64748b)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className={multiMode ? 'fas fa-check-double' : 'fas fa-list'} style={{ color: multiMode ? '#4f46e5' : '#94a3b8' }} />
              {multiMode ? `Multi-Select (${selected.length})` : 'Select One'}
            </span>

            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              {multiMode && filteredSuggestions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{
                      padding: '3px 7px',
                      fontSize: 9.5,
                      fontWeight: 800,
                      background: 'rgba(99,102,241,0.12)',
                      color: '#4f46e5',
                      border: '1px solid rgba(99,102,241,0.3)',
                      borderRadius: 6,
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
                        padding: '3px 7px',
                        fontSize: 9.5,
                        fontWeight: 800,
                        background: 'rgba(239,68,68,0.1)',
                        color: '#dc2626',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 6,
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
                  onClick={() => setMultiMode((m) => !m)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 800,
                    background: multiMode ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(99, 102, 241, 0.08)',
                    color: multiMode ? '#ffffff' : '#4f46e5',
                    border: multiMode ? 'none' : '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                    boxShadow: multiMode ? '0 2px 6px rgba(79,70,229,0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title={multiMode ? 'Switch to single-select mode' : 'Enable multi-select mode'}
                >
                  <i className={multiMode ? 'fas fa-check-square' : 'fas fa-tasks'} style={{ fontSize: 9.5 }} />
                  <span>{multiMode ? 'Multi On' : '⊞ Multi'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={closeDropdown}
                style={{
                  padding: '3px 8px',
                  fontSize: 10,
                  fontWeight: 800,
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#dc2626',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  whiteSpace: 'nowrap',
                }}
                title="Close dropdown"
              >
                <span>✕ Close</span>
              </button>
            </div>
          </div>

          {/* Scrollable Items List */}
          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {showAddOption && (
              <div
                className="search-dropdown-item"
                onClick={() => {
                  if (multiMode) {
                    toggleMultiSelect(search.trim())
                    setSearch('')
                    setIsDirty(false)
                  } else {
                    singleSelect(search.trim())
                  }
                }}
                style={{
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  background: 'rgba(99, 102, 241, 0.06)',
                  borderBottom: '1px solid var(--border-color, #e2e8f0)',
                }}
              >
                <i className="fas fa-plus-circle" style={{ color: '#4f46e5', fontSize: 13 }} />
                <span style={{ fontWeight: 800, color: '#4f46e5', fontSize: 12 }}>+ Add "{search.trim()}"</span>
              </div>
            )}

            {filteredSuggestions.map((item, i) => {
              const isSelected = selected.includes(item)
              return (
                <div
                  key={i}
                  className={`search-dropdown-item${isSelected ? ' selected' : ''}`}
                  onClick={() => handleItemClick(item)}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {multiMode ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ accentColor: '#4f46e5', width: 14, height: 14, cursor: 'pointer' }}
                    />
                  ) : (
                    isSelected && (
                      <i className="fas fa-check" style={{ fontSize: 11, color: '#4f46e5', width: 14 }} />
                    )
                  )}
                  {!multiMode && !isSelected && <span style={{ width: 14 }} />}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12.5,
                      fontWeight: isSelected ? 800 : 500,
                      color: isSelected ? '#4f46e5' : 'var(--text-primary, #1e293b)',
                    }}
                  >
                    {item}
                  </span>
                </div>
              )
            })}

            {filteredSuggestions.length === 0 && !showAddOption && (
              <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>
                <i className="fas fa-search" style={{ marginRight: 6 }} />
                No matches found — type to add custom entry
              </div>
            )}
          </div>

          {/* Multi-Select Done Footer Button */}
          {multiMode && (
            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', padding: '8px 10px', background: 'var(--bg-subtle, #f8fafc)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={closeDropdown}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: 12,
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
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
