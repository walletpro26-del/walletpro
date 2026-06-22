import { useState, useEffect } from 'react'
import { getAttachment } from '../api/attachments'

export default function TransactionModal({ item, onClose, onEdit, onDelete, onShare }) {
  const [attachmentData, setAttachmentData] = useState(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  if (!item) return null

  const isLending = item.isLend || item.sheet === 'lending'

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return '' }
  }

  useEffect(() => {
    if (item.hasAttachment && !item.fileData) {
      setLoadingAttachment(true)
      const col = isLending ? 'lending' : 'expenses'
      getAttachment(col, item.id)
        .then((data) => setAttachmentData(data))
        .catch(() => {})
        .finally(() => setLoadingAttachment(false))
    } else if (item.fileData) {
      setAttachmentData(item.fileData)
    }
  }, [item.id])

  const iconCls = isLending ? 'lend' : 'expense'
  const iconName = isLending ? 'fa-exchange-alt' : 'fa-receipt'
  const typeLabel = isLending ? (item.label || item.type) : (item.category || 'Expense')

  function handleShare() {
    const lines = [
      `💰 *${typeLabel}*`,
      `Amount: ₹${item.amount}`,
      isLending ? `Person: ${item.person}` : `For: ${item.forWhom || 'Self'}`,
      `Date: ${formatDate(item.date)}`,
      item.details ? `Details: ${item.details}` : '',
      item.remarks ? `Remarks: ${item.remarks}` : '',
    ].filter(Boolean).join('\n')

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`
    window.open(url, '_blank')
  }

  return (
    <>
      <div className="modal-overlay" style={{ zIndex: 100 }}>
        <div className="modal-backdrop" onClick={onClose}></div>
        <div className="modal-container">
          <div className="modal-header">
            <div className="modal-header-info">
              <div className={`modal-header-icon txn-icon ${iconCls}`}>
                <i className={`fas ${iconName}`}></i>
              </div>
              <div>
                <h3>{typeLabel}</h3>
                <div className="modal-date">{formatDate(item.date)}</div>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="modal-body custom-scrollbar">
            <div className="amount-display">
              <div className="amount-value">₹{(item.amount || 0).toLocaleString('en-IN')}</div>
              <div className="amount-type">{typeLabel}</div>
            </div>

            <div className="detail-grid">
              {isLending ? (
                <>
                  <div className="detail-item">
                    <label>Person</label>
                    <span>{item.person || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Type</label>
                    <span>{item.type || '—'}</span>
                  </div>
                  <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                    <label>Remarks</label>
                    <span>{item.remarks || '—'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="detail-item">
                    <label>For Whom</label>
                    <span>{item.forWhom || 'Self'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Category</label>
                    <span>{item.category || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Payment</label>
                    <span>{item.paymentMode || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Details</label>
                    <span>{item.details || '—'}</span>
                  </div>
                  {item.remarks && (
                    <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                      <label>Remarks</label>
                      <span>{item.remarks}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Attachment */}
            {(item.hasAttachment || attachmentData) && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Attachment
                </div>
                {loadingAttachment ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading attachment...</div>
                ) : attachmentData ? (
                  <div
                    style={{
                      borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-color)',
                      cursor: 'pointer', maxHeight: 200,
                    }}
                    onClick={() => setFullscreen(true)}
                  >
                    {attachmentData.includes('application/pdf') ? (
                      <div style={{ padding: 16, textAlign: 'center', background: 'var(--slate-50)' }}>
                        <i className="fas fa-file-pdf" style={{ fontSize: 32, color: 'var(--red-500)' }}></i>
                        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600 }}>PDF Attachment</div>
                      </div>
                    ) : (
                      <img src={attachmentData} alt="Receipt" style={{ width: '100%', objectFit: 'cover', maxHeight: 200 }} />
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn-outline" onClick={() => onEdit?.(item)}>
              <i className="fas fa-edit"></i> Edit
            </button>
            <button className="btn-outline" style={{ color: 'var(--red-500)', borderColor: '#fecaca' }} onClick={() => { if (confirm('Delete this transaction?')) onDelete?.(item) }}>
              <i className="fas fa-trash-alt"></i> Delete
            </button>
            <button className="btn-outline" style={{ background: 'var(--emerald-500)', color: '#fff', borderColor: 'var(--emerald-500)', flex: 'none', padding: '10px 14px' }} onClick={handleShare}>
              <i className="fab fa-whatsapp" style={{ fontSize: 16 }}></i>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Attachment */}
      {fullscreen && attachmentData && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal-backdrop" style={{ background: 'rgba(15,23,42,0.95)' }} onClick={() => setFullscreen(false)}></div>
          <button
            className="modal-close"
            style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            onClick={() => setFullscreen(false)}
          >
            <i className="fas fa-times" style={{ fontSize: 18 }}></i>
          </button>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            {attachmentData.includes('application/pdf') ? (
              <iframe src={attachmentData} style={{ width: '90vw', height: '80vh', border: 'none', borderRadius: 'var(--radius-lg)' }}></iframe>
            ) : (
              <img src={attachmentData} alt="Attachment" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)' }} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
