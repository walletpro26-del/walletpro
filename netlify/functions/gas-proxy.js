// Netlify Function: proxy requests to Google Apps Script to avoid CORS
// Forwards method, query params and JSON bodies. Returns CORS headers.
exports.handler = async (event) => {
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: ''
      };
    }

    const GAS_BASE = process.env.GAS_BASE_URL || process.env.GAS_REAL_URL || process.env.VITE_GAS_BASE_URL;
    if (!GAS_BASE) return { statusCode: 500, body: 'Missing GAS_BASE_URL environment variable' };

    const url = new URL(GAS_BASE);
    // Forward all query params
    const qs = event.queryStringParameters || {};
    Object.entries(qs).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });

    const method = event.httpMethod || 'GET';
    const headers = {};
    // Copy relevant headers
    if (event.headers) {
      if (event.headers['content-type']) headers['Content-Type'] = event.headers['content-type'];
      else if (event.headers['Content-Type']) headers['Content-Type'] = event.headers['Content-Type'];
    }

    const opts = { method, headers };
    if (method !== 'GET' && event.body) {
      // event.body is a string (possibly JSON)
      opts.body = event.body;
    }

    const fetchRes = await fetch(url.toString(), opts);
    const text = await fetchRes.text();

    return {
      statusCode: fetchRes.status || 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': fetchRes.headers.get('content-type') || 'application/json'
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: String(err) };
  }
};
