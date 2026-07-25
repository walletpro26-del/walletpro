import { handleOptions, corsHeaders } from './_shared/cors.js'
import { verifyAuthToken, adminDb } from './_shared/firebase-admin.js'
import { createConsentRequest } from './_shared/setu-client.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  try {
    const user = await verifyAuthToken(event)
    const userId = user.uid

    // Check Ultra subscription status from Firestore if adminDb is initialized
    if (adminDb) {
      const subDoc = await adminDb.collection('subscriptions').doc(userId).get()
      const subData = subDoc.exists ? subDoc.data() : null
      const isUltraOrAdmin =
        user.email === 'walletpro26@gmail.com' ||
        subData?.plan?.startsWith('ultra') ||
        subData?.plan === 'trial' ||
        subData?.status === 'active'

      if (!isUltraOrAdmin) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Ultra tier subscription required for automatic bank sync.' }),
        }
      }
    }

    const { consentId, redirectUrl, status, isMock } = await createConsentRequest(userId)

    // Store pending status in Firestore
    if (adminDb) {
      await adminDb.collection('linkedBanks').doc(userId).set({
        userId,
        consentId,
        status: 'PENDING',
        isMock,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true })
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        consentId,
        redirectUrl,
        status,
        isMock,
      }),
    }
  } catch (err) {
    console.error('[create-consent] Error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Consent creation failed' }),
    }
  }
}
