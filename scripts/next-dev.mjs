import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { closeSync, existsSync, openSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const startPort = Number.parseInt(process.env.PORT ?? '4200', 10)
const hostname = process.env.HOST ?? '0.0.0.0'
const binDir = path.join(rootDir, 'node_modules', '.bin')
const winNextExe = path.join(binDir, 'next.exe')
const nextBin = process.platform === 'win32' && existsSync(winNextExe)
  ? winNextExe
  : path.join(binDir, process.platform === 'win32' ? 'next.cmd' : 'next')
const nextDevLock = path.join(rootDir, '.next', 'dev', 'lock')

function hasActiveNextDevLock() {
  if (!existsSync(nextDevLock)) return false
  try {
    const fd = openSync(nextDevLock, 'r+')
    closeSync(fd)
    return false
  } catch (error) {
    return ['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)
  }
}

function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, hostname)
  })
}

async function findPort() {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await canUsePort(port)) return port
  }
  throw new Error(`No free dev port found from ${startPort} to ${startPort + 49}.`)
}

if (hasActiveNextDevLock()) {
  console.log(`Next.js dev is already running for this project. Try http://localhost:${startPort}`)
  process.exit(0)
}

const port = await findPort()
if (port !== startPort) {
  console.log(`Port ${startPort} is busy. Starting Next.js on ${port} instead.`)
}

const child = spawn(nextBin, ['dev', '--hostname', hostname, '-p', String(port)], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stderr.write(chunk)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  if (code !== 0 && output.includes('Another next dev server is already running')) {
    process.exit(0)
  }
  process.exit(code ?? 0)
})
