import { useState, useRef, useEffect } from 'react'
import { compressImage, getAttachment, getBase64ByteSize } from '../api/attachments'
import MultiSelectCombobox from './MultiSelectCombobox'
import { normalizePersonName } from '../api/entityNormalizer'

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
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentSuccess, setAttachmentSuccess] = useState('')
  const chipsRef = useRef(null)

  // Load existing attachment preview when editing
  useEffect(() => {
    if (editData?.hasAttachment && !editData?.fileData) {
      setLoadingAttachment(true)
      setAttachmentError('')
      setAttachmentSuccess('')
      getAttachment('expenses', editData.id)
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
      setFileLabel(f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name)
      setAttachmentSuccess(`✔ Attached: ${f.name} (${sizeKB} KB)`)
    } catch (err) {
      setFileLabel('Error')
      setAttachmentError(`⚠ ${err?.message || 'Failed to process attachment.'}`)
      e.target.value = ''
    }
  }

  function clearFile() {
    set('fileData', null); set('fileName', ''); set('mimeType', '')
    setFileLabel('File')
    setAttachmentError('')
    setAttachmentSuccess('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      forWhom: normalizePersonName(form.forWhom || 'Self'),
      formType: 'expense',
      id: editData?.id,
      existingFileName: editData?.fileName,
      existingMimeType: editData?.mimeType,
      hasAttachment: editData?.hasAttachment,
      hasChunkedAttachment: editData?.hasChunkedAttachment,
    })
    if (!editData) {
      setForm({
        date: today,
        forWhom: '',
        category: '',
        details: '',
        amount: '',
        paymentMode: 'Cash',
        remarks: '',
        fileData: null,
        fileName: '',
        mimeType: '',
      })
      setFileLabel('File')
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
        {/* Date + Amount + Attach (Less wider, compact layout) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', maxWidth: 350, width: '100%', marginBottom: 14 }}>
          <div className="compact-input-block" style={{ flex: '1 1 125px', minWidth: 0, padding: '4px 8px' }}>
            <label style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 1, display: 'block', letterSpacing: '0.5px' }}>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              required
              style={{ padding: '2px 0', fontSize: 12, fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div className="compact-input-block" style={{ flex: '1 1 145px', minWidth: 0, padding: '4px 8px' }}>
            <label style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 1, display: 'block', letterSpacing: '0.5px' }}>Amount</label>
            <div className="amount-row" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="currency-sym" style={{ fontSize: 14, fontWeight: 500, marginRight: 3, color: 'var(--text-muted)' }}>₹</span>
              <input
                type="number"
                step="0.01"
                className="amount-input"
                placeholder="0"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
                style={{ padding: '0', fontSize: 19, fontWeight: 800, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <label className="attach-btn" title="Attach Image or PDF (Max 130 KB)" style={{ flex: '0 0 auto', minWidth: 46, height: 42, padding: '4px 6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
            <div className="attach-icon" style={{ fontSize: 12 }}><i className="fas fa-paperclip"></i></div>
            <span className="attach-label" style={{ fontSize: 8, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 40 }}>{fileLabel}</span>
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
            {form.fileData && (
              <button type="button" className="attach-remove" onClick={(e) => { e.preventDefault(); clearFile() }}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </label>
        </div>

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
