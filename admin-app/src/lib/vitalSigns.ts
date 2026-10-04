import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface VitalValue {
  value: number
  confidence: number
  unit: string
}

export interface VitalSignsSuccess {
  ok: true
  method: 'vitallens-pos'
  vitals: {
    hr?: VitalValue
    rr?: VitalValue
    spo2?: VitalValue
  }
}

export interface VitalSignsFailure {
  ok: false
  error: string
  stage: string
}

export type VitalSignsResult = VitalSignsSuccess | VitalSignsFailure

function resolveRunnerPath(): string {
  // Next.js bundles routes, so import.meta.url points at the compiled chunk —
  // resolve from the admin-app working directory instead, with the source-tree
  // location (admin-app/src/lib → admin-app/scripts) as fallback for direct node execution.
  const fromCwd = path.join(process.cwd(), 'scripts', 'vital_signs_runner.py')
  if (existsSync(fromCwd)) return fromCwd
  const libDir = path.dirname(fileURLToPath(import.meta.url)) // …/admin-app/src/lib
  return path.join(libDir, '..', '..', 'scripts', 'vital_signs_runner.py')
}

const RUNNER_PATH = resolveRunnerPath()

// Production default 150s — ปรับได้ผ่าน env VITALSIGNS_TIMEOUT_MS (ใช้สำหรับ integration test
// โดยไม่ลด timeout ของ production: test ตั้ง env เฉพาะ process ของ test เอง)
const RUNNER_TIMEOUT_MS = Number.parseInt(process.env.VITALSIGNS_TIMEOUT_MS || '', 10) || 150_000

function resolvePython(): string {
  return process.env.VITALSIGNS_PYTHON || 'python'
}

function extractLastJsonLine(text: string): Record<string, unknown> | null {
  const lines = text.trim().split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch {
        // keep scanning upwards
      }
    }
  }
  return null
}

/** ฆ่าทั้ง process tree (python + ffmpeg ลูก) — child.kill() บน Windows ฆ่าเฉพาะตัวแม่ ทิ้ง orphan ถือไฟล์ temp ค้าง */
function killProcessTree(child: ChildProcess) {
  if (!child.pid) {
    child.kill()
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    child.kill('SIGKILL')
  }
}

/**
 * Run the vitallens POS local runner on a video file.
 * Returns a typed result — never throws — so the API route can fall back
 * gracefully when vitallens fails (no face, low light, missing ffmpeg, ...).
 */
export function runVitalSigns(videoPath: string): Promise<VitalSignsResult> {
  return new Promise((resolve) => {
    const child = spawn(resolvePython(), [RUNNER_PATH, videoPath], {
      windowsHide: true,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killProcessTree(child)
      resolve({ ok: false, error: `vitallens timed out after ${RUNNER_TIMEOUT_MS}ms (process tree killed)`, stage: 'inference' })
    }, RUNNER_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, error: `failed to spawn python: ${error.message}`, stage: 'load' })
    })

    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const parsed = extractLastJsonLine(stdout)
      if (!parsed) {
        resolve({
          ok: false,
          error: (stderr || 'no output from vitallens runner').slice(-500),
          stage: 'inference',
        })
        return
      }
      resolve(parsed as unknown as VitalSignsResult)
    })
  })
}
