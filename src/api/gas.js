const VITE_GAS_BASE_URL = import.meta.env.VITE_GAS_BASE_URL

export async function gasFetch(action, payload) {
  if (!VITE_GAS_BASE_URL) {
    throw new Error('VITE_GAS_BASE_URL is not set')
  }

  const url = new URL(VITE_GAS_BASE_URL)
  url.searchParams.set('action', action)

  // payload is sent as query param `data` (JSON) for actions that need it
  if (payload && typeof payload === 'object') {
    // For verifyUser we want simple params: email/password
    if (action === 'verifyUser') {
      if (payload.email != null) url.searchParams.set('email', payload.email)
      if (payload.password != null) url.searchParams.set('password', payload.password)
    } else {
      url.searchParams.set('data', JSON.stringify(payload))
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API request failed (${res.status}): ${text || res.statusText}`)
  }

  const json = await res.json()
  return json
}
