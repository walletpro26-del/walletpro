import { useState, useEffect, useMemo } from 'react'
import { compressImage, getAttachment, getBase64ByteSize } from '../api/attachments'
import { getPersonContactMap } from '../utils/commUtils'
import MultiSelectCombobox from './MultiSelectCombobox'

export default function LendingForm({ suggestions, allLending = [], onSave, loading, editData, onCancelEdit }) {
  const today = new Date().toISOString().split('T')[0]
  const getInitialMode = () => {
    if (!editData) return 'Lend'
    const t = editData.type || ''
    if (t === 'Borrow' || t === 'I Return') return 'Borrow'
    return 'Lend'
  }

  const getInitialDirection = () => {
    if (!editData) return 'OUT'
    const t = editData.type || ''
    if (t === 'They Return' || t === 'Borrow') return 'IN'
    return 'OUT'
  }

  const [lendMode, setLendMode] = useState(getInitialMode)
  const [direction, setDirection] = useState(getInitialDirection)
  const [isForgive, setIsForgive] = useState(editData?.type === 'Forgive')

  const [form, setForm] = useState({
    date: editData?.date?.split('T')[0] || today,
    person: editData?.person || '',
    mobileNo: editData?.mobileNo || editData?.phone || '',
    email: editData?.email || '',
    amount: editData?.amount || '',
    remarks: editData?.remarks || '',
    fileData: null,
    fileName: '',
    mimeType: '',
  })
  const [fileLabel, setFileLabel] = useState(editData?.fileName ? (editData.fileName.length > 5 ? editData.fileName.slice(0, 5) + '…' : editData.fileName) : 'None')
  const [existingAttachmentPreview, setExistingAttachmentPreview] = useState(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentSuccess, setAttachmentSuccess] = useState('')

  // Load existing attachment preview when editing
  useEffect(() => {
    if (editData?.hasAttachment && !editData?.fileData) {
      setLoadingAttachment(true)
      setAttachmentError('')
      setAttachmentSuccess('')
      getAttachment('lending', editData.id)
        .then((data) => {
          if (data) {
            setExistingAttachmentPreview(data)
            setAttachmentSuccess('✔ Attachment fetched successfully')
          } else {
            setAttachmentError('⚠ Attachment file could not be retrieved.')
          }
        })
        .catch((err) => {
          setAttachmentError('⚠ Failed to fetch attachment: ' + (err?.message || 'Error'))
        })
        .finally(() => setLoadingAttachment(false))
    } else if (editData?.fileData) {
      setExistingAttachmentPreview(editData.fileData)
      setAttachmentSuccess('✔ Attachment fetched successfully')
    }
  }, [editData?.id])

  function set(key, val) { setForm((s) => ({ ...s, [key]: val })) }

  // Compute final type from mode + direction + forgive
  function getFinalType() {
    if (isForgive) return 'Forgive'
    if (lendMode === 'Lend') {
      return direction === 'OUT' ? 'Lend' : 'They Return'
    } else {
      return direction === 'OUT' ? 'I Return' : 'Borrow'
    }
  }

  // Direction button labels change based on lendMode
  const outLabel = lendMode === 'Lend' ? 'I Gave' : 'I Return'
  const inLabel = lendMode === 'Lend' ? 'They Returned' : 'I Received'

  async function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) {
      set('fileData', null); set('fileName', ''); set('mimeType', ''); setFileLabel('None')
      setAttachmentError('')
      setAttachmentSuccess('')
      return
    }
    setAttachmentError('')
    setAttachmentSuccess('')
    try {
      const dataUrl = await compressImage(f)
      const sizeKB = (getBase64ByteSize(dataUrl) / 1024).toFixed(1)
      setForm((s) => ({ ...s, fileData: dataUrl, fileName: f.name, mimeType: f.type || 'application/octet-stream' }))
      setFileLabel(f.name.length > 5 ? f.name.slice(0, 5) + '…' : f.name)
      setAttachmentSuccess(`✔ Attached: ${f.name} (${sizeKB} KB)`)
    } catch (err) {
      setFileLabel('Error')
      setAttachmentError(`⚠ ${err?.message || 'Failed to process attachment.'}`)
      e.target.value = ''
    }
  }

  function clearFile() {
    set('fileData', null); set('fileName', ''); set('mimeType', ''); setFileLabel('None')
    setAttachmentError('')
    setAttachmentSuccess('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      formType: 'lending',
      type: getFinalType(),
      lendType: getFinalType(),
      id: editData?.id,
      existingFileName: editData?.fileName,
      existingMimeType: editData?.mimeType,
      hasAttachment: editData?.hasAttachment,
      hasChunkedAttachment: editData?.hasChunkedAttachment,
    })
    if (!editData) {
      setForm({
        date: today,
        person: '',
        mobileNo: '',
        email: '',
        amount: '',
        remarks: '',
        fileData: null,
        fileName: '',
        mimeType: '',
      })
      setFileLabel('None')
    }
  }

  return (
    <div className="animate-fade-in" style={{ position: 'relative', zIndex: 10 }}>
      {editData && (
        <div className="edit-banner">
          <span><i className="fas fa-edit"></i> Editing Record</span>
          <button className="btn-outline" onClick={onCancelEdit} style={{ padding: '4px 12px', fontSize: 11 }}>Cancel</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Mode Switcher */}
        <div className="mode-switcher">
          <button
            type="button"
            className={`mode-btn ${lendMode === 'Lend' ? 'active' : ''}`}
            onClick={() => { setLendMode('Lend'); setIsForgive(false) }}
          >
            LEND (Others)
          </button>
          <button
            type="button"
            className={`mode-btn ${lendMode === 'Borrow' ? 'active borrow' : ''}`}
            onClick={() => { setLendMode('Borrow'); setIsForgive(false) }}
          >
            BORROW (Me)
          </button>
        </div>

        {/* Direction + Attachment */}
        <div className="direction-grid">
          <button
            type="button"
            className={`dir-btn ${!isForgive && direction === 'OUT' ? 'active-out' : ''}`}
            onClick={() => { setDirection('OUT'); setIsForgive(false) }}
          >
            <div className="dir-icon"><i className="fas fa-arrow-up" style={{ transform: 'rotate(45deg)' }}></i></div>
            <span className="dir-label">{outLabel}</span>
          </button>

          <label className="attach-btn" style={{ minWidth: 44 }} title="Attach Image or PDF (Max 130 KB)">
            <div className="attach-icon"><i className="fas fa-paperclip"></i></div>
            <span className="attach-label">{fileLabel}</span>
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
            {form.fileData && (
              <button type="button" className="attach-remove" onClick={(e) => { e.preventDefault(); clearFile() }}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </label>

          <button
            type="button"
            className={`dir-btn ${!isForgive && direction === 'IN' ? 'active-in' : ''}`}
            onClick={() => { setDirection('IN'); setIsForgive(false) }}
          >
            <div className="dir-icon"><i className="fas fa-arrow-down" style={{ transform: 'rotate(45deg)' }}></i></div>
            <span className="dir-label">{inLabel}</span>
          </button>
        </div>

        {/* Forgive */}
        {lendMode === 'Lend' && (
          <button
            type="button"
            className={`forgive-btn ${isForgive ? 'active' : ''}`}
            onClick={() => setIsForgive(!isForgive)}
          >
            <i className="fas fa-hand-holding-heart"></i> Forgive / Write-off
          </button>
        )}

        {/* Attachment Preview & Status */}
        {(form.fileData || existingAttachmentPreview || loadingAttachment || attachmentError) && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Attachment Preview
              </span>
              {attachmentSuccess && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--emerald-600)' }}>
                  {attachmentSuccess}
                </span>
              )}
            </div>

            {loadingAttachment && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
                <i className="fas fa-spinner fa-spin"></i> Loading attachment data...
              </div>
            )}

            {attachmentError && (
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red-600)', background: 'var(--red-50)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                {attachmentError}
              </div>
            )}

            {!loadingAttachment && (form.fileData || existingAttachmentPreview) && (
              <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)', marginTop: 4 }}>
                {(form.fileData || existingAttachmentPreview).includes('application/pdf') ? (
                  <div style={{ padding: 12, textAlign: 'center', background: '#fff' }}>
                    <i className="fas fa-file-pdf" style={{ fontSize: 32, color: 'var(--red-500)' }}></i>
                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                      {form.fileName || editData?.fileName || 'PDF Document'}
                    </div>
                  </div>
                ) : (
                  <img
                    src={form.fileData || existingAttachmentPreview}
                    alt="Attachment receipt"
                    style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Date + Amount */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'nowrap', width: '100%', marginBottom: 10 }}>
          <div className="compact-input-block" style={{ flex: '1 1 45%', minWidth: 0 }}>
            <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              required
              style={{ padding: '6px 4px', fontSize: 11, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div className="compact-input-block" style={{ flex: '1 1 55%', minWidth: 0 }}>
            <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2, display: 'block' }}>Amount</label>
            <div className="amount-row" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="currency-sym" style={{ fontSize: 11, marginRight: 2 }}>₹</span>
              <input
                type="number"
                step="0.01"
                className="amount-input"
                placeholder="0"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
                style={{ padding: '6px 4px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* Person */}
        <MultiSelectCombobox 
          label="Person Name"
          value={form.person}
          onChange={(val) => set('person', val)}
          suggestions={suggestions?.persons || []}
        />

        {/* Mobile No & Email */}
        <div className="compact-row">
          <div className="compact-input-block" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: 10 }} /> Mobile (WhatsApp)
            </label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={form.mobileNo}
              onChange={(e) => set('mobileNo', e.target.value)}
            />
          </div>
          <div className="compact-input-block" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fas fa-envelope" style={{ color: '#3b82f6', fontSize: 9 }} /> Email Address
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
        </div>

        {/* Remarks */}
        <div className="float-group">
          <input
            type="text"
            className="float-input"
            placeholder=" "
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
          />
          <label className="float-label">Remarks</label>
        </div>

        <button type="submit" className="btn-primary emerald" disabled={loading}>
          {loading ? 'Saving...' : editData ? 'Update Record' : 'Save Record'}
        </button>
      </form>
    </div>
  )
}
