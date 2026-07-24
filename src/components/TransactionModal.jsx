import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getAttachment } from '../api/attachments'
import { openWhatsApp, openEmail } from '../utils/commUtils'
import ShareFormatModal from './ShareFormatModal'
import { findMatchingBankProof } from '../api/bankProofMatcher'

export default function TransactionModal({ item, onClose, onEdit, onDelete, onShare }) {
  const [attachmentData, setAttachmentData] = useState(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentSuccess, setAttachmentSuccess] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [shareModal, setShareModal] = useState({ open: false, channel: 'whatsapp', contact: '' })
  const [showAllBankMatches, setShowAllBankMatches] = useState(false)

  const bankMatches = useMemo(() => {
    if (!item) return []
    return findMatchingBankProof(item)
  }, [item])

  const displayBankMatches = useMemo(() => {
    if (!bankMatches || bankMatches.length === 0) return []
    if (showAllBankMatches) return bankMatches
    const highQuality = bankMatches.filter((m) => m.confidence >= 50)
    return highQuality.length > 0 ? highQuality.slice(0, 3) : bankMatches.slice(0, 3)
  }, [bankMatches, showAllBankMatches])

  const isBank = Boolean(item?.sheet === 'bank' || item?.bank !== undefined)
  const isLending = Boolean(!isBank && (item?.isLend || item?.sheet === 'lending'))

  useEffect(() => {
    if (!item || isBank) return
    if (item.hasAttachment && !item.fileData) {
      setLoadingAttachment(true)
      setAttachmentError('')
      setAttachmentSuccess('')
      const col = isLending ? 'lending' : 'expenses'
      getAttachment(col, item.id)
        .then((data) => {
          if (data) {
            setAttachmentData(data)
            setAttachmentSuccess('✔ Attachment fetched successfully')
          } else {
            setAttachmentError('⚠ Attachment file data unavailable.')
          }
        })
        .catch((err) => {
          setAttachmentError('⚠ Failed to load attachment: ' + (err?.message || 'Error'))
        })
        .finally(() => setLoadingAttachment(false))
    } else if (item.fileData) {
      setAttachmentData(item.fileData)
      setAttachmentSuccess('✔ Attachment fetched successfully')
    }
  }, [item?.id, item?.hasAttachment, item?.fileData, isLending, isBank])

  if (!item) return null

  function formatDate(iso) {
    try {
      if (!iso) return ''
      return new Date(iso).toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return '' }
  }

  const iconCls = isBank ? 'bank' : isLending ? 'lend' : 'expense'
  const iconName = isBank ? 'fa-university' : isLending ? 'fa-exchange-alt' : 'fa-receipt'
  const typeLabel = isBank ? `${item.bank || 'Bank'} Entry` : isLending ? (item.label || item.type) : (item.category || 'Expense')

  function handleShare() {
    const lines = [
      `💰 *${typeLabel}*`,
      `Amount: ₹${item.amount || item.debit || item.credit || 0}`,
      isBank ? `Bank: ${item.bank || '—'}` : isLending ? `Person: ${item.person}` : `For: ${item.forWhom || 'Self'}`,
      `Date: ${formatDate(item.dateObj || item.date)}`,
      item.description || item.details ? `Details: ${item.description || item.details}` : '',
      item.remarks ? `Remarks: ${item.remarks}` : '',
    ].filter(Boolean).join('\n')

    const url = `https://wa.me/?text=${encodeURIComponent(lines)}`
    window.open(url, '_blank')
  }

  return createPortal(
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
                <div className="modal-date">{formatDate(item.dateObj || item.date)}</div>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="modal-body custom-scrollbar">
            <div className="amount-display">
              <div className="amount-value" style={{ color: isBank ? (item.debit ? '#ef4444' : '#10b981') : undefined }}>
                {isBank ? (item.debit ? `-₹${parseFloat(item.debit).toLocaleString('en-IN')}` : `+₹${parseFloat(item.credit || 0).toLocaleString('en-IN')}`) : `₹${(item.amount || 0).toLocaleString('en-IN')}`}
              </div>
              <div className="amount-type">{typeLabel}</div>
            </div>

            <div className="detail-grid">
              {isBank ? (
                <>
                  <div className="detail-item">
                    <label>Bank Name</label>
                    <span style={{ fontWeight: 700 }}>{item.bank || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Transaction Type</label>
                    <span style={{ fontWeight: 700, color: item.debit ? '#ef4444' : '#10b981' }}>
                      {item.debit ? 'Debit (Withdrawal)' : 'Credit (Deposit)'}
                    </span>
                  </div>
                  <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                    <label>Description / Narration</label>
                    <span>{item.description || item.details || '—'}</span>
                  </div>
                  {item.balance && (
                    <div className="detail-item">
                      <label>Balance After Txn</label>
                      <span>₹{parseFloat(item.balance).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </>
              ) : isLending ? (
                <>
                  <div className="detail-item">
                    <label>Person</label>
                    <span>{item.person || '—'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Type</label>
                    <span>{item.type || '—'}</span>
                  </div>
                  {(item.mobileNo || item.phone) && (
                    <div className="detail-item">
                      <label>Mobile (WhatsApp)</label>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a' }}>
                        <i className="fab fa-whatsapp" />
                        {item.mobileNo || item.phone}
                      </span>
                    </div>
                  )}
                  {item.email && (
                    <div className="detail-item">
                      <label>Email Address</label>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2563eb' }}>
                        <i className="fas fa-envelope" />
                        {item.email}
                      </span>
                    </div>
                  )}
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
            {(item.hasAttachment || attachmentData || loadingAttachment || attachmentError) && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Attachment
                  </span>
                  {attachmentSuccess && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--emerald-600)' }}>
                      {attachmentSuccess}
                    </span>
                  )}
                </div>

                {loadingAttachment && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-spinner fa-spin"></i> Fetching attachment data...
                  </div>
                )}

                {attachmentError && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red-600)', background: 'var(--red-50)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                    {attachmentError}
                  </div>
                )}

                {!loadingAttachment && attachmentData && (
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
                        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600 }}>{item.fileName || 'PDF Attachment (Tap to view)'}</div>
                      </div>
                    ) : (
                      <img src={attachmentData} alt="Receipt" style={{ width: '100%', objectFit: 'cover', maxHeight: 200 }} />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bank Proof Match Section */}
            {bankMatches.length > 0 ? (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fas fa-university" style={{ color: '#6366f1' }} /> Bank Proofs ({bankMatches.length})
                  </span>
                  <span style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>Sorted by Match %</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }} className="custom-scrollbar">
                  {displayBankMatches.map((m, idx) => {
                    const b = m.bankTransaction
                    const amt = (b.debit || b.credit || 0).toLocaleString('en-IN')
                    const isDebit = b.debit > 0
                    const conf = m.confidence
                    const badgeBg = conf >= 80 ? 'rgba(16,185,129,0.12)' : conf >= 60 ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)'
                    const badgeColor = conf >= 80 ? '#10b981' : conf >= 60 ? '#6366f1' : '#d97706'
                    const badgeBorder = conf >= 80 ? 'rgba(16,185,129,0.3)' : conf >= 60 ? 'rgba(99,102,241,0.3)' : 'rgba(245,158,11,0.3)'

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-subtle, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          fontSize: 10.5,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 10.5 }}>
                            🏦 {b.bank || 'Bank Statement'}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: badgeColor, background: badgeBg, padding: '1px 7px', borderRadius: 99, border: `1px solid ${badgeBorder}` }}>
                            {conf >= 80 ? '🟢' : conf >= 60 ? '🔵' : '🟡'} {conf}% Match
                          </span>
                        </div>

                        <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.description || b.narration}>
                          {b.description || b.narration || 'Bank Entry'}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9.5, color: 'var(--text-muted)' }}>
                          <span>📅 {new Date(b.dateObj || b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span style={{ fontWeight: 800, color: isDebit ? '#ef4444' : '#10b981' }}>
                            {isDebit ? `-₹${amt}` : `+₹${amt}`} {b.balance ? `(Bal ₹${b.balance.toLocaleString('en-IN')})` : ''}
                          </span>
                        </div>

                        {/* Match Reasons Chips */}
                        {m.reasons && m.reasons.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                            {m.reasons.map((r, rIdx) => (
                              <span
                                key={rIdx}
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: 'rgba(99,102,241,0.08)',
                                  color: '#6366f1',
                                  border: '1px solid rgba(99,102,241,0.2)',
                                }}
                              >
                                ✓ {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Show All Matches Toggle */}
                {bankMatches.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllBankMatches(!showAllBankMatches)}
                    style={{
                      width: '100%',
                      padding: '5px',
                      marginTop: 6,
                      borderRadius: 6,
                      border: '1px solid rgba(99,102,241,0.2)',
                      background: 'rgba(99,102,241,0.06)',
                      color: '#6366f1',
                      fontSize: 9.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    {showAllBankMatches
                      ? '▲ Show Top 3 Matches Only'
                      : `▼ Show All ${bankMatches.length} Matches (Including lower confidence)`}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14, fontSize: 10.5, color: '#94a3b8', background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--border-color)' }}>
                ℹ️ No matching bank statement proof auto-detected for this record.
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => onEdit?.(item)} style={{ flex: 1 }}>
              <i className="fas fa-edit"></i> Edit
            </button>
            <button className="btn-outline" style={{ color: 'var(--red-500)', borderColor: '#fecaca', flex: 1 }} onClick={() => { if (confirm('Delete this transaction?')) onDelete?.(item) }}>
              <i className="fas fa-trash-alt"></i> Delete
            </button>

            <button
              type="button"
              className="btn-outline"
              style={{ background: '#25D366', color: '#fff', borderColor: '#25D366', flex: 'none', padding: '10px 12px' }}
              onClick={() => setShareModal({ open: true, channel: 'whatsapp', contact: item.mobileNo || item.phone || '' })}
              title="Send entry details via WhatsApp (Text / PDF)"
            >
              <i className="fab fa-whatsapp" style={{ fontSize: 16 }}></i>
            </button>

            {(item.email || isLending) && (
              <button
                type="button"
                className="btn-outline"
                style={{ background: '#3b82f6', color: '#fff', borderColor: '#3b82f6', flex: 'none', padding: '10px 12px' }}
                onClick={() => setShareModal({ open: true, channel: 'email', contact: item.email || '' })}
                title="Send entry details via Email (Text / PDF)"
              >
                <i className="fas fa-envelope" style={{ fontSize: 14 }}></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Share Format Selection Modal */}
      <ShareFormatModal
        isOpen={shareModal.open}
        onClose={() => setShareModal({ ...shareModal, open: false })}
        channel={shareModal.channel}
        targetContact={shareModal.contact}
        item={item}
      />

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
    </>,
    document.body
  )
}
