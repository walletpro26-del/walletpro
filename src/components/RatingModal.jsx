import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { submitReview, getAllReviews, getUserReview } from '../api/reviews'

export default function RatingModal({ user, onClose }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  // Form State
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [activeTab, setActiveTab] = useState('write') // 'write' | 'view'

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const list = await getAllReviews()
        setReviews(list)

        const existing = await getUserReview(user?.uid, user?.email)
        if (existing) {
          setName(existing.name || '')
          setMobile(existing.mobile || '')
          if (existing.email) setEmail(existing.email)
          if (existing.rating) setRating(existing.rating)
          if (existing.comment) setComment(existing.comment)
        }
      } catch (err) {
        // quiet fallback
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!mobile.trim()) {
      setError('Please enter your mobile number.')
      return
    }
    if (!rating || rating < 1) {
      setError('Please select a star rating.')
      return
    }

    setSubmitting(true)
    try {
      await submitReview({
        name,
        mobile,
        email: email || user?.email || '',
        rating,
        comment,
        userId: user?.uid,
      })

      setSuccessMsg('🎉 Thank you! Your rating & review have been published.')
      const updatedList = await getAllReviews()
      setReviews(updatedList)

      setTimeout(() => {
        setActiveTab('view')
      }, 1200)
    } catch (err) {
      setError(err?.message || 'Failed to submit review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate Average Score
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1)
    : '5.0'

  const starLabels = {
    1: 'Poor 😞',
    2: 'Fair 😐',
    3: 'Good 🙂',
    4: 'Very Good 😊',
    5: 'Excellent! 🌟',
  }

  function maskEmail(mail) {
    if (!mail) return ''
    const parts = mail.split('@')
    if (parts.length < 2) return mail
    const namePart = parts[0]
    if (namePart.length <= 2) return `${namePart}***@${parts[1]}`
    return `${namePart.substring(0, 2)}***@${parts[1]}`
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '450px',
          maxHeight: '86vh',
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #cbd5e1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          margin: 'auto',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            padding: '14px 44px 14px 16px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                fontSize: 16,
              }}
            >
              ⭐
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'clamp(14px, 4vw, 15px)', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                App Rating &amp; Reviews
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 'clamp(10px, 3vw, 11px)', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.2 }}>
                Rate &amp; share feedback for WalletVibe Pro
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
            }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Navigation Tabs - Non-conflicting Tab styling */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-subtle, #f8fafc)',
            padding: '4px',
            gap: 4,
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'write' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: activeTab === 'write' ? 'var(--accent-600, #4f46e5)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'write' ? 800 : 600,
              fontSize: 'clamp(11px, 3.2vw, 12px)',
              cursor: 'pointer',
              boxShadow: activeTab === 'write' ? '0 1px 4px rgba(0, 0, 0, 0.08)' : 'none',
            }}
          >
            <i className="fas fa-edit" style={{ marginRight: 4 }} /> Rate &amp; Review
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              borderRadius: '8px',
              background: activeTab === 'view' ? 'var(--bg-card, #ffffff)' : 'transparent',
              color: activeTab === 'view' ? 'var(--accent-600, #4f46e5)' : 'var(--text-muted, #64748b)',
              fontWeight: activeTab === 'view' ? 800 : 600,
              fontSize: 'clamp(11px, 3.2vw, 12px)',
              cursor: 'pointer',
              boxShadow: activeTab === 'view' ? '0 1px 4px rgba(0, 0, 0, 0.08)' : 'none',
            }}
          >
            <i className="fas fa-star" style={{ marginRight: 4 }} /> Reviews ({reviews.length})
          </button>
        </div>

        {/* Content Body - Fully Scrollable & Mobile-Optimized */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1, boxSizing: 'border-box' }}>
          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#dc2626',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#059669',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {successMsg}
            </div>
          )}

          {activeTab === 'write' ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Star Rating Selector Card */}
              <div
                style={{
                  textAlign: 'center',
                  background: 'var(--bg-subtle, #f8fafc)',
                  padding: '12px 10px',
                  borderRadius: 12,
                  border: '1px solid var(--border-color, #e2e8f0)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--text-muted, #64748b)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Your Rating Score
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 'clamp(28px, 8vw, 34px)', cursor: 'pointer' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      style={{
                        color: star <= (hoverRating || rating) ? '#f59e0b' : 'var(--border-color, #cbd5e1)',
                        transition: 'transform 0.15s ease, color 0.15s ease',
                        transform: star <= (hoverRating || rating) ? 'scale(1.15)' : 'scale(1)',
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                  {starLabels[hoverRating || rating]}
                </div>
              </div>

              {/* Full Name Field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary, #475569)', marginBottom: 4 }}>
                  Full Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sheikh Gulfam"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #ffffff)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 12,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Mobile Field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary, #475569)', marginBottom: 4 }}>
                  Mobile Number <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #ffffff)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 12,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Email Address Field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary, #475569)', marginBottom: 4 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-subtle, #f8fafc)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 12,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Comment Textarea */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary, #475569)', marginBottom: 4 }}>
                  Feedback &amp; Review Comments
                </label>
                <textarea
                  rows={2}
                  placeholder="Write your thoughts, experience, or feature suggestions..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #ffffff)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: 11.5,
                    lineHeight: 1.4,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: 12,
                  cursor: submitting ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  gap: 8,
                  marginTop: 6,
                  transition: 'all 0.15s ease',
                  letterSpacing: '0.2px',
                }}
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> Submitting Review...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane" /> Submit Rating &amp; Review
                  </>
                )}
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Overall Community Rating Breakdown */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'var(--bg-subtle, #f8fafc)',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border-color, #e2e8f0)',
                }}
              >
                <div style={{ textAlign: 'center', paddingRight: 12, borderRight: '1px solid var(--border-color, #cbd5e1)' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary, #0f172a)', lineHeight: 1 }}>
                    {avgRating}
                  </div>
                  <div style={{ color: '#f59e0b', fontSize: 12, margin: '2px 0' }}>★ ★ ★ ★ ★</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted, #64748b)', fontWeight: 800 }}>
                    {reviews.length} {reviews.length === 1 ? 'Review' : 'Reviews'}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary, #0f172a)', marginBottom: 2 }}>
                    Community Rating
                  </div>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'var(--text-secondary, #475569)', lineHeight: 1.3 }}>
                    Verified community reviews from users tracking expenses, lend/borrow ledgers, and bank statements.
                  </p>
                </div>
              </div>

              {/* Reviews List */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11 }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} /> Loading reviews...
                </div>
              ) : reviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11 }}>
                  No reviews yet. Be the first to leave a review!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        background: 'var(--bg-subtle, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: 10,
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justify: 'center',
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {(rev.name || 'A')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                              {rev.name}
                            </div>
                            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #64748b)' }}>
                              {maskEmail(rev.email)} {rev.mobile ? `• ${rev.mobile}` : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 800 }}>
                            {'★'.repeat(rev.rating || 5)}
                            <span style={{ color: 'var(--border-color, #cbd5e1)' }}>{'★'.repeat(5 - (rev.rating || 5))}</span>
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                            {rev.date ? new Date(rev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </div>
                        </div>
                      </div>

                      {rev.comment && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 10.5,
                            color: 'var(--text-secondary, #334155)',
                            lineHeight: 1.35,
                            background: 'var(--bg-card, #ffffff)',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border-color, #e2e8f0)',
                          }}
                        >
                          "{rev.comment}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
