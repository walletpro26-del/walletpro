/**
 * Setu Account Aggregator API Client (Sandbox & Production ready)
 * Base URL default: https://fiu-sandbox.setu.co/v2
 */

const SETU_BASE_URL = process.env.SETU_BASE_URL || 'https://fiu-sandbox.setu.co/v2'
const SETU_CLIENT_ID = process.env.SETU_CLIENT_ID || ''
const SETU_CLIENT_SECRET = process.env.SETU_CLIENT_SECRET || ''
const SETU_REDIRECT_URL = process.env.SETU_REDIRECT_URL || 'https://walletvibe.netlify.app/?action=bank-linked'

/**
 * Check if Setu API credentials are set in environment
 */
export function isSetuConfigured() {
  return Boolean(SETU_CLIENT_ID && SETU_CLIENT_SECRET)
}

/**
 * Create a Consent Request via Setu AA
 */
export async function createConsentRequest(userId, phone = '9999999999') {
  if (!isSetuConfigured()) {
    // Return mock response when keys are not configured yet
    const mockConsentId = `mock_consent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    return {
      consentId: mockConsentId,
      redirectUrl: `${SETU_REDIRECT_URL}&consentId=${mockConsentId}&status=MOCK_APPROVED`,
      status: 'PENDING',
      isMock: true,
    }
  }

  const response = await fetch(`${SETU_BASE_URL}/consents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': SETU_CLIENT_ID,
      'x-client-secret': SETU_CLIENT_SECRET,
    },
    body: JSON.stringify({
      Detail: {
        consentStart: new Date().toISOString(),
        consentExpiry: new Date(Date.now() + 180 * 84600 * 1000).toISOString(),
        ConsentMode: 'STORE',
        fetchType: 'PERIODIC',
        ConsentTypes: ['TRANSACTIONS', 'PROFILE', 'SUMMARY'],
        FI Types: ['DEPOSIT'],
        DataConsumer: { id: SETU_CLIENT_ID },
        Customer: { id: `${phone}@setu` },
        Purpose: {
          code: '101',
          refUri: 'https://api.rebit.org.in/FISchema/purpose/101.json',
          text: 'Personal Finance Management & Auto Ledger Sync',
          Category: { type: 'Personal Finance' },
        },
        FIDataRange: {
          from: new Date(Date.now() - 90 * 84600 * 1000).toISOString(),
          to: new Date().toISOString(),
        },
        DataLife: { unit: 'MONTH', value: 12 },
        Frequency: { unit: 'HOUR', value: 6 },
      },
      redirectUrl: SETU_REDIRECT_URL,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Setu Consent Creation Failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return {
    consentId: data.id || data.consentId,
    redirectUrl: data.url || data.redirectUrl,
    status: data.status || 'PENDING',
    isMock: false,
  }
}

/**
 * Get Consent Details from Setu AA
 */
export async function getConsentDetails(consentId) {
  if (!isSetuConfigured() || String(consentId).startsWith('mock_')) {
    return {
      consentId,
      status: 'APPROVED',
      handle: `mock_handle_${consentId}`,
      bankName: 'HDFC Bank (Setu Sandbox)',
      accountNumber: 'XXXXXX4819',
      isMock: true,
    }
  }

  const response = await fetch(`${SETU_BASE_URL}/consents/${consentId}`, {
    method: 'GET',
    headers: {
      'x-client-id': SETU_CLIENT_ID,
      'x-client-secret': SETU_CLIENT_SECRET,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Setu Fetch Consent Failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return {
    consentId: data.id,
    status: data.status, // APPROVED | REJECTED | REVOKED
    handle: data.consentHandle || data.handle || data.id,
    bankName: data.fipName || 'Linked Bank',
    accountNumber: data.accountMask || '',
    isMock: false,
  }
}

/**
 * Revoke Consent via Setu AA
 */
export async function revokeConsent(consentId) {
  if (!isSetuConfigured() || String(consentId).startsWith('mock_')) {
    return { success: true, isMock: true }
  }

  const response = await fetch(`${SETU_BASE_URL}/consents/${consentId}/revoke`, {
    method: 'POST',
    headers: {
      'x-client-id': SETU_CLIENT_ID,
      'x-client-secret': SETU_CLIENT_SECRET,
    },
  })

  if (!response.ok) {
    console.warn(`Setu Revoke Warning (${response.status})`)
  }
  return { success: true, isMock: false }
}

/**
 * Fetch Transactions for an active Consent
 */
export async function fetchConsentTransactions(consentHandle) {
  if (!isSetuConfigured() || String(consentHandle).startsWith('mock_')) {
    // Return sample sandbox transactions
    const now = new Date()
    return [
      {
        txnId: `MOCK_TXN_${Date.now()}_1`,
        date: new Date(now.getTime() - 24 * 3600 * 1000).toISOString(),
        debit: 450,
        credit: 0,
        balance: 14250,
        bank: 'HDFC Bank (Auto Sync)',
        description: 'UPI/Swiggy/Order-8472',
      },
      {
        txnId: `MOCK_TXN_${Date.now()}_2`,
        date: new Date(now.getTime() - 48 * 3600 * 1000).toISOString(),
        debit: 0,
        credit: 5000,
        balance: 14700,
        bank: 'HDFC Bank (Auto Sync)',
        description: 'IMPS/Salary Transfer',
      },
    ]
  }

  // Real Setu Session & Data Fetch Flow
  const sessionRes = await fetch(`${SETU_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': SETU_CLIENT_ID,
      'x-client-secret': SETU_CLIENT_SECRET,
    },
    body: JSON.stringify({
      consentHandle,
      format: 'json',
    }),
  })

  if (!sessionRes.ok) {
    throw new Error(`Setu Create Session Failed (${sessionRes.status})`)
  }

  const sessionData = await sessionRes.json()
  const sessionId = sessionData.id

  // Fetch Session Data
  const dataRes = await fetch(`${SETU_BASE_URL}/sessions/${sessionId}/data`, {
    method: 'GET',
    headers: {
      'x-client-id': SETU_CLIENT_ID,
      'x-client-secret': SETU_CLIENT_SECRET,
    },
  })

  if (!dataRes.ok) {
    throw new Error(`Setu Fetch Session Data Failed (${dataRes.status})`)
  }

  const payload = await dataRes.json()
  const rawTxns = payload.transactions || payload.FI || []

  // Map to WalletVibe bankTransaction schema
  return rawTxns.map((t, idx) => ({
    txnId: t.txnId || t.reference || `SETU_TXN_${Date.now()}_${idx}`,
    date: t.transactionTimestamp || t.date || new Date().toISOString(),
    debit: parseFloat(t.type === 'DEBIT' ? t.amount : (t.debit || 0)),
    credit: parseFloat(t.type === 'CREDIT' ? t.amount : (t.credit || 0)),
    balance: parseFloat(t.currentBalance || t.balance || 0),
    bank: t.bankName || 'Linked Bank',
    description: t.narration || t.summary || t.mode || 'Bank Transaction',
  }))
}
