import test from 'node:test'
import assert from 'node:assert/strict'
import { haversineKm, isValidLatLng, selectNearestStation } from '../src/lib/openAQStations.ts'

const station = (overrides) => ({
  locationId: 1, sensorId: 11, stationName: 'S', provider: 'Other Provider', distanceKm: 10, latitude: 13.7, longitude: 100.5, ...overrides,
})

test('selectNearestStation prefers the nearest Air4Thai station even when farther away', () => {
  const chosen = selectNearestStation([
    station({ stationName: 'Foreign', distanceKm: 3, provider: 'Some Provider' }),
    station({ stationName: 'A4T-2', distanceKm: 12, provider: 'Air4Thai' }),
    station({ stationName: 'A4T-1', distanceKm: 8, provider: 'Air4Thai' }),
  ])
  assert.equal(chosen?.stationName, 'A4T-1')
})

test('selectNearestStation falls back to the nearest PM2.5 station when no Air4Thai exists', () => {
  const chosen = selectNearestStation([station({ distanceKm: 9 }), station({ distanceKm: 4 })])
  assert.equal(chosen?.distanceKm, 4)
})

test('selectNearestStation returns null when there is no valid candidate', () => {
  assert.equal(selectNearestStation([]), null)
  assert.equal(selectNearestStation([station({ distanceKm: NaN })]), null)
})

test('isValidLatLng rejects out-of-range or non-numeric coordinates', () => {
  assert.ok(isValidLatLng(13.7563, 100.5018))
  assert.ok(!isValidLatLng(91, 100))
  assert.ok(!isValidLatLng(13, 181))
  assert.ok(!isValidLatLng(NaN, 100))
  assert.ok(!isValidLatLng(-91, 0))
  assert.ok(!isValidLatLng(13, -181))
})

test('haversineKm matches the known Bangkok–Chiang Mai distance (~580 km)', () => {
  const distance = haversineKm(13.7563, 100.5018, 18.7883, 98.9853)
  assert.ok(distance > 560 && distance < 600, `actual ${distance}`)
})
