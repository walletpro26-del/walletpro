import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf():
    pdf_path = os.path.join(os.path.dirname(__file__), "WalletVibe_Codebase_Metrics_And_Cost.pdf")
    
    # Page setup - 0.75 in (54 pt) margins
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Color Palette
    indigo_dark = colors.HexColor("#1e1b4b")
    indigo_primary = colors.HexColor("#6366f1")
    indigo_light = colors.HexColor("#e0e7ff")
    gray_dark = colors.HexColor("#0f172a")
    gray_slate = colors.HexColor("#334155")
    gray_muted = colors.HexColor("#64748b")
    gray_bg = colors.HexColor("#f8fafc")
    success_green = colors.HexColor("#10b981")
    amber_color = colors.HexColor("#f59e0b")
    rose_color = colors.HexColor("#ef4444")
    
    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=indigo_dark,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10.5,
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
        textColor=indigo_dark,
        spaceBefore=12,
        spaceAfter=8
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=gray_slate,
        spaceAfter=6
    )

    card_label_style = ParagraphStyle(
        'CardLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=gray_muted
    )

    card_val_style = ParagraphStyle(
        'CardVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=16,
        textColor=indigo_dark
    )

    card_sub_style = ParagraphStyle(
        'CardSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=indigo_primary
    )

    story = []
    
    # 1. Title Banner
    story.append(Paragraph("WalletVibe Codebase Metrics & Cost Analysis", title_style))
    story.append(Paragraph("Executive Engineering Audit, Token Trajectory & Firestore Storage Analysis", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=12))

    # 2. Executive Stat Cards (2x2 Grid)
    stat_cards_data = [
        [
            [Paragraph("TOTAL CODEBASE LINES & TOKENS", card_label_style), Paragraph("16,798 LOC", card_val_style), Paragraph("191,877 Base Tokens (46 Files)", card_sub_style)],
            [Paragraph("EST. 15X AGENTIC API COST", card_label_style), Paragraph("$11.54 USD", card_val_style), Paragraph("≈ ₹964 INR (15x Iteration Multiplier)", card_sub_style)]
        ],
        [
            [Paragraph("HUMAN ENG. EQUIVALENT", card_label_style), Paragraph("672 Hours", card_val_style), Paragraph("≈ $33,600 USD Value Created", card_sub_style)],
            [Paragraph("FIRESTORE TIER LIMIT", card_label_style), Paragraph("1.0 GB", card_val_style), Paragraph("Firebase Spark Free Quota Active", card_sub_style)]
        ]
    ]

    card_table_data = []
    for row in stat_cards_data:
        row_cells = []
        for cell in row:
            cell_content = [cell[0], Spacer(1, 3), cell[1], Spacer(1, 2), cell[2]]
            cell_table = Table([[c] for c in cell_content], colWidths=[245])
            cell_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), gray_bg),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ]))
            row_cells.append(cell_table)
        card_table_data.append(row_cells)

    grid_table = Table(card_table_data, colWidths=[260, 260])
    grid_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(grid_table)
    story.append(Spacer(1, 8))

    # Overall Cost Summary Callout Box
    total_cost_summary_text = (
        "<b>💰 TOTAL OVERALL DEVELOPMENT COST SUMMARY:</b><br/>"
        "• <b>TOTAL AGENTIC DEVELOPMENT COST (15x Tokens):</b> <font color='#10b981'><b>$11.54 USD (≈ ₹964 INR)</b></font><br/>"
        "• <b>EQUIVALENT HUMAN SOFTWARE DEV COST (672 Hours):</b> <b>$33,600.00 USD (≈ ₹28,05,000 INR)</b><br/>"
        "• <b>TOTAL ENGINEERING COST SAVINGS:</b> <font color='#6366f1'><b>$33,588.46 USD (99.97% Cost Savings via Agentic Automation)</b></font>"
    )
    summary_box = Table([[Paragraph(total_cost_summary_text, ParagraphStyle('SummaryBoxText', parent=body_style, fontSize=9.5, leading=14, textColor=indigo_dark))]], colWidths=[520])
    summary_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e0e7ff")),
        ('BOX', (0,0), (-1,-1), 1, indigo_primary),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(summary_box)
    story.append(Spacer(1, 10))

    # 3. Section 1: Firestore Occupancy & 90% Protocol
    story.append(Paragraph("1. Firestore Database Storage & 90% Threshold Protocol", section_heading))
    
    firestore_text = (
        "Firestore Spark Free Plan includes <b>1.0 GB (1,024 MB / ~1,073,741,824 Bytes)</b> of stored data.<br/>"
        "• <b>Live Occupancy Inspection:</b> Firebase Console (console.firebase.google.com) ➔ Project <b>WalletVibe</b> ➔ <b>Firestore Database</b> ➔ <b>Usage</b> tab.<br/>"
        "• <b>What if Storage Reaches 90% (900 MB)?</b> Upgrading to the Firebase <b>Blaze Plan</b> removes the 1 GB cap. Additional storage beyond 1 GB costs only <b>$0.18 per GB per month</b> (approx ₹15/month per extra GB).<br/>"
        "• <b>Caching Protection:</b> WalletVibe uses local snapshot caching (<code>wv_cached_snapshot_*</code>) so clients sync delta changes without inflating Firestore reads or storage."
    )
    story.append(Paragraph(firestore_text, body_style))
    story.append(Spacer(1, 8))

    # 4. Section 2: Agentic Token & Cost Estimation
    story.append(Paragraph("2. Agentic Cost & Token Trajectory Breakdown (15x Iteration Model)", section_heading))
    
    note_text = (
        "<b>NOTE ON ITERATION MULTIPLIER:</b> To develop a 16,798 LOC production codebase, multiple agentic iterations "
        "happen (prompting, file reading, code generation, debugging & refactoring). The overall cost is calculated using a "
        "<b>15x iteration multiplier</b> (15 \u00d7 191,877 = <b>2,878,155 Total Tokens</b>)."
    )
    story.append(Paragraph(note_text, ParagraphStyle('NoteText', parent=body_style, textColor=indigo_dark, backColor=colors.HexColor("#e0e7ff"), borderPadding=6, spaceAfter=8)))

    table_header_style = ParagraphStyle('TH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=colors.white)
    table_cell_style = ParagraphStyle('TD', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, textColor=gray_dark)
    table_cell_bold = ParagraphStyle('TDBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=indigo_dark)

    cost_data = [
        [
            Paragraph("Metric Category", table_header_style),
            Paragraph("Token Volume", table_header_style),
            Paragraph("Iteration Multiplier & Purpose", table_header_style),
            Paragraph("Estimated Cost (USD)", table_header_style)
        ],
        [
            Paragraph("Raw Codebase Snapshot", table_cell_bold),
            Paragraph("191,877 Tokens", table_cell_style),
            Paragraph("1.0x Base Repository (16,798 LOC)", table_cell_style),
            Paragraph("Static Code Base", table_cell_style)
        ],
        [
            Paragraph("Agentic Input Trajectory", table_cell_bold),
            Paragraph("2,302,524 Tokens", table_cell_style),
            Paragraph("12.0x Context & Workspace Reads", table_cell_style),
            Paragraph("$5.76 USD (@ $2.50/1M)", table_cell_style)
        ],
        [
            Paragraph("Agentic Output Tokens", table_cell_bold),
            Paragraph("575,631 Tokens", table_cell_style),
            Paragraph("3.0x Generated Code & Refactors", table_cell_style),
            Paragraph("$5.76 USD (@ $10.00/1M)", table_cell_style)
        ],
        [
            Paragraph("<b>TOTAL 15X AGENTIC COST</b>", ParagraphStyle('THB', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=indigo_dark)),
            Paragraph("<b>2,878,155 Tokens</b>", table_cell_bold),
            Paragraph("<b>15.0x Full Development Cycle</b>", table_cell_bold),
            Paragraph("<b>$11.54 USD (\u2248 \u20b9964 INR)</b>", ParagraphStyle('THB2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=success_green))
        ]
    ]

    cost_table = Table(cost_data, colWidths=[140, 115, 155, 120])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), indigo_dark),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#e0e7ff")),
    ]))
    story.append(cost_table)
    story.append(Spacer(1, 10))

    # 5. Section 3: Top Files Breakdown Table
    story.append(Paragraph("3. Top Codebase Files by Token Density", section_heading))

    top_files = [
        ("src/styles.css", "2,333", "60,982", "16,482 tokens"),
        ("src/components/ReportsView.jsx", "1,664", "86,588", "23,403 tokens"),
        ("src/components/BankSearchModal.jsx", "1,040", "49,792", "13,457 tokens"),
        ("src/components/AdminPanel.jsx", "1,025", "56,098", "15,162 tokens"),
        ("src/components/CsvImportModal.jsx", "834", "39,682", "10,724 tokens"),
        ("src/components/PersonMergeModal.jsx", "683", "28,965", "7,828 tokens"),
        ("src/App.jsx", "589", "22,818", "6,167 tokens"),
        ("src/components/RatingModal.jsx", "567", "22,349", "6,040 tokens"),
        ("src/api/subscription.js", "550", "18,947", "5,121 tokens"),
        ("src/components/LegalModal.jsx", "495", "28,249", "7,637 tokens"),
        ("src/components/SubscriptionModal.jsx", "486", "27,585", "7,454 tokens"),
        ("src/components/MultiSelectCombobox.jsx", "416", "15,416", "4,166 tokens"),
        ("src/components/SettingsModal.jsx", "399", "19,579", "5,291 tokens"),
        ("src/components/Header.jsx", "392", "18,041", "4,879 tokens")
    ]

    file_table_data = [
        [
            Paragraph("File Path", table_header_style),
            Paragraph("Lines (LOC)", table_header_style),
            Paragraph("Characters", table_header_style),
            Paragraph("Estimated Tokens", table_header_style)
        ]
    ]

    for f_path, f_loc, f_chars, f_tokens in top_files:
        file_table_data.append([
            Paragraph(f"<b>{f_path}</b>", ParagraphStyle('FPath', parent=styles['Normal'], fontName='Courier-Bold', fontSize=8, textColor=indigo_dark)),
            Paragraph(f_loc, table_cell_style),
            Paragraph(f_chars, table_cell_style),
            Paragraph(f_tokens, ParagraphStyle('FTok', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, textColor=indigo_primary))
        ])

    # Add GROSS TOTAL row summarizing full workspace
    file_table_data.append([
        Paragraph("<b>GROSS TOTAL (Entire 46 Workspace Files)</b>", ParagraphStyle('FTotalTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=indigo_dark)),
        Paragraph("<b>16,798 LOC</b>", ParagraphStyle('FTotalVal1', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=indigo_dark)),
        Paragraph("<b>710,974 Chars</b>", ParagraphStyle('FTotalVal2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=indigo_dark)),
        Paragraph("<b>191,877 Base Tokens (2.88M Trajectory)</b>", ParagraphStyle('FTotalVal3', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, textColor=indigo_primary))
    ])

    file_table = Table(file_table_data, colWidths=[200, 95, 105, 132])
    file_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), indigo_dark),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, gray_bg]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#e0e7ff")),
    ]))
    story.append(file_table)
    story.append(Spacer(1, 14))

    # 6. Footer
    footer_text = Paragraph(
        "<font color='#64748b' size=8>🔒 WalletVibe Architecture & Executive PDF Report • NextLifTechnologies</font>",
        ParagraphStyle('FooterText', parent=styles['Normal'], alignment=1)
    )
    story.append(footer_text)

    doc.build(story)
    print("Successfully built WalletVibe_Codebase_Metrics_And_Cost.pdf!")

if __name__ == "__main__":
    generate_pdf()
