/**
 * Build Python backend sidecar via PyInstaller.
 * Run from app/electron: npm run build:backend
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pythonRoot = resolve(__dirname, '../../python')
const venvPython = join(pythonRoot, 'venv', 'Scripts', 'python.exe')
const python = existsSync(venvPython) ? venvPython : 'python'

const result = spawnSync(
  python,
  ['-m', 'PyInstaller', '--noconfirm', '--clean', 'build_backend.spec'],
  { cwd: pythonRoot, stdio: 'inherit' }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('[build-backend] output:', join(pythonRoot, 'dist', 'screen-translator-backend.exe'))
