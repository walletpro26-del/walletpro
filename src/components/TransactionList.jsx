import { normalizeLendingType } from '../api/lending'
import { openWhatsApp, openEmail } from '../utils/commUtils'

export default function TransactionList({ items = [], title, onSelect }) {
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

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
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

  return (
    <div>
      <div className="section-title">{title || 'Recent Activity'}</div>
      <ul className="txn-list">
        {items.map((item, i) => {
          const icon = getIcon(item)
          const isLending = item.isLend || item.sheet === 'lending'
          const title = isLending ? (item.person || item.label || '') : (item.category || item.details || '')
          const sub = isLending
            ? `${item.label || item.type} — ${item.remarks || ''}`
            : `${item.forWhom || ''} — ${item.details || ''}`

          const amtInfo = getAmountDetails(item)

          return (
            <li key={item.id || i} className="txn-item" onClick={() => onSelect?.(item)}>
              <div className={`txn-icon ${icon.cls}`}>
                <i className={`fas ${icon.icon}`}></i>
              </div>

              <div className="txn-info">
                <div className="txn-title">{title}</div>
                <div className="txn-sub">{formatDate(item.date)} · {sub}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isLending && (item.mobileNo || item.phone) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openWhatsApp(item.mobileNo || item.phone, item) }}
                    title="Send details via WhatsApp"
                    style={{
                      border: 'none',
                      background: 'rgba(37, 211, 102, 0.1)',
                      color: '#25D366',
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12
                    }}
                  >
                    <i className="fab fa-whatsapp" />
                  </button>
                )}

                {isLending && item.email && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEmail(item.email, item) }}
                    title="Send details via Email"
                    style={{
                      border: 'none',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11
                    }}
                  >
                    <i className="fas fa-envelope" />
                  </button>
                )}

                <div className={`txn-amount ${amtInfo.cls}`} style={{ textAlign: 'right' }}>
                  {amtInfo.text}
                </div>

                {/* Small attachment preview / icon at the right extreme */}
                {(item.fileData || item.hasAttachment) && (
                  <div 
                    title={item.fileName || "View attachment"}
                    style={{ 
                      width: 32, 
                      height: 32, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      background: 'var(--bg-subtle)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 'var(--radius-sm)', 
                      marginLeft: 6, 
                      flexShrink: 0, 
                      overflow: 'hidden' 
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
    </div>
  )
}
