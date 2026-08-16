import { NextResponse } from 'next/server'

const AIR4THAI_URL = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php'
const DUSTBOY_URL = 'https://open-api.cmuccdc.org/api/dustboy/stations'

async function fetchJson(url: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`)
  return response.json()
}

export async function GET() {
  const token = process.env.DUSTBOY_API_KEY || process.env.VITE_DUSTBOY_API_KEY
  const [air4thai, dustboy] = await Promise.allSettled([
    fetchJson(AIR4THAI_URL),
    token ? fetchJson(DUSTBOY_URL, { Authorization: `Bearer ${token}` }) : Promise.resolve({ stations: [] }),
  ])

  return NextResponse.json({
    air4thai: air4thai.status === 'fulfilled' ? air4thai.value : { stations: [] },
    dustboy: dustboy.status === 'fulfilled' ? dustboy.value : { stations: [] },
    errors: {
      air4thai: air4thai.status === 'rejected' ? String(air4thai.reason?.message || air4thai.reason) : null,
      dustboy: dustboy.status === 'rejected' ? String(dustboy.reason?.message || dustboy.reason) : null,
    },
  })
}
