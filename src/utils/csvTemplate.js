/**
 * csvTemplate.js — Helper utility for downloadable Bank Statement CSV Template
 * and LLM (ChatGPT / Gemini / Claude) prompt instructions.
 */

export const SAMPLE_BANK_CSV_HEADER = "Date,Bank,Description,Debit,Credit,Balance\n"
export const SAMPLE_BANK_CSV_ROWS = [
  "2026-07-01,HDFC Bank,Salary Credit,,50000,125000.50",
  "2026-07-02,HDFC Bank,UPI-Swiggy Food Order,350,,124650.50",
  "2026-07-05,SBI,Electricity Bill Payment,1200,,123450.50",
  "2026-07-10,Axis Bank,ATM Cash Withdrawal,5000,,118450.50",
  "2026-07-15,HDFC Bank,Interest Credit,,120,118570.50",
].join("\n")

export function downloadBankCsvTemplate() {
  const content = SAMPLE_BANK_CSV_HEADER + SAMPLE_BANK_CSV_ROWS
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'WalletVibe_Bank_Statement_Template.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const LLM_BANK_PDF_CONVERSION_PROMPT = `Please extract all bank transactions from my PDF bank statement and output ONLY a clean CSV with these exact headers:
Date,Bank,Description,Debit,Credit,Balance

Formatting Rules:
- Date format: YYYY-MM-DD
- Bank: Bank name (e.g. HDFC Bank, SBI, ICICI)
- Debit: Amount spent or leave blank
- Credit: Amount received or leave blank
- Balance: Account balance after transaction
- Do not include currency symbols ($ or ₹) or commas inside amounts.`
