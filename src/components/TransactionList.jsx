import { useState, useMemo } from 'react'
import { normalizeLendingType } from '../api/lending'
import { openWhatsApp, openEmail } from '../utils/commUtils'
import ShareFormatModal from './ShareFormatModal'
import { findMatchingBankProof } from '../api/bankProofMatcher'
import { loadSnapshot } from '../api/localCache'

export default function TransactionList({ items = [], title, onSelect }) {
  const [shareModal, setShareModal] = useState({ open: false, channel: 'whatsapp', contact: '', item: null })
  const [searchTerm, setSearchTerm] = useState('')

  const cachedBankRecords = useMemo(() => loadSnapshot('bank') || [], [items])

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
    return items.filter((item) => {
      const searchStr = [
        item.category, item.details, item.remarks, item.person,
        item.forWhom, item.type, item.label, item.paymentMode,
        item.date, String(item.amount || ''),
      ].filter(Boolean).join(' ').toLowerCase()
      return terms.every((t) => searchStr.includes(t))
    })
  }, [items, searchTerm])

  function formatDate(iso) {
    try {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}-${month}-${year}`
    } catch { return '' }
  }

  function getAmountDetails(item) {
    const isLending = item.isLend || item.sheet === 'lending'
    const amt = (item.amount || 0).toLocaleString('en-IN')

    if (isLending) {
      const norm = normalizeLendingType(item.type || item.label)
      if (norm === 'LEND' || norm === 'I_RETURN') {
        return { cls: 'negative', text: `-₹${amt}` }
      }
      if (norm === 'BORROW' || norm === 'THEY_RETURN') {
        return { cls: 'positive', text: `+₹${amt}` }
      }
      return { cls: '', text: `₹${amt}` }
    }

    return { cls: 'negative', text: `-₹${amt}` }
  }

  function getIcon(item) {
    if (item.isLend || item.sheet === 'lending') {
      const norm = normalizeLendingType(item.type || item.label)
      if (norm === 'LEND') return { cls: 'lend', icon: 'fa-hand-holding-usd' }
      if (norm === 'BORROW') return { cls: 'borrow', icon: 'fa-hand-holding-usd' }
      if (norm === 'THEY_RETURN' || norm === 'I_RETURN') return { cls: 'return', icon: 'fa-undo' }
      if (norm === 'FORGIVE') return { cls: 'return', icon: 'fa-heart' }
      return { cls: 'lend', icon: 'fa-exchange-alt' }
    }
    return { cls: 'expense', icon: 'fa-receipt' }
  }

  if (!items.length) {
    return (
      <div style={{ margin: '16px 0', textAlign: 'center', padding: '32px 16px', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: 'var(--accent-400)' }}>
          <i className="fas fa-receipt" style={{ fontSize: 20 }}></i>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>No recent activity yet</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>Saved transactions will appear here automatically.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Section Title + Inline Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>{title || 'Recent Activity'}</div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <i
            className="fas fa-search"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            style={{
              paddingLeft: 26,
              paddingRight: searchTerm ? 26 : 10,
              paddingTop: 5,
              paddingBottom: 5,
              fontSize: 11,
              fontWeight: 500,
              border: '1px solid var(--border-color)',
              borderRadius: 20,
              background: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: 120,
              transition: 'all 0.2s ease',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 10, lineHeight: 1 }}
            >✕</button>
          )}
        </div>
      </div>

      {/* No search results */}
      {filteredItems.length === 0 && searchTerm && (
        <div style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
          No results for "<strong>{searchTerm}</strong>"
        </div>
      )}

      <ul className="txn-list">
        {filteredItems.map((item, i) => {
          const icon = getIcon(item)
          const isLending = item.isLend || item.sheet === 'lending'
          const titleText = isLending ? (item.person || item.label || '') : (item.category || item.details || '')
          const sub = isLending
            ? `${item.label || item.type} — ${item.remarks || ''}`
            : `${item.forWhom || ''} — ${item.details || ''}`

          const amtInfo = getAmountDetails(item)
          const bankMatch = cachedBankRecords.length > 0 ? findMatchingBankProof(item, cachedBankRecords)[0] : null

          return (
            <li key={item.id || i} className="txn-item" onClick={() => onSelect?.(item)}>
              <div className={`txn-icon ${icon.cls}`}>
                <i className={`fas ${icon.icon}`}></i>
              </div>

              <div className="txn-info">
                <div className="txn-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{titleText}</span>
                  {bankMatch && (
                    <span
                      title={`Verified Bank Statement Proof (${bankMatch.bankTransaction.bank || 'Bank'})`}
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(99,102,241,0.12)',
                        color: '#6366f1',
                        fontWeight: 800,
                        border: '1px solid rgba(99,102,241,0.2)',
                      }}
                    >
                      🏦 Bank Proof
                    </span>
                  )}
                </div>
                <div className="txn-sub">{formatDate(item.date)} · {sub}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isLending && (item.mobileNo || item.phone) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShareModal({ open: true, channel: 'whatsapp', contact: item.mobileNo || item.phone, item }) }}
                    title="Send details via WhatsApp (Text / PDF)"
                    style={{
                      border: 'none',
                      background: 'rgba(37, 211, 102, 0.1)',
                      color: '#25D366',
                      width: 26, height: 26,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12,
                    }}
                  >
                    <i className="fab fa-whatsapp" />
                  </button>
                )}

                {isLending && item.email && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShareModal({ open: true, channel: 'email', contact: item.email, item }) }}
                    title="Send details via Email (Text / PDF)"
                    style={{
                      border: 'none',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      width: 26, height: 26,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11,
                    }}
                  >
                    <i className="fas fa-envelope" />
                  </button>
                )}

                <div className={`txn-amount ${amtInfo.cls}`} style={{ textAlign: 'right' }}>
                  {amtInfo.text}
                </div>

                {/* Attachment icon */}
                {(item.fileData || item.hasAttachment) && (
                  <div
                    title={item.fileName || 'View attachment'}
                    style={{
                      width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      marginLeft: 6,
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {item.fileData ? (
                      item.fileData.includes('application/pdf') ? (
                        <i className="fas fa-file-pdf" style={{ fontSize: 14, color: 'var(--red-500)' }}></i>
                      ) : (
                        <img src={item.fileData} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : item.mimeType ? (
                      item.mimeType.includes('pdf') || item.mimeType.includes('application/pdf') ? (
                        <i className="fas fa-file-pdf" style={{ fontSize: 14, color: 'var(--red-500)' }}></i>
                      ) : item.mimeType.includes('image') ? (
                        <i className="fas fa-image" style={{ fontSize: 14, color: 'var(--accent-500)' }}></i>
                      ) : (
                        <i className="fas fa-paperclip" style={{ fontSize: 12, color: 'var(--text-muted)' }}></i>
                      )
                    ) : item.hasAttachment ? (
                      <i className="fas fa-paperclip" style={{ fontSize: 12, color: 'var(--text-muted)' }}></i>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Share Format Selection Modal */}
      <ShareFormatModal
        isOpen={shareModal.open}
        onClose={() => setShareModal({ ...shareModal, open: false })}
        channel={shareModal.channel}
        targetContact={shareModal.contact}
        item={shareModal.item}
      />
    </div>
  )
}
