import { useState } from 'react'

export default function AboutModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('about') // 'about' | 'howToUse'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="animate-scale-up" style={{ background: 'var(--bg-card, #fff)', borderRadius: 20, maxWidth: 520, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color, #e2e8f0)', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #1e1b4b, #312e81)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              💳
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.3 }}>WalletVibe</div>
              <div style={{ fontSize: 10.5, color: '#a5b4fc', fontWeight: 600 }}>Personal Finance & Bank Verification</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', background: 'var(--bg-subtle, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', padding: '4px 8px' }}>
          <button
            onClick={() => setActiveTab('about')}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', background: activeTab === 'about' ? 'var(--bg-card, #fff)' : 'transparent',
              color: activeTab === 'about' ? '#4f46e5' : 'var(--text-secondary, #64748b)', fontSize: 12, fontWeight: 800,
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: activeTab === 'about' ? '0 2px 6px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s'
            }}
          >
            <i className="fas fa-info-circle" /> About & Features
          </button>
          <button
            onClick={() => setActiveTab('howToUse')}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', background: activeTab === 'howToUse' ? 'var(--bg-card, #fff)' : 'transparent',
              color: activeTab === 'howToUse' ? '#4f46e5' : 'var(--text-secondary, #64748b)', fontSize: 12, fontWeight: 800,
              borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: activeTab === 'howToUse' ? '0 2px 6px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s'
            }}
          >
            <i className="fas fa-book-open" /> How to Use App
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="custom-scrollbar" style={{ padding: 20, overflowY: 'auto', flex: 1, fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary, #1e293b)' }}>
          {activeTab === 'about' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontWeight: 800, color: '#4f46e5', fontSize: 13, marginBottom: 4 }}>
                  ✨ Smart, Private & Fast Financial Companion
                </div>
                <div>
                  WalletVibe is a modern web app designed for instant expense tracking, lending & borrowing management, and automated bank statement verification.
                </div>
              </div>

              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)', marginTop: 4 }}>
                🚀 Key Features:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>⚡</div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Instant Mobile Performance:</strong> Powered by local caching with zero loading delays across devices.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>🏦</div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Bank History & Proof Matching:</strong> Import CSV or PDF statements to auto-match expenses with bank verification proofs.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>🤝</div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Lend / Borrow Settlement:</strong> Track loans given to or taken from family & friends with partial return logging.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(236,72,153,0.1)', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>📊</div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Comprehensive Reports:</strong> Generate instant PDF & Excel reports with WhatsApp/Email contact sharing.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800 }}>🤖</div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>AI / LLM PDF Conversion:</strong> Use built-in prompts with ChatGPT, Gemini, or Claude to convert bank PDFs into standard CSV templates.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>
                📖 How to Use WalletVibe (Step-by-Step Guide):
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 12, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ fontWeight: 800, color: '#4f46e5', marginBottom: 4 }}>1️⃣ Adding Daily Expenses</div>
                <div>Navigate to the <strong>Expenses</strong> tab. Enter Date, Amount, Category (using quick preset chips like Food, Health, Utilities), and Payment Mode, then tap <strong>Save Expense</strong>.</div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 12, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ fontWeight: 800, color: '#10b981', marginBottom: 4 }}>2️⃣ Managing Lend & Borrow</div>
                <div>Go to the <strong>Lend/Borrow</strong> tab. Choose <em>I Gave Money (Lend)</em> or <em>I Took Money (Borrow)</em>. Select relationship chips (+ Father, + Friend) and enter contact mobile for easy WhatsApp/Email reminders.</div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 12, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>3️⃣ Bank Statement Verification & Search</div>
                <div>Open the <strong>Bank History</strong> tab. Click <strong>Import Bank Statement</strong> to upload CSV or PDF statements. Use the search bar to find any past UPI, NEFT, or ATM transaction instantly.</div>
              </div>

              <div style={{ background: 'var(--bg-subtle, #f8fafc)', padding: 12, borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)' }}>
                <div style={{ fontWeight: 800, color: '#ec4899', marginBottom: 4 }}>4️⃣ Standard CSV Bank Templates</div>
                <div>Download our standard <strong>Template CSV</strong> in the Bank History tab to format any bank statement into standard CSV format for instant upload!</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div style={{ padding: '12px 20px', background: 'var(--bg-subtle, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  )
}
