import admin from 'firebase-admin'

if (!admin.apps.length) {
  try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountRaw) {
      const serviceAccount = JSON.parse(serviceAccountRaw)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      // Fallback for local development or when service account is initialized via default application credentials
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'walletpro-aa1f3',
      })
    }
  } catch (err) {
    console.warn('[firebase-admin] Init warning:', err.message)
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : null
export const adminAuth = admin.apps.length ? admin.auth() : null

/**
 * Verify Firebase Auth Bearer token from HTTP Authorization header
 */
export async function verifyAuthToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }
  const token = authHeader.split('Bearer ')[1].trim()
  if (!adminAuth) {
    // Development fallback if service account is not yet configured in Netlify env
    return { uid: 'dev-user-id', email: 'walletpro26@gmail.com' }
  }
  const decodedToken = await adminAuth.verifyIdToken(token)
  return decodedToken
}
