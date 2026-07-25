import { auth } from '../firebase'

async function getAuthHeader() {
  const currentUser = auth.currentUser
  if (!currentUser) throw new Error('User not authenticated')
  const token = await currentUser.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

/**
 * Call Netlify Function /create-consent to get Setu redirect URL
 */
export async function createBankConsent() {
  const headers = await getAuthHeader()
  const res = await fetch('/.netlify/functions/create-consent', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to initiate bank consent flow')
  }
  return data
}

/**
 * Call Netlify Function /consent-callback to confirm consent approval
 */
export async function confirmBankConsent(consentId) {
  const headers = await getAuthHeader()
  const res = await fetch('/.netlify/functions/consent-callback', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ consentId }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Consent confirmation failed')
  }
  return data
}

/**
 * Call Netlify Function /revoke-consent to unlink bank
 */
export async function revokeBankConsent() {
  const headers = await getAuthHeader()
  const res = await fetch('/.netlify/functions/revoke-consent', {
    method: 'POST',
    headers,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to unlink bank account')
  }
  return data
}

/**
 * Call Netlify Function /bank-sync-status to check link status & timestamp
 */
export async function getBankSyncStatus() {
  try {
    const headers = await getAuthHeader()
    const res = await fetch('/.netlify/functions/bank-sync-status', {
      method: 'GET',
      headers,
    })

    if (!res.ok) return { linked: false, status: 'UNLINKED' }
    return await res.json()
  } catch (err) {
    return { linked: false, status: 'UNLINKED' }
  }
}

/**
 * Call Netlify Function /fetch-transactions manually on-demand
 */
export async function triggerManualBankSync() {
  const headers = await getAuthHeader()
  const res = await fetch('/.netlify/functions/fetch-transactions', {
    method: 'POST',
    headers,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to sync bank transactions')
  }
  return data
}
