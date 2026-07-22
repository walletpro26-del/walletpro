import React from 'react'
import { shareViaWhatsApp, shareViaEmail } from '../utils/pdfShareUtils'

export default function ShareFormatModal({
  isOpen,
  onClose,
  channel = 'whatsapp', // 'whatsapp' | 'email'
  targetContact = '',   // phone or email
  item = null,          // single transaction
  person = '',          // person name
  personData = null,    // person summary object
  normalizeFn = null,
}) {
  if (!isOpen) return null

  const isWhatsApp = channel === 'whatsapp'
  const titleName = person || item?.person || item?.category || 'Record'

  const handleSelectFormat = (format) => {
    onClose()
    if (isWhatsApp) {
      shareViaWhatsApp({
        phone: targetContact,
        item,
        person,
        personData,
        normalizeFn,
        format,
      })
    } else {
      shareViaEmail({
        email: targetContact,
        item,
        person,
        personData,
        normalizeFn,
        format,
      })
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 99999 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card card-premium" style={{ maxWidth: 360, width: '90%', padding: '20px 24px', position: 'relative', zIndex: 2 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isWhatsApp ? 'rgba(37,211,102,0.15)' : 'rgba(59,130,246,0.15)',
              color: isWhatsApp ? '#25D366' : '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
            }}>
              <i className={isWhatsApp ? 'fab fa-whatsapp' : 'fas fa-envelope'} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Share via {isWhatsApp ? 'WhatsApp' : 'Email'}
              </h3>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                {titleName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer' }}
          >✕</button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 500 }}>
          Select how you want to share this transaction format:
        </p>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Text Option */}
          <button
            type="button"
            onClick={() => handleSelectFormat('text')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border-color)',
              background: 'var(--bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
            className="pdf-dropdown-item-hover"
          >
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-50)', color: 'var(--accent-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
            }}>
              💬
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Text Summary</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Send formatted details & amounts in chat</div>
            </div>
          </button>

          {/* PDF Option */}
          <button
            type="button"
            onClick={() => handleSelectFormat('pdf')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border-color)',
              background: 'var(--bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
            className="pdf-dropdown-item-hover"
          >
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
            }}>
              📄
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>PDF Document</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Generate & download official PDF voucher / report</div>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
