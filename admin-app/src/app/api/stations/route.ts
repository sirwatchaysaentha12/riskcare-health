import { NextResponse } from 'next/server'
import { findOpenAQStations } from '@/lib/openAqClient'
import { fetchStationsPart, UPSTREAM_URLS } from '@/lib/upstreamStations'

// เรียก upstream ผ่าน helper กันล่ม: https ตรง + timeout 8s + retry 2 ครั้ง + User-Agent
// และเมื่อ upstream ล่มจะตอบจาก cache ไฟล์ล่าสุด (stale) หรือ snapshot ในโปรเจกต์ พร้อม flag ชัดเจน
const DUSTBOY_TOKEN = process.env.DUSTBOY_API_KEY || process.env.VITE_DUSTBOY_API_KEY || ''

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawLat = searchParams.get('lat')?.trim() || process.env.AIR_QUALITY_TARGET_LAT?.trim()
  const rawLon = searchParams.get('lon')?.trim() || process.env.AIR_QUALITY_TARGET_LON?.trim()
  const lat = rawLat ? Number(rawLat) : Number.NaN
  const lon = rawLon ? Number(rawLon) : Number.NaN
  const coordinatesValid = Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180

  const [air4thai, dustboy, openAq] = await Promise.allSettled([
    fetchStationsPart('air4thai', { url: UPSTREAM_URLS.air4thai }),
    DUSTBOY_TOKEN
      ? fetchStationsPart('dustboy', { url: UPSTREAM_URLS.dustboy, headers: { Authorization: `Bearer ${DUSTBOY_TOKEN}` } })
      : Promise.resolve({ data: { stations: [] }, source: 'snapshot' as const, stale: true, updatedAt: null, error: 'DUSTBOY_API_KEY missing' }),
    coordinatesValid ? findOpenAQStations(lat, lon) : Promise.resolve([]),
  ])

  const stations = openAq.status === 'fulfilled'
    ? openAq.value.map((station) => ({
      station_id: String(station.sensorId),
      location_id: station.locationId,
      station_name: station.stationName,
      latitude: station.latitude,
      longitude: station.longitude,
      provider: station.provider,
      distance_km: station.distanceKm,
    }))
    : []

  const air4thaiPart = air4thai.status === 'fulfilled'
    ? air4thai.value
    : { data: { stations: [] }, source: 'snapshot' as const, stale: true, updatedAt: null, error: String(air4thai.reason?.message || air4thai.reason) }
  const dustboyPart = dustboy.status === 'fulfilled'
    ? dustboy.value
    : { data: { stations: [] }, source: 'snapshot' as const, stale: true, updatedAt: null, error: String(dustboy.reason?.message || dustboy.reason) }

  // สถานะรวม: live = ปกติ | cache = stale | snapshot = degraded — ไม่มีทางตอบว่างเปล่าโดยไม่บอกสาเหตุ
  const degraded = air4thaiPart.source !== 'live' || dustboyPart.source !== 'live'
  const responseStatus = !coordinatesValid ? 400 : openAq.status === 'rejected' ? 502 : 200
  const result = {
    success: responseStatus === 200,
    state: !coordinatesValid
      ? 'coordinates_required'
      : openAq.status === 'rejected'
        ? 'error'
        : degraded
          ? 'degraded'
          : stations.length ? 'success' : 'empty',
    ...(!coordinatesValid ? { error: 'VALID_LAT_LON_REQUIRED' } : {}),
    ...(openAq.status === 'rejected' ? { error: 'OPENAQ_STATION_LOOKUP_FAILED' } : {}),
    stations,
    air4thai: air4thaiPart.data,
    dustboy: dustboyPart.data,
    errors: {
      air4thai: air4thaiPart.error,
      dustboy: dustboyPart.error,
    },
    meta: {
      air4thai: { source: air4thaiPart.source, stale: air4thaiPart.stale, updatedAt: air4thaiPart.updatedAt },
      dustboy: { source: dustboyPart.source, stale: dustboyPart.stale, updatedAt: dustboyPart.updatedAt },
      degraded,
    },
  }
  if (openAq.status === 'rejected') {
    console.error('[stations] OpenAQ station lookup failed', {
      code: openAq.reason instanceof Error ? openAq.reason.name : 'UNKNOWN_ERROR',
    })
  }
  return NextResponse.json(result, { status: responseStatus })
}
