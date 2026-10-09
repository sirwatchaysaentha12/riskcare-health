import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const services = [
  {
    name: 'backend',
    cwd: path.join(root, 'admin-app'),
    args: ['admin-app/node_modules/next/dist/bin/next', 'dev', '--webpack'],
  },
  {
    name: 'frontend',
    cwd: path.join(root, 'frontend'),
    args: ['frontend/node_modules/vite/bin/vite.js', '--configLoader', 'native'],
  },
]

const children = services.map(({ name, cwd, args }) => {
  const [entry, ...commandArgs] = args
  const child = spawn(process.execPath, [path.join(root, entry), ...commandArgs], {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  child.on('error', (error) => {
    console.error(`[${name}] failed to start: ${error.message}`)
    stopAll(1)
  })
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[${name}] stopped (${signal || code}); stopping the other service`)
      stopAll(code || 1)
    }
  })
  return child
})

let stopping = false

function stopAll(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(exitCode), 500)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

console.log('Starting backend (http://localhost:3000) and frontend (http://localhost:5173)...')
