import nextEnv from '@next/env'

try {
  nextEnv.loadEnvConfig(process.cwd())
  const command = process.argv[2]
  if (command === 'backfill') {
    const { runAirQualityBackfill } = await import('../src/scripts/backfillAirQuality.ts')
    await runAirQualityBackfill(process.argv.slice(3))
  } else if (command === 'daily') {
    const { runDailyAirQualityIngest } = await import('../src/scripts/dailyIngest.ts')
    await runDailyAirQualityIngest(process.argv.slice(3))
  } else {
    throw new Error('Use command "backfill" or "daily"')
  }
} catch (error) {
  const code = error instanceof Error ? error.message.split(':')[0] : 'AIR_QUALITY_INGEST_FAILED'
  console.error('[air-quality-ingest] failed', { code })
  process.exitCode = 1
}
