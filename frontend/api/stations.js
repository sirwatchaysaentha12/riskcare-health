/* global process */

const AIR4THAI_URL = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php'
const DUSTBOY_URL = 'https://open-api.cmuccdc.org/api/dustboy/stations'

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`upstream HTTP ${response.status}`)
  return response.json()
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method Not Allowed' })
  }

  const dustboyToken = process.env.DUSTBOY_API_KEY
  const [air4thai, dustboy] = await Promise.allSettled([
    fetchJson(AIR4THAI_URL),
    dustboyToken
      ? fetchJson(DUSTBOY_URL, { headers: { Authorization: `Bearer ${dustboyToken}` } })
      : Promise.resolve({ stations: [] }),
  ])

  response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  return response.status(200).json({
    air4thai: air4thai.status === 'fulfilled' ? air4thai.value : { stations: [] },
    dustboy: dustboy.status === 'fulfilled' ? dustboy.value : { stations: [] },
    errors: {
      air4thai: air4thai.status === 'rejected' ? String(air4thai.reason?.message || air4thai.reason) : null,
      dustboy: dustboy.status === 'rejected' ? String(dustboy.reason?.message || dustboy.reason) : null,
    },
  })
}
