import { handleOptions, corsHeaders } from './_shared/cors.js'
import { verifyAuthToken, adminDb } from './_shared/firebase-admin.js'
import { fetchConsentTransactions } from './_shared/setu-client.js'
import { decrypt } from './_shared/crypto.js'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions()

  try {
    let targetUserId = null

    // If triggered by client HTTP request, verify Bearer token
    if (event.headers && (event.headers.authorization || event.headers.Authorization)) {
      const user = await verifyAuthToken(event)
      targetUserId = user.uid
    }

    if (!adminDb) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, count: 0, message: 'Database uninitialized' }),
      }
    }

    // Find active consents
    let queryRef = adminDb.collection('linkedBanks').where('status', '==', 'ACTIVE')
    if (targetUserId) {
      queryRef = adminDb.collection('linkedBanks').where('userId', '==', targetUserId).where('status', '==', 'ACTIVE')
    }

    const snap = await queryRef.get()
    let totalInserted = 0

    for (const doc of snap.docs) {
      const linkData = doc.data()
      const userId = linkData.userId

      // Decrypt consent handle
      let consentHandle = linkData.consentId
      if (linkData.consentHandleEncrypted) {
        try {
          consentHandle = decrypt(linkData.consentHandleEncrypted)
        } catch (e) {
          console.warn('[fetch-transactions] Decryption fallback to consentId')
        }
      }

      // Fetch transactions
      const txns = await fetchConsentTransactions(consentHandle)
      if (txns && txns.length > 0) {
        // Query existing transactions for user to deduplicate
        const existingSnap = await adminDb.collection('bankTransactions').where('userId', '==', userId).get()
        const existingSet = new Set()
        existingSnap.docs.forEach((d) => {
          const data = d.data()
          const key = `${data.date}_${data.debit}_${data.credit}_${data.bank}_${data.description}`
          existingSet.add(key)
        })

        const batch = adminDb.batch()
        let count = 0

        for (const t of txns) {
          const dateObj = t.date ? new Date(t.date) : new Date()
          const key = `${dateObj.toISOString()}_${t.debit || 0}_${t.credit || 0}_${t.bank || 'Bank'}_${t.description || ''}`

          if (!existingSet.has(key)) {
            const newRef = adminDb.collection('bankTransactions').doc()
            batch.set(newRef, {
              userId,
              uid: userId,
              bank: t.bank || linkData.bankName || 'Linked Bank',
              date: dateObj,
              dateObj,
              debit: t.debit || 0,
              credit: t.credit || 0,
              balance: t.balance || 0,
              description: t.description || 'Auto-synced transaction',
              narration: t.description || 'Auto-synced transaction',
              autoSynced: true,
              syncedAt: new Date(),
              createdAt: new Date(),
            })
            count++
          }
        }

        if (count > 0) {
          await batch.commit()
          totalInserted += count
        }

        // Update lastSyncedAt
        await doc.ref.update({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        count: totalInserted,
        message: `Successfully synced ${totalInserted} transactions!`,
      }),
    }
  } catch (err) {
    console.error('[fetch-transactions] Error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Fetch transactions failed' }),
    }
  }
}
