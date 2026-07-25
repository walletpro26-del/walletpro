import { handleOptions, corsHeaders } from './_shared/cors.js'
import { verifyAuthToken, adminDb } from './_shared/firebase-admin.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions()
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  try {
    const user = await verifyAuthToken(event)
    const userId = user.uid

    if (!adminDb) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ linked: false, status: 'UNLINKED' }),
      }
    }

    const docSnap = await adminDb.collection('linkedBanks').doc(userId).get()
    if (!docSnap.exists) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ linked: false, status: 'UNLINKED' }),
      }
    }

    const data = docSnap.data()
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        linked: data.status === 'ACTIVE',
        status: data.status || 'UNLINKED',
        bankName: data.bankName || 'Linked Bank',
        accountNumber: data.accountNumber || '',
        lastSyncedAt: data.lastSyncedAt ? (data.lastSyncedAt.toDate ? data.lastSyncedAt.toDate() : data.lastSyncedAt) : null,
        isMock: !!data.isMock,
      }),
    }
  } catch (err) {
    console.error('[bank-sync-status] Error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Status check failed' }),
    }
  }
}
