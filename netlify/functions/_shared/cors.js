/**
 * Netlify Function CORS response headers helper
 */
export const corsHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function handleOptions() {
  return {
    statusCode: 204,
    headers: corsHeaders,
    body: '',
  }
}
