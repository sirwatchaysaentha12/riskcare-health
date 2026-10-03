import { NextRequest, NextResponse } from 'next/server'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runVitalSigns } from '@/lib/vitalSigns'

export const runtime = 'nodejs'

const MAX_VIDEO_BYTES = 60 * 1024 * 1024 // 60 MB — ~60s of 720p webm at typical bitrates

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * POST multipart/form-data { video: File }
 * Runs vitallens rPPG (local POS mode, no API key) on the uploaded video and
 * returns estimated vital signs. On failure returns ok:false so the frontend
 * can fall back to MediaPipe RR + questionnaire without crashing.
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null
  try {
    const formData = await request.formData()
    const video = formData.get('video')
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'missing "video" file in multipart form data' },
        { status: 400, headers: CORS_HEADERS },
      )
    }
    if (video.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { ok: false, error: `video too large (${(video.size / 1024 / 1024).toFixed(1)} MB, max 60 MB)` },
        { status: 413, headers: CORS_HEADERS },
      )
    }

    tempDir = await mkdtemp(path.join(tmpdir(), 'vital-signs-'))
    const extension = path.extname(video.name || '') || '.webm'
    const videoPath = path.join(tempDir, `upload${extension}`)
    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()))

    const result = await runVitalSigns(videoPath)

    if (!result.ok) {
      // Soft failure — the frontend falls back to MediaPipe RR + questionnaire
      return NextResponse.json(result, { status: 200, headers: CORS_HEADERS })
    }
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unexpected error', stage: 'route' },
      { status: 500, headers: CORS_HEADERS },
    )
  } finally {
    if (tempDir) {
      rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
