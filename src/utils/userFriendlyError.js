/**
 * userFriendlyError.js — WalletVibe Error Sanitizer
 * Transforms technical, developer-like, Firebase, or network errors into clear, polite messages for subscribers.
 */

export function formatUserFriendlyError(errOrMsg, defaultUserMsg = 'Something went wrong. Please try again.') {
  if (!errOrMsg) return defaultUserMsg

  const raw = typeof errOrMsg === 'string' ? errOrMsg : (errOrMsg?.message || String(errOrMsg))
  const clean = raw.trim()

  // Retain already-formatted friendly user messages (starting with emojis or user-facing alerts)
  if (
    clean.startsWith('⚠️') ||
    clean.startsWith('⚠') ||
    clean.startsWith('🚫') ||
    clean.startsWith('🎉') ||
    clean.startsWith('📱') ||
    clean.startsWith('Please select') ||
    clean.startsWith('Source and target')
  ) {
    return clean
  }

  const upper = clean.toUpperCase()

  // 1. Network / Timeout / Connection
  if (upper.includes('TIMEOUT') || upper.includes('UNAVAILABLE') || upper.includes('OFFLINE') || upper.includes('NETWORK_ERROR') || upper.includes('FAILED TO FETCH')) {
    return 'Unable to connect to the server. Please check your internet connection and try again.'
  }

  // 2. Auth / Security / Permission
  if (upper.includes('PERMISSION') || upper.includes('UNAUTHORIZED') || upper.includes('UNAUTHENTICATED') || upper.includes('PERMISSION-DENIED')) {
    return 'Your session could not be verified. Please log in again to continue.'
  }

  // 3. Storage / Quota Limits
  if (upper.includes('QUOTA') || upper.includes('EXCEEDED') || upper.includes('STORAGE')) {
    return 'Device storage space is full. Please clear some browser cache and try again.'
  }

  // 4. Rate Limiting / Server Busy
  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('TOO_MANY_REQUESTS') || upper.includes('RATE_LIMIT')) {
    return 'Server is busy right now. Please wait a few seconds and try again.'
  }

  // 5. Document Processing / Parsing
  if (upper.includes('PDF') || upper.includes('INVALID_ARGUMENT') || upper.includes('CORRUPT') || upper.includes('JSON')) {
    return 'Unable to process document content. Please verify your file format and try again.'
  }

  // 6. Payment & Subscriptions
  if (upper.includes('CANCEL') || upper.includes('PAYMENT_FAILED')) {
    return 'Payment was not completed. You can try again whenever you are ready.'
  }

  // 7. General fallback - polite and clean
  return defaultUserMsg || 'Something went wrong while processing your request. Please try again.'
}
