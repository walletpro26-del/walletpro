import os
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    pdf_filename = "WalletVibe_Play_Store_And_Multiplatform_Deployment_Guide.pdf"
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
    emerald_dark = colors.HexColor("#047857")
    indigo_primary = colors.HexColor("#4f46e5")
    gray_dark = colors.HexColor("#334155")
    gray_bg = colors.HexColor("#f8fafc")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=navy_dark,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=emerald_dark,
        spaceAfter=14
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=navy_dark,
        spaceBefore=10,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=gray_dark
    )

    bold_body = ParagraphStyle(
        'BoldBodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12.5,
        textColor=navy_dark
    )

    story = []

    # Title Banner
    story.append(Paragraph("WALLET VIBE — PLAY STORE (.AAB) & MULTIPLATFORM DEPLOYMENT INSTRUCTIONS", title_style))
    story.append(Paragraph("Mandatory Specifications for Google Play App Bundles (.aab) & Multi-Layer Web/App Synchronization", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=emerald_dark, spaceAfter=10))

    # Section 1: Google Play Store Mandatory Requirements (.aab)
    story.append(Paragraph("1. Google Play Store Mandatory Requirements (.aab)", section_heading))
    play_reqs = (
        "<b>• Format Type: Official .aab (Android App Bundle):</b> Google Play requires all new apps and updates to be submitted as an <code>.aab</code> package. APKs are obsolete for Play Store publishing.<br/>"
        "<b>• How It Works:</b> The <code>.aab</code> bundle contains compiled web assets, Android manifest, and native wrappers. Google Play automatically generates device-optimized APKs for each user's specific CPU and screen density.<br/>"
        "<b>• Play App Signing:</b> App signing is managed by Google Play. Developers sign the <code>.aab</code> using an Upload Key, while Google signs the generated APKs delivered to users.<br/>"
        "<b>• Target API Level:</b> Must target Android 14 (API level 34 or higher)."
    )
    story.append(Paragraph(play_reqs, body_style))
    story.append(Spacer(1, 8))

    # Section 2: Step-by-Step TWA / Bubblewrap .aab Generation Guide
    story.append(Paragraph("2. Step-by-Step TWA / Bubblewrap (.aab) Build Guide", section_heading))
    twa_steps = (
        "<b>Step 1: Install Bubblewrap CLI:</b><br/>"
        "<code>npm install -g @bubblewrap/cli</code><br/><br/>"
        "<b>Step 2: Initialize TWA Project from Netlify WebApp:</b><br/>"
        "<code>bubblewrap init --manifest=https://walletvibe.netlify.app/manifest.json</code><br/><br/>"
        "<b>Step 3: Digital Asset Links Verification (Hides URL Bar):</b><br/>"
        "Extract SHA-256 fingerprint from upload key: <code>keytool -list -v -keystore android.keystore</code>.<br/>"
        "Create <code>public/.well-known/assetlinks.json</code> with statement target package name and SHA-256 fingerprint so Chrome runs the app in 100% fullscreen native app mode.<br/><br/>"
        "<b>Step 4: Build Official Signed .aab Package:</b><br/>"
        "<code>bubblewrap build</code><br/>"
        "This outputs <code>app-release-signed.aab</code> ready for direct upload to Google Play Console."
    )
    story.append(Paragraph(twa_steps, body_style))
    story.append(Spacer(1, 8))

    # Section 3: Multi-Layer Synchronization Protocol
    story.append(Paragraph("3. Multi-Layer Synchronization Protocol for Updates", section_heading))

    table_data = [
        [Paragraph("Target Layer", bold_body), Paragraph("Update Trigger & Mechanism", bold_body), Paragraph("Synchronization Requirement", bold_body)],

        [
            Paragraph("<b>Layer 1: Web App</b>", body_style),
            Paragraph("Code changes pushed to GitHub <code>main</code> branch.", body_style),
            Paragraph("Netlify automatically triggers continuous integration build, deploying static assets to CDN edge within ~30s.", body_style)
        ],
        [
            Paragraph("<b>Layer 2: Browser PWA</b>", body_style),
            Paragraph("User accesses website via browser or home screen icon.", body_style),
            Paragraph("Service Worker detects new assets, invalidates local cache version, and prompts instant update reload.", body_style)
        ],
        [
            Paragraph("<b>Layer 3: Play Store (.aab)</b>", body_style),
            Paragraph("Version bump in <code>build.gradle</code> (e.g. <code>versionCode 102</code>).", body_style),
            Paragraph("Re-run <code>bubblewrap build</code>, upload updated <code>.aab</code> to Google Play Console Production track.", body_style)
        ],
        [
            Paragraph("<b>Layer 4: Cross-Device UI</b>", body_style),
            Paragraph("Responsive CSS viewport testing across viewports.", body_style),
            Paragraph("Enforce layout parity for Mobile (360-480px), Tablet (768-1024px), Desktop (1280px+), Foldables, and ChromeOS.", body_style)
        ]
    ]

    t = Table(table_data, colWidths=[100, 200, 232])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), gray_bg),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # Section 4: Mandatory Quality & Parity Rules
    story.append(Paragraph("4. Mandatory Quality & Parity Rules for Developers & AI Agents", section_heading))
    rules_text = (
        "1. <b>Zero Platform Discrepancy:</b> Features added to the WebApp MUST work identically in the standalone PWA and Play Store TWA <code>.aab</code> build.<br/>"
        "2. <b>No Browser Popups:</b> Never use native <code>alert()</code> or <code>confirm()</code>. Always use portal-rendered custom dialogs (<code>CustomDialogModal.jsx</code>).<br/>"
        "3. <b>Deterministic Duplicates:</b> Duplicate checks MUST enforce 12-digit RRN uniqueness, exact amounts, and merchant token matching.<br/>"
        "4. <b>Offline Persistence:</b> Always write data changes to localCache snapshot alongside Firestore writeBatch operations."
    )
    story.append(Paragraph(rules_text, body_style))

    doc.build(story)
    shutil.copy(pdf_path, public_pdf_path)
    print(f"Generated PDF: {pdf_path}")

if __name__ == '__main__':
    generate_pdf()
