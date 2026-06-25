import { normalizeLendingType } from '../api/lending'

export default function TransactionList({ items = [], title, onSelect }) {
  if (!items.length) return null

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

              {/* Small attachment preview / icon */}
              <div style={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                {item.fileData ? (
                  item.fileData.includes('application/pdf') ? (
                    <i className="fas fa-file-pdf" style={{ fontSize: 18, color: 'var(--red-500)' }}></i>
                  ) : (
                    <img src={item.fileData} alt="preview" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                  )
                ) : item.hasAttachment ? (
                  <i className="fas fa-paperclip" style={{ fontSize: 16, color: 'var(--text-muted)' }}></i>
                ) : null}
              </div>

              <div className="txn-info">
                <div className="txn-title">{title}</div>
                <div className="txn-sub">{formatDate(item.date)} · {sub}</div>
              </div>
              <div className={`txn-amount ${amtInfo.cls}`}>
                {amtInfo.text}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
