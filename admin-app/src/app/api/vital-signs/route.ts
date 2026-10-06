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

// ---- Content-type detection จาก magic bytes (ไม่เชื่อชื่อไฟล์/MIME ที่ client อ้าง) ----
// webm/matroska เริ่มด้วย EBML header 1A 45 DF A3; mp4 มี "ftyp" ที่ offset 4
function detectVideoContainer(bytes: Buffer) {
  if (bytes.length >= 4 &&
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm'
  }
  if (bytes.length >= 8 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'mp4'
  }
  return null
}

/** ปกปิด local path / ข้อมูลสภาพแวดล้อม ออกจาก error ก่อนส่งกลับ client */
function redactError(message: string) {
  if (typeof message !== 'string') return 'unexpected error'
  return message
    .replace(/[A-Za-z]:\\[^\s'",;)]*/g, '[path]')
    .replace(/[A-Za-z]:\/[^\s'",;)]*/g, '[path]')
    .replace(/(\/tmp|\/var|\/home|\/Users)\/[^\s'",;)]*/g, '[path]')
    .slice(0, 300)
}

/**
 * POST multipart/form-data { video: File }
 * Runs vitallens rPPG (local POS mode, no API key) on the uploaded video and
 * returns estimated vital signs. On failure returns ok:false so the frontend
 * can fall back to MediaPipe RR + questionnaire without crashing.
 *
 * Security: container type detected from file content (magic bytes), temporary
 * filename generated server-side (client filename never used), size limit
 * enforced, duration limit + decode validation in the runner, temp directory
 * removed in finally, error messages redacted (no local paths).
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null
  try {
    // เช็คขนาดจาก header ก่อน parse — เลี่ยงการ parse body ยักษ์ (multipart overhead ~1MB)
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_VIDEO_BYTES + 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: `video too large (${(contentLength / 1024 / 1024).toFixed(1)} MB, max 60 MB)` },
        { status: 413, headers: CORS_HEADERS },
      )
    }
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

    const buffer = Buffer.from(await video.arrayBuffer())
    const container = detectVideoContainer(buffer)
    if (!container) {
      return NextResponse.json(
        { ok: false, error: 'unsupported video content (expected webm/mp4)' },
        { status: 415, headers: CORS_HEADERS },
      )
    }

    // ชื่อไฟล์ชั่วคราวสร้างโดย server เท่านั้น — ไม่ใช้ชื่อไฟล์จาก client (กัน path traversal)
    tempDir = await mkdtemp(path.join(tmpdir(), 'vital-signs-'))
    const videoPath = path.join(tempDir, `upload.${container}`)
    await writeFile(videoPath, buffer)

    const result = await runVitalSigns(videoPath)

    if (!result.ok) {
      // Soft failure — the frontend falls back to MediaPipe RR + questionnaire
      return NextResponse.json({ ...result, error: redactError(result.error) }, { status: 200, headers: CORS_HEADERS })
    }
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS })
  } catch (error) {
    // ห้ามส่ง stack trace / local path / env ออกไป
    return NextResponse.json(
      { ok: false, error: redactError(error instanceof Error ? error.message : 'unexpected error'), stage: 'route' },
      { status: 500, headers: CORS_HEADERS },
    )
  } finally {
    if (tempDir) {
      rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}
