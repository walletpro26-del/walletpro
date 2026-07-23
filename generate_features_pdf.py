import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    pdf_path = os.path.join(os.path.dirname(__file__), "WalletVibe_Pro_Features.pdf")
    
    # Page setup - 0.75 in (54 pt) margins
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
    indigo_light = colors.HexColor("#e0e7ff")
    gray_dark = colors.HexColor("#1e293b")
    gray_muted = colors.HexColor("#64748b")
    success_green = colors.HexColor("#10b981")
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=indigo_dark,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=indigo_primary,
        spaceAfter=20
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=indigo_dark,
        spaceBefore=14,
        spaceAfter=10
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=gray_dark,
        spaceAfter=8
    )
    
    story = []
    
    # 1. Header Banner Title
    story.append(Paragraph("WalletVibe Pro Features", title_style))
    story.append(Paragraph("Unleash the full power of personal budget management & automated ledgers", subtitle_style))
    story.append(Spacer(1, 10))
    
    # 2. Key Features Table Grid
    features = [
        ("🚀", "Unlimited Ledger Transactions", "Record, tag, and organize as many incomes and expenses as you need. WalletVibe Pro lifts all transaction limits, allowing you to maintain detailed historical logs of your financial life."),
        ("📊", "Interactive Financial Analytics", "Visualize cash flows dynamically with sleek pie charts, category breakdown tables, and monthly trend graphs to monitor your savings progress effortlessly."),
        ("💾", "Real-Time Cloud Synchronization", "Sync your digital wallet safely across multiple devices using real-time database endpoints. Access your budgets on desktop, tablets, or mobile instantly."),
        ("📥", "Advanced Reports & Exports", "Generate financial ledger statements in premium PDF or structured Excel spreadsheets, ready for expense audits, taxes, or personal reviews."),
        ("🔔", "Custom Budgets & Alerts", "Configure threshold warnings on category spending. Get alerts before exceeding limits to guard against unnecessary spending."),
        ("👑", "Seamless Offline Fallback", "Manage financial records on the go. Local device caches ensure seamless data input even when networks are offline, auto-syncing when connection restores.")
    ]
    
    for emoji, title, desc in features:
        # Construct feature visual row
        data = [
            [
                Paragraph(f"<font size=16>{emoji}</font>", body_style),
                Paragraph(f"<b>{title}</b><br/>{desc}", body_style)
            ]
        ]
        
        t = Table(data, colWidths=[35, 469])
        t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(t)
        story.append(Spacer(1, 4))
        
    story.append(Spacer(1, 14))
    story.append(Paragraph("Why Upgrade to WalletVibe Pro?", section_heading))
    
    comparison_data = [
        ["Feature Category", "3-Day Free Trial", "WalletVibe Pro"],
        ["Access Duration", "Expires after 3 days", "Uninterrupted monthly / yearly access"],
        ["Transaction Logs", "Unlimited Logs (during trial)", "Unlimited Logs"],
        ["Data Security & Sync", "Safe Cloud Sync (Real-time)", "Safe Cloud Sync (Real-time)"],
        ["Data Export Format", "Excel / PDF Export Sheets", "Excel / PDF Export Sheets"],
        ["Claim Limit", "Once per email address", "Renew or extend anytime"],
        ["Customer Support", "Standard email", "Priority 24/7 Ticketing Support"]
    ]
    
    comp_table_data = []
    # Header Style
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=colors.white
    )
    col_style = ParagraphStyle(
        'ColStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=12,
        textColor=gray_dark
    )
    bold_col_style = ParagraphStyle(
        'BoldColStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12,
        textColor=indigo_dark
    )
    
    # Build comparison table paragraphs
    for idx, row in enumerate(comparison_data):
        if idx == 0:
            comp_table_data.append([
                Paragraph(row[0], header_style),
                Paragraph(row[1], header_style),
                Paragraph(row[2], header_style)
            ])
        else:
            comp_table_data.append([
                Paragraph(row[0], bold_col_style),
                Paragraph(row[1], col_style),
                Paragraph(row[2], col_style)
            ])
            
    comp_table = Table(comp_table_data, colWidths=[180, 160, 164])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), indigo_dark),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")])
    ]))
    
    story.append(comp_table)
    story.append(Spacer(1, 24))
    
    # 3. Footer banner
    footer_text = Paragraph(
        "<font color='#64748b' size=8.5>🔒 All subscriptions include PCI-DSS security compliance. Upgrades activate instantly across all linked devices automatically.</font>",
        ParagraphStyle('FooterText', parent=styles['Normal'], alignment=1)
    )
    story.append(footer_text)
    
    doc.build(story)
    print("Successfully built WalletVibe_Pro_Features.pdf!")

if __name__ == "__main__":
    generate_pdf()
