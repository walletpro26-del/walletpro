import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function LegalModal({ initialTab = 'privacy', onClose }) {
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-container custom-scrollbar"
        style={{
          maxWidth: 720,
          width: '92%',
          maxHeight: '88vh',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
            padding: '20px 24px 16px',
            color: '#ffffff',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            className="modal-close"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            aria-label="Close legal documents modal"
          >
            <i className="fas fa-times" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <i className="fas fa-shield-alt" style={{ fontSize: 22, color: '#818cf8' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
                Legal & Governance Policies
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(224, 231, 255, 0.8)' }}>
                WalletVibe by <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc', textDecoration: 'underline' }}>NextLifTechnologies</a>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 4,
              scrollbarWidth: 'none',
            }}
          >
            <button
              onClick={() => setActiveTab('privacy')}
              style={{
                background: activeTab === 'privacy' ? '#ffffff' : 'rgba(255, 255, 255, 0.12)',
                color: activeTab === 'privacy' ? '#312e81' : '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-user-shield" style={{ marginRight: 6 }} />
              Privacy Policy
            </button>

            <button
              onClick={() => setActiveTab('terms')}
              style={{
                background: activeTab === 'terms' ? '#ffffff' : 'rgba(255, 255, 255, 0.12)',
                color: activeTab === 'terms' ? '#312e81' : '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-file-contract" style={{ marginRight: 6 }} />
              Terms & Conditions
            </button>

            <button
              onClick={() => setActiveTab('refund')}
              style={{
                background: activeTab === 'refund' ? '#ffffff' : 'rgba(255, 255, 255, 0.12)',
                color: activeTab === 'refund' ? '#312e81' : '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-undo-alt" style={{ marginRight: 6 }} />
              Refund & Cancellation
            </button>

            <button
              onClick={() => setActiveTab('contact')}
              style={{
                background: activeTab === 'contact' ? '#ffffff' : 'rgba(255, 255, 255, 0.12)',
                color: activeTab === 'contact' ? '#312e81' : '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              <i className="fas fa-envelope-open-text" style={{ marginRight: 6 }} />
              Contact Us
            </button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div
          className="custom-scrollbar"
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            flexGrow: 1,
            fontSize: 14,
            lineHeight: 1.65,
            color: 'var(--text-main, #334155)',
            background: 'var(--bg-card, #ffffff)',
          }}
        >
          {/* PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="legal-doc-section">
              <h3 style={{ marginTop: 0, color: 'var(--text-heading, #1e293b)', fontSize: 18, fontWeight: 700 }}>
                Privacy Policy
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Last Updated: July 22, 2026
              </p>
              
              <p>
                At <strong>WalletVibe</strong> (operated by <strong><a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>NextLifTechnologies</a></strong>), accessible from{' '}
                <a href="https://walletvibe.netlify.app" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
                  walletvibe.netlify.app
                </a>
                , one of our main priorities is the privacy of our visitors and registered users. This Privacy Policy document outlines the types of information collected and recorded by WalletVibe and how we use it.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>1. Information We Collect</h4>
              <p>When you register for or use WalletVibe, we may collect the following personal and financial tracking information:</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><strong>Account Information:</strong> Name, Email Address, and Profile picture supplied via Google OAuth via Firebase Authentication.</li>
                <li><strong>Financial Transaction Records:</strong> Expense items, amount, categories, payment methods, lending/borrowing logs, and notes entered voluntarily by you.</li>
                <li><strong>Technical & Usage Data:</strong> Internet Protocol (IP) address, browser type, device type, operating system, and timestamp of logins.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>2. How We Use Your Information</h4>
              <p>We use the collected information for the following core operational purposes:</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li>Provide, operate, and maintain your personal expense and lending tracking dashboard.</li>
                <li>Generate local and graphical budget reports and analytics.</li>
                <li>Process subscription payments and account upgrades safely via Razorpay.</li>
                <li>Send transactional receipts, critical updates, and security alerts.</li>
                <li>Prevent unauthorized account access, fraud, and system abuse.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>3. Data Storage & Security</h4>
              <p>
                Your privacy is paramount. Your financial logs and budget records are encrypted in transit and at rest using standard cloud infrastructure provided by Firebase / Google Cloud. We do not sell, rent, or trade your personal or financial data to third-party advertisers or data brokers under any circumstances.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>4. Third-Party Services</h4>
              <p>We utilize trusted third-party service providers to power key features of our platform:</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><strong>Google Firebase:</strong> Used for secure user authentication and cloud database sync.</li>
                <li><strong>Razorpay Software Private Limited:</strong> Used as our payment gateway for processing subscription fees securely. Payment card/UPI details are handled directly by Razorpay under PCI-DSS compliance. WalletVibe does not store your raw credit card or bank credentials.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>5. Data Retention & Deletion</h4>
              <p>
                You retain full ownership of your data. You may export or request complete deletion of your account and stored expense history at any time by contacting our support team at{' '}
                <a href="mailto:walletpro26@gmail.com" style={{ color: '#6366f1' }}>walletpro26@gmail.com</a>.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>6. Updates to This Policy</h4>
              <p>
                We may update our Privacy Policy from time to time to reflect regulatory changes or service enhancements. Any modifications will be posted on this page with an updated revision date.
              </p>
            </div>
          )}

          {/* TERMS & CONDITIONS */}
          {activeTab === 'terms' && (
            <div className="legal-doc-section">
              <h3 style={{ marginTop: 0, color: 'var(--text-heading, #1e293b)', fontSize: 18, fontWeight: 700 }}>
                Terms & Conditions
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Last Updated: July 22, 2026
              </p>

              <p>
                Welcome to <strong>WalletVibe</strong>! These Terms and Conditions outline the rules and regulations for the use of <strong><a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>NextLifTechnologies</a></strong>’s Website and Web Application located at{' '}
                <a href="https://walletvibe.netlify.app" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>
                  https://walletvibe.netlify.app
                </a>.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>1. Acceptance of Terms</h4>
              <p>
                By accessing or using WalletVibe, you agree to be bound by these Terms & Conditions and all applicable laws and regulations. If you do not agree with any part of these terms, you are prohibited from using or accessing this application.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>2. Account Registration & Responsibilities</h4>
              <p>
                To use WalletVibe, you must sign in using a valid Google account. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>3. Subscriptions & Payment Terms</h4>
              <p>
                WalletVibe offers premium subscription plans (e.g., Monthly at ₹20/month, Yearly at ₹150/year, or customized tier pricing).
              </p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li>All payments are processed securely in Indian Rupees (INR) via Razorpay.</li>
                <li>Subscriptions provide full access to premium features including unlimited expense entries, lending/borrowing tracker, PDF reports export, bank search tool, and cloud backup.</li>
                <li>Pricing is subject to change with prior notice displayed on the application header or subscription modal.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>4. Prohibited Uses</h4>
              <p>You agree not to engage in any of the following prohibited activities:</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li>Attempting to reverse-engineer, decompile, or copy the software components of WalletVibe.</li>
                <li>Using automated scripts, bots, or scrapers to extract platform data.</li>
                <li>Interfering with or disrupting the integrity, performance, or security of our server infrastructure.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>5. Intellectual Property</h4>
              <p>
                The WalletVibe platform, logos, UI designs, code base, and branding are the exclusive intellectual property of <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>NextLifTechnologies</a>. Nothing in these terms grants you any rights to use NextLifTechnologies trademarks or brand assets without explicit written permission.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>6. Disclaimer & Limitation of Liability</h4>
              <p>
                WalletVibe is provided on an "AS IS" and "AS AVAILABLE" basis. While we take reasonable measures to maintain uptime and data integrity, <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>NextLifTechnologies</a> shall not be held liable for any indirect, incidental, or consequential damages resulting from loss of data, service interruption, or financial tracking inaccuracies.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>7. Governing Law</h4>
              <p>
                These terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions. Legal proceedings, if any, shall be subjected to the exclusive jurisdiction of the courts located in Anantnag, Jammu &amp; Kashmir, India.
              </p>
            </div>
          )}

          {/* REFUND & CANCELLATION POLICY */}
          {activeTab === 'refund' && (
            <div className="legal-doc-section">
              <h3 style={{ marginTop: 0, color: 'var(--text-heading, #1e293b)', fontSize: 18, fontWeight: 700 }}>
                Refund & Cancellation Policy
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Last Updated: July 22, 2026
              </p>

              <p>
                At <strong>WalletVibe</strong> (a product of <strong><a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>NextLifTechnologies</a></strong>), we strive to ensure total customer satisfaction with our digital expense tracking tools and premium subscription services. This policy outlines our cancellation and refund procedures in accordance with payment gateway standards.
              </p>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>1. Subscription Cancellation</h4>
              <p>
                You may choose to cancel your WalletVibe subscription at any time without penalty or cancellation fees:
              </p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><strong>Self-Service Cancellation:</strong> You can cancel your subscription renewal directly through your Account Settings or by reaching out to our support team.</li>
                <li><strong>Effect of Cancellation:</strong> Upon cancellation, your subscription will remain active until the end of the current paid billing cycle (monthly or yearly). You will not be charged for subsequent billing periods.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>2. 7-Day Money-Back Guarantee & Refund Eligibility</h4>
              <p>We offer a hassle-free <strong>7-Day Money-Back Guarantee</strong> for all new subscription purchases under the following conditions:</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><strong>Eligibility Period:</strong> Refund requests must be submitted within 7 calendar days from the date of the initial payment transaction.</li>
                <li><strong>Technical Issues / Payment Errors:</strong> If you were double-billed due to a network error, or if payment succeeded but system activation failed and could not be resolved by support, you are eligible for a full 100% refund.</li>
                <li><strong>Non-Eligible Claims:</strong> Refund requests made after 7 days from the transaction date are not eligible for a refund. Renewals that were not cancelled prior to the renewal date will be evaluated on a case-by-case basis.</li>
              </ul>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>3. Refund Process & Processing Time</h4>
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.06)',
                  borderLeft: '4px solid #6366f1',
                  padding: '12px 16px',
                  borderRadius: 6,
                  margin: '12px 0 16px',
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#312e81' }}>
                  <i className="fas fa-clock" style={{ marginRight: 6, color: '#6366f1' }} />
                  <strong>Refund Processing Window:</strong> Approved refunds will be credited back to your original payment method (Bank Account, UPI, Credit/Debit Card) within <strong>5 to 7 working days</strong>.
                </p>
              </div>

              <h4 style={{ color: '#1e293b', marginTop: 20, marginBottom: 8, fontSize: 15 }}>4. How to Request a Refund</h4>
              <p>To request a cancellation or refund, please follow these steps:</p>
              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li>
                  Send an email to our dedicated support inbox at{' '}
                  <a href="mailto:walletpro26@gmail.com" style={{ color: '#6366f1', fontWeight: 600 }}>
                    walletpro26@gmail.com
                  </a>.
                </li>
                <li>Include your <strong>Registered Email Address</strong>, <strong>Razorpay Payment ID</strong> (found on your payment receipt), and a brief explanation of the request.</li>
                <li>Our support team will review your request within 24–48 hours and process the refund if eligible.</li>
              </ol>
            </div>
          )}

          {/* CONTACT US */}
          {activeTab === 'contact' && (
            <div className="legal-doc-section">
              <h3 style={{ marginTop: 0, color: 'var(--text-heading, #1e293b)', fontSize: 18, fontWeight: 700 }}>
                Contact Us
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
                We are here to help! If you have any questions, technical support issues, or payment inquiries, please reach out to us using the contact details below.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                {/* Official Business Name */}
                <div
                  style={{
                    background: 'var(--bg-body, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: 12,
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <i className="fas fa-building" style={{ fontSize: 18, color: '#6366f1' }} />
                    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                      Legal Entity / Business Name
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                    <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }}>NextLifTechnologies</a>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Product: WalletVibe (Personal Finance Manager)
                  </div>
                </div>

                {/* Email Address */}
                <div
                  style={{
                    background: 'var(--bg-body, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: 12,
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <i className="fas fa-envelope" style={{ fontSize: 18, color: '#10b981' }} />
                    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                      Support Email
                    </span>
                  </div>
                  <div>
                    <a
                      href="mailto:walletpro26@gmail.com"
                      style={{ fontSize: 15, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}
                    >
                      walletpro26@gmail.com
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Secondary: support@nexliftech.space
                  </div>
                </div>

                {/* Phone Number */}
                <div
                  style={{
                    background: 'var(--bg-body, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: 12,
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <i className="fas fa-phone-alt" style={{ fontSize: 18, color: '#f59e0b' }} />
                    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                      Customer Support Phone / WhatsApp
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                    <a href="tel:+919682547458" style={{ color: 'inherit', textDecoration: 'none' }}>
                      +91 96825 47458
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Call / WhatsApp (Mon - Sat: 10:00 AM to 6:00 PM IST)
                  </div>
                </div>

                {/* Physical Contact Address */}
                <div
                  style={{
                    background: 'var(--bg-body, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    gridColumn: '1 / -1',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <i className="fas fa-map-marker-alt" style={{ fontSize: 18, color: '#ef4444' }} />
                    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                      Registered Physical Contact Address
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.5 }}>
                    <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: '#1e293b', textDecoration: 'none' }}>NextLifTechnologies Office</a>,<br />
                    Hardu Shichen Dialgam,<br />
                    Anantnag, Jammu &amp; Kashmir - 192210, India.
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 10,
                  padding: 16,
                  fontSize: 13,
                  color: '#065f46',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <i className="fas fa-info-circle" style={{ fontSize: 18, color: '#10b981', marginTop: 2 }} />
                <div>
                  <strong>Response Commitment:</strong> We aim to acknowledge all customer queries and billing inquiries within 24 hours on business days.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--bg-body, #f8fafc)',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: '#64748b' }}>
            © {new Date().getFullYear()} <a href="https://nexliftech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>NextLifTechnologies</a>. All Rights Reserved.
          </span>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{
              padding: '6px 18px',
              fontSize: 13,
              borderRadius: 8,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
