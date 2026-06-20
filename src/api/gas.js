const VITE_GAS_BASE_URL = import.meta.env.VITE_GAS_BASE_URL

export async function gasFetch(action, payload) {
  if (!VITE_GAS_BASE_URL) {
    throw new Error('VITE_GAS_BASE_URL is not set')
  }

  const url = VITE_GAS_BASE_URL

  const body = { action }
  if (payload && typeof payload === 'object') {
    if (action === 'verifyUser') {
      if (payload.email != null) body.email = payload.email
      if (payload.password != null) body.password = payload.password
    } else {
      body.data = payload
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API request failed (${res.status}): ${text || res.statusText}`)
  }

  const json = await res.json()
  return json
}
