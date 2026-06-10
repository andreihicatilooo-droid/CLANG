import { ChildProcess, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { setBackendPort, waitForBackend } from './backendClient'

const DEFAULT_PORT = 17890

let backendProcess: ChildProcess | null = null

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
  setBackendPort(port)

  backendProcess = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      SCREEN_TRANSLATOR_BACKEND_PORT: String(port),
      SCREEN_TRANSLATOR_BACKEND_QUIET: is.dev ? '0' : '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  backendProcess.stdout?.on('data', (chunk: Buffer) => {
    if (is.dev) console.log('[backend]', chunk.toString().trim())
  })

  backendProcess.stderr?.on('data', (chunk: Buffer) => {
    console.error('[backend]', chunk.toString().trim())
  })

  backendProcess.on('exit', (code) => {
    console.warn(`[backend] exited with code ${code}`)
    backendProcess = null
  })

  await waitForBackend(45_000)
  return port
}

export function stopPythonBackend(): void {
  if (!backendProcess) return
  backendProcess.kill()
  backendProcess = null
}
