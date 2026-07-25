import os
import shutil
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    pdf_filename = "WalletVibe_Pro_Features.pdf"
    pdf_path = os.path.join(os.path.dirname(__file__), pdf_filename)
    public_pdf_path = os.path.join(os.path.dirname(__file__), "public", pdf_filename)
    
    # Page setup - 0.75 in (54 pt) margins (504 pt available width)
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Palette
    indigo_dark = colors.HexColor("#1e1b4b")
    indigo_primary = colors.HexColor("#6366f1")
    purple_ultra = colors.HexColor("#8b5cf6")
    gray_dark = colors.HexColor("#1e293b")
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=indigo_dark,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=indigo_primary,
        spaceAfter=16
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=indigo_dark,
        spaceBefore=12,
        spaceAfter=8
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=gray_dark,
        spaceAfter=6
    )
    
    story = []
    
    # 1. Header Banner Title
    story.append(Paragraph("WalletVibe Features & Subscription Tiers", title_style))
    story.append(Paragraph("Compare Free Trial, WalletVibe Pro, and WalletVibe Ultra (Automated Bank Sync)", subtitle_style))
    story.append(Spacer(1, 4))
    
    # 2. Key Features List
    features = [
        ("⚡", "Automatic Bank Transaction Sync (Ultra)", "Link your bank once via RBI-regulated Account Aggregator (Setu AA). Transactions automatically appear in your ledger with zero password or credential storage."),
        ("🤖", "AI-Powered PDF & Image Statement Import", "Upload bank statement PDFs, images, or receipts — Gemini AI automatically extracts dates, debits, credits, and descriptions with 1-click import."),
        ("🚀", "Unlimited Ledger Transactions", "Record, tag, and organize as many incomes, expenses, and lend/borrow records as you need with zero record caps."),
        ("📊", "Interactive Financial Analytics & Reports", "Visualize cash flows dynamically with category pie charts, monthly trends, and export statements in PDF or Excel formats."),
        ("🏦", "Inline Bank History Search", "Dedicated Bank History tab lets you search and filter imported & auto-synced bank transactions by date, bank name, or remarks in real-time."),
        ("💾", "Real-Time Cloud Synchronization & Offline PWA", "Sync your digital wallet safely across desktop, mobile, and tablets. Fully functional offline with auto-sync when connection restores.")
    ]
    
    for emoji, title, desc in features:
        data = [
            [
                Paragraph(f"<font size=14>{emoji}</font>", body_style),
                Paragraph(f"<b>{title}</b><br/>{desc}", body_style)
            ]
        ]
        
        t = Table(data, colWidths=[30, 474])
        t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(t)
        story.append(Spacer(1, 2))
        
    story.append(Spacer(1, 8))
    story.append(Paragraph("Subscription Tier Comparison", section_heading))
    
    comparison_data = [
        ["Feature / Capability", "3-Day Free Trial", "WalletVibe Pro", "WalletVibe Ultra 👑"],
        ["Price & Billing", "₹0 (3 Days Full)", "₹20/mo or ₹150/yr", "₹49/mo or ₹399/yr"],
        ["Transaction Logs", "Unlimited (3 days)", "Unlimited Logs", "Unlimited Logs"],
        ["AI Statement Import", "Included (Gemini AI)", "Included (Gemini AI)", "Included (Gemini AI)"],
        ["Bank History View", "Included", "Included (Manual CSV)", "Included (Auto + CSV)"],
        ["Auto Bank Sync (AA)", "Included (Trial test)", "Manual CSV/PDF only", "⚡ 1-Click Auto Sync"],
        ["Cloud Sync & Analytics", "Real-time Cloud Sync", "Real-time Cloud Sync", "Real-time Cloud Sync"],
        ["Export Formats", "Excel & PDF Sheets", "Excel & PDF Sheets", "Excel & PDF Sheets"],
        ["Customer Support", "Standard Email", "Priority Support", "👑 Ultra 24/7 Priority"]
    ]
    
    comp_table_data = []
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white
    )
    col_style = ParagraphStyle(
        'ColStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=gray_dark
    )
    bold_col_style = ParagraphStyle(
        'BoldColStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=indigo_dark
    )
    ultra_header_style = ParagraphStyle(
        'UltraHeaderStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#fef08a")
    )
    
    for idx, row in enumerate(comparison_data):
        if idx == 0:
            comp_table_data.append([
                Paragraph(row[0], header_style),
                Paragraph(row[1], header_style),
                Paragraph(row[2], header_style),
                Paragraph(row[3], ultra_header_style)
            ])
        else:
            comp_table_data.append([
                Paragraph(row[0], bold_col_style),
                Paragraph(row[1], col_style),
                Paragraph(row[2], col_style),
                Paragraph(row[3], col_style)
            ])
            
    comp_table = Table(comp_table_data, colWidths=[134, 110, 130, 130])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), indigo_dark),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")])
    ]))
    
    story.append(comp_table)
    story.append(Spacer(1, 14))
    
    # 3. Footer banner
    footer_text = Paragraph(
        "<font color='#64748b' size=8>🔒 PCI-DSS Compliant • Upgrades activate instantly across all linked devices automatically.</font>",
        ParagraphStyle('FooterText', parent=styles['Normal'], alignment=1)
    )
    story.append(footer_text)
    
    doc.build(story)
    
    # Copy to public folder
    if os.path.exists(os.path.dirname(public_pdf_path)):
        shutil.copyfile(pdf_path, public_pdf_path)
        print(f"Copied {pdf_filename} to public directory.")
        
    print(f"Successfully generated {pdf_filename}!")

if __name__ == "__main__":
    generate_pdf()
