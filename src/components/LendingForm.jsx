import { useState, useEffect } from 'react'
import { compressImage, getAttachment } from '../api/attachments'
import MultiSelectCombobox from './MultiSelectCombobox'

export default function LendingForm({ suggestions, onSave, loading, editData, onCancelEdit }) {
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
    amount: editData?.amount || '',
    remarks: editData?.remarks || '',
    fileData: null,
    fileName: '',
    mimeType: '',
  })
  const [fileLabel, setFileLabel] = useState(editData?.fileName ? (editData.fileName.length > 5 ? editData.fileName.slice(0, 5) + '…' : editData.fileName) : 'None')
  const [existingAttachmentPreview, setExistingAttachmentPreview] = useState(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)

  // Load existing attachment preview when editing
  useEffect(() => {
    if (editData?.hasAttachment && !editData?.fileData) {
      setLoadingAttachment(true)
      getAttachment('lending', editData.id)
        .then((data) => setExistingAttachmentPreview(data))
        .catch(() => {})
        .finally(() => setLoadingAttachment(false))
    } else if (editData?.fileData) {
      setExistingAttachmentPreview(editData.fileData)
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
    if (!f) { set('fileData', null); set('fileName', ''); set('mimeType', ''); setFileLabel('None'); return }
    try {
      const dataUrl = await compressImage(f)
      setForm((s) => ({ ...s, fileData: dataUrl, fileName: f.name, mimeType: f.type }))
      setFileLabel(f.name.length > 5 ? f.name.slice(0, 5) + '…' : f.name)
    } catch { setFileLabel('Error') }
  }

  function clearFile() { set('fileData', null); set('fileName', ''); set('mimeType', ''); setFileLabel('None') }

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

          <label className="attach-btn" style={{ minWidth: 44 }}>
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

        {/* Existing Attachment Preview when Editing */}
        {editData && (existingAttachmentPreview || loadingAttachment) && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Current Attachment
            </div>
            {loadingAttachment ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading...</div>
            ) : existingAttachmentPreview ? (
              <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                {existingAttachmentPreview.includes('application/pdf') ? (
                  <div style={{ padding: 12, textAlign: 'center', background: '#fff' }}>
                    <i className="fas fa-file-pdf" style={{ fontSize: 28, color: 'var(--red-500)' }}></i>
                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>{editData.fileName || 'PDF'}</div>
                  </div>
                ) : (
                  <img src={existingAttachmentPreview} alt="Existing receipt" style={{ width: '100%', maxHeight: 150, objectFit: 'cover' }} />
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Date + Amount */}
        <div className="compact-row">
          <div className="compact-input-block" style={{ flex: 2 }}>
            <label>Date</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
          </div>
          <div className="compact-input-block" style={{ flex: 3 }}>
            <label>Amount</label>
            <div className="amount-row">
              <span className="currency-sym">₹</span>
              <input
                type="number"
                step="0.01"
                className="amount-input"
                placeholder="0"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
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
