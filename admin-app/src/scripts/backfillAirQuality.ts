import { findOpenAQStations, getOpenAQDailyHistory } from '@/lib/openAqClient'
import { saveDailyAirQuality } from '@/lib/airQualityRepository'
import { getBangkokDate, mapOpenAQPoint, parseIngestOptions, shiftDate } from './airQualityIngestShared'

export interface IngestSummary {
  stations: number
  fetched: number
  saved: number
  failed: number
  fromDate: string
  toDate: string
}

export async function runAirQualityBackfill(args: string[] = []): Promise<IngestSummary> {
  const options = parseIngestOptions(args)
  const toDate = getBangkokDate(-1)
  const fromDate = options.from ?? shiftDate(toDate, -(options.days - 1))
  const stations = (await findOpenAQStations(options.lat, options.lon))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, options.stationLimit)
  let fetched = 0
  let saved = 0
  let failed = 0

  for (const station of stations) {
    let points
    try {
      points = await getOpenAQDailyHistory(station.sensorId, fromDate, toDate)
    } catch (error) {
      failed += 1
      console.error('[air-quality-backfill] station fetch failed', {
        stationId: station.locationId,
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      })
      continue
    }
    fetched += points.length
    for (const point of points) {
      try {
        await saveDailyAirQuality(mapOpenAQPoint(station, point))
        saved += 1
      } catch (error) {
        failed += 1
        console.error('[air-quality-backfill] row save failed', {
          date: point.date,
          code: error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_ERROR',
        })
      }
    }
  }
  const summary = { stations: stations.length, fetched, saved, failed, fromDate, toDate }
  console.info('[air-quality-backfill] completed', summary)
  return summary
}
