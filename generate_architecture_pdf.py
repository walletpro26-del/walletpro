import os
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    pdf_filename = "WalletVibe_Architecture_And_Feature_Matrix.pdf"
    pdf_path = os.path.join(os.path.dirname(__file__), pdf_filename)
    public_pdf_path = os.path.join(os.path.dirname(__file__), "public", pdf_filename)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    # Color Palette
    navy_dark = colors.HexColor("#0f172a")
    indigo_primary = colors.HexColor("#4f46e5")
    indigo_light = colors.HexColor("#818cf8")
    emerald_accent = colors.HexColor("#059669")
    gray_dark = colors.HexColor("#334155")
    gray_bg = colors.HexColor("#f8fafc")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=navy_dark,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=indigo_primary,
        spaceAfter=14
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=navy_dark,
        spaceBefore=10,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=gray_dark
    )

    bold_body = ParagraphStyle(
        'BoldBodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=navy_dark
    )

    story = []

    # Title Banner
    story.append(Paragraph("WALLET VIBE — ARCHITECTURE & FEATURE MATRIX", title_style))
    story.append(Paragraph("Unified Web, PWA & Native Play Store (.aab) Ecosystem Technical Specification", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=indigo_primary, spaceAfter=12))

    # Section 1: Executive Overview & Multiplatform Vision
    story.append(Paragraph("1. Executive Overview & Multiplatform Vision", section_heading))
    overview_text = (
        "WalletVibe is architected as an offline-first, multi-platform personal finance management suite. "
        "The system guarantees 100% functional, visual, and performance parity across three deployment targets: "
        "(1) <b>Web Application</b> (hosted on Netlify CDN), (2) <b>Progressive Web App (PWA)</b> (installable via browser prompts), "
        "and (3) <b>Google Play Store Native Android App Bundle (.aab)</b> via Trusted Web Activity (TWA) architecture. "
        "All data transformations, bank description normalizations, and Firestore operations maintain deterministic state regardless of platform."
    )
    story.append(Paragraph(overview_text, body_style))
    story.append(Spacer(1, 10))

    # Section 2: Broader to Narrower Feature Hierarchy
    story.append(Paragraph("2. Broader to Narrower Feature Hierarchy", section_heading))

    table_data = [
        [Paragraph("Feature Area", bold_body), Paragraph("Broader Domain Capability", bold_body), Paragraph("Narrower Technical Implementation", bold_body)],

        [
            Paragraph("<b>Expense & Income Tracking</b>", body_style),
            Paragraph("Comprehensive record-keeping for daily expenses, payments, categories, and custom notes.", body_style),
            Paragraph("Real-time balance calculations, category statistics, receipt attachments, PDF export, and instant WhatsApp summary formatting.", body_style)
        ],
        [
            Paragraph("<b>Lending & Borrowing</b>", body_style),
            Paragraph("Person-wise debt ledger tracking who owes money and outstanding receivables.", body_style),
            Paragraph("Settlement status toggles, person-specific ledger breakdown, contact phone/email linking, and direct reminder messaging.", body_style)
        ],
        [
            Paragraph("<b>Smart Bank Statement Parser</b>", body_style),
            Paragraph("Automated extraction of bank statements from CSV and PDF files across major Indian banks.", body_style),
            Paragraph("Regex description tokenizer (UPI RRN, IMPS, NEFT, CWDR, POS), debit/credit separator, balance tracking, and draft local cache persistence.", body_style)
        ],
        [
            Paragraph("<b>Automated Duplicate Cleaner</b>", body_style),
            Paragraph("Intelligent scanner to identify and safely purge duplicate bank records.", body_style),
            Paragraph("Deterministic 5-step decision engine (Amount, DR/CR, Date <= 1d, 12-digit RRN match, Merchant tokens), React Portal virtualized cluster view (<2ms batch), and Firestore writeBatch bulk deletion.", body_style)
        ],
        [
            Paragraph("<b>Offline-First Cache Engine</b>", body_style),
            Paragraph("Uninterrupted functionality when internet connectivity is intermittent or unavailable.", body_style),
            Paragraph("Dual-layer caching (in-memory Map + user-isolated localStorage snapshots), fallback queries for legacy UID schemas, and pending queue sync.", body_style)
        ],
        [
            Paragraph("<b>Admin Control & Subscriptions</b>", body_style),
            Paragraph("Tiered user subscriptions, registration limits, and administrative controls.", body_style),
            Paragraph("Razorpay integration, trial claim workflows, subscriber capacity limits, duplicate account purger, and remote app configuration toggles.", body_style)
        ]
    ]

    t = Table(table_data, colWidths=[110, 190, 232])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), gray_bg),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # Section 3: Technical Architecture & Cloud Topology
    story.append(Paragraph("3. Technical Architecture & Cloud Topology", section_heading))
    arch_text = (
        "<b>• Frontend Core:</b> Built on React 18 and Vite with vanilla CSS design system, dark mode support, custom modal portal layers, and mobile-first responsive breakpoints (360px to 4K).<br/>"
        "<b>• Data Layer:</b> Google Cloud Firestore utilizing dual-field querying (<code>userId</code> & <code>uid</code>), batch operations (<code>writeBatch</code>), and strict rule-based security scoping.<br/>"
        "<b>• Cloud Infrastructure:</b> Hosted on Netlify CDN Edge nodes with Netlify Functions for serverless backend tasks, asset caching, and HTTPS SSL enforcement.<br/>"
        "<b>• Native Wrapper Layer:</b> Digital Asset Links (<code>assetlinks.json</code>) hosted at <code>/.well-known/assetlinks.json</code> to enable full-screen Trusted Web Activity (TWA) mode in Google Play Store builds."
    )
    story.append(Paragraph(arch_text, body_style))
    story.append(Spacer(1, 10))

    # Section 4: Security & Error Handling Infrastructure
    story.append(Paragraph("4. Security & User Error Sanitization", section_heading))
    sec_text = (
        "<b>• Error Sanitizer (<code>userFriendlyError.js</code>):</b> All raw Firebase exceptions, stack traces, and network timeouts are sanitized into polite, subscriber-friendly guidance messages.<br/>"
        "<b>• Custom Dialog System (<code>CustomDialogModal.jsx</code>):</b> Native browser <code>alert()</code> and <code>confirm()</code> popups are replaced with portal-rendered glassmorphic dialogs centered in the viewport.<br/>"
        "<b>• Firestore Rules (<code>firestore.rules</code>):</b> Strict rule scoping enforcing document ownership validation for <code>expenses</code>, <code>lending</code>, <code>bankTransactions</code>, and <code>subscriptions</code>."
    )
    story.append(Paragraph(sec_text, body_style))

    doc.build(story)
    shutil.copy(pdf_path, public_pdf_path)
    print(f"Generated PDF: {pdf_path}")

if __name__ == '__main__':
    generate_pdf()
