import { useState, useRef, useEffect } from 'react'
import { compressImage, getAttachment } from '../api/attachments'
import MultiSelectCombobox from './MultiSelectCombobox'

export default function ExpenseForm({ suggestions, onSave, loading, editData, onCancelEdit }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    date: editData?.date?.split('T')[0] || today,
    forWhom: editData?.forWhom || '',
    category: editData?.category || '',
    details: editData?.details || '',
    amount: editData?.amount || '',
    paymentMode: editData?.paymentMode || 'Cash',
    remarks: editData?.remarks || '',
    fileData: null,
    fileName: '',
    mimeType: '',
  })
  const [fileLabel, setFileLabel] = useState(editData?.fileName ? (editData.fileName.length > 6 ? editData.fileName.slice(0, 6) + '…' : editData.fileName) : 'File')
  const [existingAttachmentPreview, setExistingAttachmentPreview] = useState(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const chipsRef = useRef(null)

  // Load existing attachment preview when editing
  useEffect(() => {
    if (editData?.hasAttachment && !editData?.fileData) {
      setLoadingAttachment(true)
      getAttachment('expenses', editData.id)
        .then((data) => setExistingAttachmentPreview(data))
        .catch(() => {})
        .finally(() => setLoadingAttachment(false))
    } else if (editData?.fileData) {
      setExistingAttachmentPreview(editData.fileData)
    }
  }, [editData?.id])

  function set(key, val) { setForm((s) => ({ ...s, [key]: val })) }

  function applyQuickFill(qf) {
    setForm((s) => ({
      ...s,
      forWhom: qf.whom || s.forWhom,
      category: qf.category || s.category,
      details: qf.details || s.details,
      amount: qf.amount || s.amount,
      paymentMode: qf.mode || s.paymentMode,
    }))
  }

  async function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) {
      set('fileData', null); set('fileName', ''); set('mimeType', '')
      setFileLabel('File')
      return
    }
    try {
      const dataUrl = await compressImage(f)
      setForm((s) => ({ ...s, fileData: dataUrl, fileName: f.name, mimeType: f.type || 'application/octet-stream' }))
      setFileLabel(f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name)
    } catch {
      setFileLabel('Error')
    }
  }

  function clearFile() {
    set('fileData', null); set('fileName', ''); set('mimeType', '')
    setFileLabel('File')
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      formType: 'expense',
      id: editData?.id,
      existingFileName: editData?.fileName,
      existingMimeType: editData?.mimeType,
      hasAttachment: editData?.hasAttachment,
      hasChunkedAttachment: editData?.hasChunkedAttachment,
    })
  }

  return (
    <div className="animate-fade-in">
      {editData && (
        <div className="edit-banner">
          <span><i className="fas fa-edit"></i> Editing Record</span>
          <button className="btn-outline" onClick={onCancelEdit} style={{ padding: '4px 12px', fontSize: 11 }}>Cancel</button>
        </div>
      )}

      {/* Quick Fill */}
      {suggestions?.quickFills?.length > 0 && !editData && (
        <div className="chips-wrapper">
          <div className="chips-header">
            <i className="fas fa-bolt" style={{ color: 'var(--amber-500)' }}></i> Quick Fill
          </div>
          <div className="chips-scroll-row">
            <button className="chips-scroll-btn" onClick={() => chipsRef.current?.scrollBy(-120, 0)}>
              <i className="fas fa-chevron-left"></i>
            </button>
            <div className="chips-container no-scrollbar" ref={chipsRef}>
              {suggestions.quickFills.map((qf, i) => (
                <button key={i} className="chip" type="button" onClick={() => applyQuickFill(qf)}>
                  {qf.label}
                </button>
              ))}
            </div>
            <button className="chips-scroll-btn" onClick={() => chipsRef.current?.scrollBy(120, 0)}>
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Date + Amount + Attach */}
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
          <label className="attach-btn">
            <div className="attach-icon"><i className="fas fa-paperclip"></i></div>
            <span className="attach-label">{fileLabel}</span>
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
            {form.fileData && (
              <button type="button" className="attach-remove" onClick={(e) => { e.preventDefault(); clearFile() }}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </label>
        </div>

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

        {/* For Whom */}
        <MultiSelectCombobox 
          label="For Whom? (e.g. Self, Home)"
          value={form.forWhom}
          onChange={(val) => set('forWhom', val)}
          suggestions={suggestions?.forWhom || []}
        />

        {/* Category + Payment Mode */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <MultiSelectCombobox 
              label="Category"
              value={form.category}
              onChange={(val) => set('category', val)}
              suggestions={suggestions?.categories || []}
            />
          </div>
          <div className="float-group" style={{ flex: 1 }}>
            <select className="float-input" value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="Online/UPI">Online/UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
            </select>
            <label className="float-label active">Payment Mode</label>
            <i className="select-chevron fas fa-chevron-down"></i>
          </div>
        </div>

        {/* Details */}
        <MultiSelectCombobox 
          label="Details (e.g. Lunch)"
          value={form.details}
          onChange={(val) => set('details', val)}
          suggestions={suggestions?.details || []}
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : editData ? 'Update Expense' : 'Save Expense'}
        </button>
      </form>
    </div>
  )
}
