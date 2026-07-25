import { handleOptions, corsHeaders } from './_shared/cors.js'
import { verifyAuthToken, adminDb } from './_shared/firebase-admin.js'
import { getConsentDetails } from './_shared/setu-client.js'
import { encrypt } from './_shared/crypto.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  try {
    const user = await verifyAuthToken(event)
    const userId = user.uid
    const body = JSON.parse(event.body || '{}')
    const consentId = body.consentId

    if (!consentId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'consentId parameter required' }) }
    }

    const details = await getConsentDetails(consentId)
    if (details.status !== 'APPROVED') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Consent approval failed. Status: ${details.status}` }),
      }
    }

    // Encrypt sensitive handle
    const encryptedData = encrypt(details.handle)

    if (adminDb) {
      await adminDb.collection('linkedBanks').doc(userId).set({
        userId,
        consentId: details.consentId,
        consentHandleEncrypted: encryptedData,
        bankName: details.bankName,
        accountNumber: details.accountNumber,
        status: 'ACTIVE',
        isMock: details.isMock,
        linkedAt: new Date(),
        lastSyncedAt: null,
        updatedAt: new Date(),
      }, { merge: true })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        bankName: details.bankName,
        accountNumber: details.accountNumber,
        status: 'ACTIVE',
        isMock: details.isMock,
      }),
    }
  } catch (err) {
    console.error('[consent-callback] Error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Consent callback verification failed' }),
    }
  }
}
