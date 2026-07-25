import { handleOptions, corsHeaders } from './_shared/cors.js'
import { verifyAuthToken, adminDb } from './_shared/firebase-admin.js'
import { revokeConsent } from './_shared/setu-client.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  try {
    const user = await verifyAuthToken(event)
    const userId = user.uid

    if (adminDb) {
      const docSnap = await adminDb.collection('linkedBanks').doc(userId).get()
      if (docSnap.exists) {
        const data = docSnap.data()
        if (data.consentId) {
          await revokeConsent(data.consentId)
        }
        await adminDb.collection('linkedBanks').doc(userId).delete()
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: 'Bank account unlinked successfully' }),
    }
  } catch (err) {
    console.error('[revoke-consent] Error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Revoke failed' }),
    }
  }
}
