import { findOpenAQStations, getOpenAQDailyHistory } from '@/lib/openAqClient'
import { saveDailyAirQuality } from '@/lib/airQualityRepository'
import { getBangkokDate, mapOpenAQPoint, parseIngestOptions } from './airQualityIngestShared'
import type { IngestSummary } from './backfillAirQuality'

export async function runDailyAirQualityIngest(args: string[] = []): Promise<IngestSummary> {
  const options = parseIngestOptions(args)
  const yesterday = getBangkokDate(-1)
  const today = getBangkokDate()
  const stations = (await findOpenAQStations(options.lat, options.lon))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, options.stationLimit)
  let fetched = 0
  let saved = 0
  let failed = 0
  const fetchedDates: string[] = []

  for (const station of stations) {
    let points
    try {
      points = await getOpenAQDailyHistory(station.sensorId, yesterday, yesterday)
      // Some providers publish the current daily rollup before finalizing yesterday.
      if (points.length === 0) points = await getOpenAQDailyHistory(station.sensorId, today, today)
    } catch (error) {
      failed += 1
      console.error('[air-quality-daily] station fetch failed', {
        stationId: station.locationId,
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      })
      continue
    }
    fetched += points.length
    fetchedDates.push(...points.map((point) => point.date))
    for (const point of points) {
      try {
        await saveDailyAirQuality(mapOpenAQPoint(station, point))
        saved += 1
      } catch (error) {
        failed += 1
        console.error('[air-quality-daily] row save failed', {
          date: point.date,
          code: error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_ERROR',
        })
      }
    }
  }
  const summary = {
    stations: stations.length, fetched, saved, failed,
    fromDate: fetchedDates.length ? fetchedDates.reduce((earliest, date) => date < earliest ? date : earliest) : yesterday,
    toDate: fetchedDates.length ? fetchedDates.reduce((latest, date) => date > latest ? date : latest) : yesterday,
  }
  console.info('[air-quality-daily] completed', summary)
  return summary
}
