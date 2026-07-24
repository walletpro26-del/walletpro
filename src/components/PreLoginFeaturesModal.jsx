import { useState } from 'react'
import { createPortal } from 'react-dom'
import { signInWithGoogle } from '../api/auth'

export default function PreLoginFeaturesModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('expenses')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleModalGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
      onClose?.()
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const featureTabs = [
    { id: 'expenses', label: '💸 Expenses', icon: 'fa-receipt' },
    { id: 'lending', label: '🤝 Lending', icon: 'fa-handshake' },
    { id: 'bank', label: '🏦 Bank & AI', icon: 'fa-university' },
    { id: 'reports', label: '📊 Analytics', icon: 'fa-chart-pie' },
    { id: 'security', label: '🔒 Security', icon: 'fa-shield-alt' },
  ]

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          maxWidth: 580,
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 16,
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          background: 'var(--bg-primary, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
            padding: '20px 20px 16px',
            color: '#fff',
            position: 'relative',
          }}
        >
          <button
            className="modal-close"
            style={{
              position: 'absolute',
              top: 14,
              right: 16,
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              width: 26,
              height: 26,
              fontSize: 11,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            <i className="fas fa-times" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
              }}
            >
              ⚡
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.3px' }}>
                WalletVibe Pro Features
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#a5b4fc' }}>
                Explore everything WalletVibe offers for personal finance & ledgers
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 16,
              background: 'rgba(0,0,0,0.3)',
              padding: 4,
              borderRadius: 10,
              overflowX: 'auto',
            }}
            className="custom-scrollbar"
          >
            {featureTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === tab.id ? '#ffffff' : 'transparent',
                  color: activeTab === tab.id ? '#312e81' : '#cbd5e1',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Body */}
        <div style={{ padding: '20px 20px 14px', flex: 1, color: 'var(--text-primary, #1e293b)' }}>
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, fontWeight: 700, marginBottom: 14 }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} /> {error}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  💸
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Smart Expense & Income Tracking</h4>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                    Record every rupee with high accuracy. Categorize spending across food, utilities, shopping, family, and investments.
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Multi-Payment Support (UPI, Cash, NetBanking, Credit Card)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> For Whom Tagging (Self, Family, Home, Business, Friends)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Attach Receipt Photos & PDF Documents
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Custom Category Budgets & Spending Warnings
                </div>
              </div>
            </div>
          )}

          {activeTab === 'lending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  🤝
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Lending & Borrowing Ledger</h4>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                    Never lose track of money given to or taken from colleagues, friends, or family members.
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Automatic Contact Balance Totals (Who owes you vs Who you owe)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> 1-Click Status Toggle (Pending ↔ Settled)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Payment Remarks & Repayment History
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Shareable Balance Statements via WhatsApp or Email
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bank' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(14,165,233,0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  🏦
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Bank Statements & AI Document Parsing</h4>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                    Import Bank Statements, Receipts, PDFs, Excel sheets, Voice notes, and CSVs effortlessly.
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Gemini AI Extraction for PDFs, Audio, Images & Excel
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Pure Local CSV Import (No AI requirement)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Intelligent Duplicate Transaction Detection & Uncheck
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> 1-Click Undo Batch Import Protection
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  📊
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Financial Analytics & Exports</h4>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                    Gain deep insights into your spending patterns and export audit-ready financial statements.
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Interactive Category Pie Charts & Spending Breakdowns
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Download Custom Formatted PDF Financial Reports
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Export Full Data in Excel CSV format
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Date Range Filter (Today, This Week, Monthly, Custom Range)
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  🔒
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>End-to-End Security & Offline Access</h4>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                    Your financial data is encrypted, private, and always accessible even without internet.
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', borderRadius: 10, padding: 12, border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Powered by Google Firebase Security Standards
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> 100% Offline Device Caching (Auto-syncs when online)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> PCI-DSS Compliant Payment Integration
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#10b981' }}>✓</span> Private Data Partitioning per Google Account
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-subtle, #f8fafc)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <button
            type="button"
            onClick={handleModalGoogleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin" /> Signing in...</>
            ) : (
              <>
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  width="18"
                  height="18"
                  style={{ background: '#fff', borderRadius: '50%', padding: 2 }}
                />
                Get Started with Google Sign-In
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
