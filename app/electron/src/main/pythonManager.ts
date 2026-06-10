import { ChildProcess, spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { join } from 'path'
import type { Readable } from 'stream'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { setBackendPort, setBackendToken, shutdownBackend, waitForBackend } from './backendClient'

const DEFAULT_PORT = 17890
const SHUTDOWN_GRACE_MS = 500

let backendProcess: ChildProcess | null = null

function isBrokenPipe(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code
  return code === 'EPIPE' || code === 'EIO'
}

/** console.* can throw EPIPE when dev terminal / parent pipe is closed. */
function safeConsole(
  fn: (...args: unknown[]) => void,
  ...args: unknown[]
): void {
  try {
    fn(...args)
  } catch (err) {
    if (!isBrokenPipe(err)) throw err
  }
}

function attachPipeErrorGuard(stream: NodeJS.WriteStream | null | undefined): void {
  if (!stream || (stream as NodeJS.WriteStream & { __pipeGuard?: boolean }).__pipeGuard) {
    return
  }
  ;(stream as NodeJS.WriteStream & { __pipeGuard?: boolean }).__pipeGuard = true
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (isBrokenPipe(err)) return
  })
}

attachPipeErrorGuard(process.stdout)
attachPipeErrorGuard(process.stderr)

function attachChildStreamGuards(stream: Readable | null | undefined): void {
  stream?.on('error', (err: NodeJS.ErrnoException) => {
    if (isBrokenPipe(err)) return
    safeConsole(console.error, '[backend] stream error:', err)
  })
}

function detachBackendStreamHandlers(proc: ChildProcess): void {
  proc.stdout?.removeAllListeners('data')
  proc.stdout?.removeAllListeners('error')
  proc.stderr?.removeAllListeners('data')
  proc.stderr?.removeAllListeners('error')
}

function resolvePythonDir(): string {
  if (is.dev) {
    return join(app.getAppPath(), '..', 'python')
  }
  return join(process.resourcesPath, 'backend')
}

function resolvePythonExecutable(pythonDir: string): { cmd: string; args: string[]; cwd: string } {
  const frozenExe = join(pythonDir, 'screen-translator-backend.exe')
  if (existsSync(frozenExe)) {
    return { cmd: frozenExe, args: [], cwd: pythonDir }
  }

  const venvPython = join(pythonDir, 'venv', 'Scripts', 'python.exe')
  if (existsSync(venvPython)) {
    return { cmd: venvPython, args: ['-m', 'backend'], cwd: pythonDir }
  }

  return { cmd: 'python', args: ['-m', 'backend'], cwd: pythonDir }
}

export async function startPythonBackend(): Promise<number> {
  if (backendProcess) {
    return DEFAULT_PORT
  }

  const pythonDir = resolvePythonDir()
  const { cmd, args, cwd } = resolvePythonExecutable(pythonDir)

  const port = DEFAULT_PORT
  const token = randomBytes(32).toString('hex')
  setBackendPort(port)
  setBackendToken(token)

  backendProcess = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      SCREEN_TRANSLATOR_BACKEND_PORT: String(port),
      SCREEN_TRANSLATOR_BACKEND_TOKEN: token,
      SCREEN_TRANSLATOR_BACKEND_QUIET: is.dev ? '0' : '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  const proc = backendProcess
  attachChildStreamGuards(proc.stdout)
  attachChildStreamGuards(proc.stderr)

  proc.stdout?.on('data', (chunk: Buffer) => {
    if (proc.exitCode !== null || proc.killed) return
    if (is.dev) safeConsole(console.log, '[backend]', chunk.toString().trim())
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    if (proc.exitCode !== null || proc.killed) return
    safeConsole(console.error, '[backend]', chunk.toString().trim())
  })

  proc.on('error', (err) => {
    safeConsole(console.error, '[backend] spawn failed:', err)
    if (backendProcess === proc) {
      backendProcess = null
    }
  })

  proc.on('exit', (code, signal) => {
    detachBackendStreamHandlers(proc)
    const detail = signal ? `signal ${signal}` : `code ${code}`
    safeConsole(console.warn, `[backend] exited with ${detail}`)
    if (backendProcess === proc) {
      backendProcess = null
    }
  })

  await waitForBackend(45_000)
  return port
}

export async function stopPythonBackend(): Promise<void> {
  const proc = backendProcess
  if (!proc) return

  try {
    await shutdownBackend()
    await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS))
  } catch {
    // Backend may already be unreachable.
  }

  detachBackendStreamHandlers(proc)

  if (proc.exitCode === null && !proc.killed) {
    proc.kill()
  }

  if (backendProcess === proc) {
    backendProcess = null
  }
}

export function isBackendRunning(): boolean {
  return backendProcess !== null
}
