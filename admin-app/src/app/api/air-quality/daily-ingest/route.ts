import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runDailyAirQualityIngest } from '@/scripts/dailyIngest'

export const runtime = 'nodejs'

function equalSecret(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.AIR_QUALITY_CRON_SECRET?.trim()
  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: 'CRON_NOT_CONFIGURED' }, { status: 503 })
  }
  const authorization = request.headers.get('authorization') || ''
  const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!providedSecret || !equalSecret(providedSecret, expectedSecret)) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }
  try {
    const result = await runDailyAirQualityIngest()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'DAILY_INGEST_FAILED'
    console.error('[air-quality-daily] run failed', { code })
    return NextResponse.json({ success: false, error: code }, { status: 500 })
  }
}
