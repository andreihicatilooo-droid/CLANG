#!/usr/bin/env node
/**
 * Генерирует docs/ROADMAP.md с Mermaid mindmap по текущему состоянию проекта.
 *
 * Использование:
 *   node scripts/generate-roadmap-mindmap.mjs
 *   npm run roadmap
 *   node scripts/generate-roadmap-mindmap.mjs --stdout
 *   node scripts/generate-roadmap-mindmap.mjs --output docs/custom.md
 *   node scripts/generate-roadmap-mindmap.mjs --open   # открыть в браузере
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT = join(ROOT, 'docs', 'ROADMAP.md')

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'venv',
  'dist',
  'out',
  'build',
  '__pycache__',
  '.git',
  '.cursor'
])

const EXCLUDE_FILE = /\.(log|toc|pyc|pyi)$/

function parseArgs(argv) {
  const args = { stdout: false, open: false, output: DEFAULT_OUTPUT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--stdout') args.stdout = true
    if (argv[i] === '--open') args.open = true
    if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[i + 1].startsWith('/') || /^[A-Za-z]:/.test(argv[i + 1])
        ? argv[i + 1]
        : join(ROOT, argv[i + 1])
      i++
    }
  }
  return args
}

function runGit(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function listFiles(dir, { ext, maxDepth = 4, depth = 0 } = {}) {
  if (!existsSync(dir) || depth > maxDepth) return []

  const entries = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }

    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue
      entries.push(...listFiles(full, { ext, maxDepth, depth: depth + 1 }))
      continue
    }

    if (EXCLUDE_FILE.test(name)) continue
    if (ext && !name.endsWith(ext)) continue
    entries.push(full)
  }

  return entries.sort((a, b) => a.localeCompare(b))
}

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, '/')
}

function stem(path) {
  return basename(path).replace(/\.[^.]+$/, '')
}

const SKIP_STEMS = new Set(['__init__', 'env.d', 'main'])

function moduleLabel(path) {
  const name = stem(path)
  if (name === 'index' && path.includes('preload')) return 'preload bridge'
  if (name.endsWith('.d')) return null
  if (SKIP_STEMS.has(name)) return null
  return name
}

/** Убирает символы, из-за которых ломается парсер mindmap: (), точки, скобки. */
function sanitizeMermaid(text) {
  return String(text)
    .replace(/[[\]{}()]/g, '')
    .replace(/…/g, '')
    .replace(/\./g, ' ')
    .replace(/:/g, ',')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 44)
}

function extractRpcMethods() {
  const handlersPath = join(ROOT, 'app/python/backend/handlers.py')
  if (!existsSync(handlersPath)) return []

  const source = readFileSync(handlersPath, 'utf8')
  const block = source.match(/METHODS\s*=\s*\{([\s\S]*?)\n\}/)
  if (!block) return []

  return [...block[1].matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]).sort()
}

function extractManualTesting() {
  const readmePath = join(ROOT, 'README.md')
  if (!existsSync(readmePath)) return []

  const readme = readFileSync(readmePath, 'utf8')
  const section = readme.match(/## Needs manual testing\s+([\s\S]*?)(?:\n## |\n$|$)/)
  if (!section) return []

  return section[1]
    .split('\n')
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter(Boolean)
}

function listPlans() {
  const plansDir = join(ROOT, '.cursor/plans')
  if (!existsSync(plansDir)) return []
  return listFiles(plansDir, { ext: '.md' }).map(rel)
}

function groupByFolder(files, basePrefix) {
  const groups = new Map()
  for (const file of files) {
    const relPath = rel(file)
    if (!relPath.startsWith(basePrefix)) continue
    const parts = relPath.slice(basePrefix.length).split('/')
    const folder = parts.length > 1 ? parts[0] : '_root'
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder).push(stem(file))
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function mindmapRoot(label) {
  const safe = sanitizeMermaid(label)
  return `  root((${safe}))`
}

function mindmapLine(depth, label) {
  const safe = sanitizeMermaid(label)
  if (!safe) return null
  return `${'  '.repeat(depth)}"${safe}"`
}

function buildMindmapTree() {
  const electronPkg = readJson(join(ROOT, 'app/electron/package.json'))
  const version = electronPkg?.version ?? '?.?.?'
  const branch = runGit('rev-parse --abbrev-ref HEAD', 'unknown')
  const commit = runGit('rev-parse --short HEAD', 'unknown')
  const dirty = runGit('status --porcelain') ? 'изменения не закоммичены' : 'чистое дерево'

  const rpcMethods = extractRpcMethods()
  const manualTests = extractManualTesting()
  const plans = listPlans()

  const electronMain = listFiles(join(ROOT, 'app/electron/src/main'), { ext: '.ts' })
  const electronRenderer = listFiles(join(ROOT, 'app/electron/src/renderer'), {
    ext: '.tsx'
  })
  const electronShared = listFiles(join(ROOT, 'app/electron/src/shared'), { ext: '.ts' })
  const electronPreload = listFiles(join(ROOT, 'app/electron/src/preload'), { ext: '.ts' })

  const pythonApp = listFiles(join(ROOT, 'app/python/app'), { ext: '.py' })
  const pythonBackend = listFiles(join(ROOT, 'app/python/backend'), { ext: '.py' })

  const lines = []
  lines.push('mindmap')
  lines.push(mindmapRoot('Screen Translator'))
  lines.push(mindmapLine(2, `version ${version}`))

  lines.push(mindmapLine(2, 'Electron UI'))
  lines.push(mindmapLine(3, 'Main process'))
  for (const f of electronMain) {
    const label = moduleLabel(f)
    const line = label && mindmapLine(4, label)
    if (line) lines.push(line)
  }

  lines.push(mindmapLine(3, 'Renderer'))
  for (const f of electronRenderer) {
    const label = moduleLabel(f)
    const line = label && mindmapLine(4, label)
    if (line) lines.push(line)
  }

  if (electronPreload.length) {
    lines.push(mindmapLine(3, 'Preload'))
    for (const f of electronPreload) {
      const label = moduleLabel(f)
      const line = label && mindmapLine(4, label)
      if (line) lines.push(line)
    }
  }

  if (electronShared.length) {
    lines.push(mindmapLine(3, 'Shared'))
    for (const f of electronShared) {
      const label = moduleLabel(f)
      const line = label && mindmapLine(4, label)
      if (line) lines.push(line)
    }
  }

  lines.push(mindmapLine(2, 'Backend JSON-RPC'))
  lines.push(mindmapLine(3, 'RPC localhost'))
  for (const method of rpcMethods) {
    const line = mindmapLine(3, method)
    if (line) lines.push(line)
  }

  lines.push(mindmapLine(2, 'Python app'))
  for (const f of pythonApp) {
    const label = moduleLabel(f)
    const line = label && mindmapLine(3, label)
    if (line) lines.push(line)
  }

  lines.push(mindmapLine(2, 'Backend package'))
  for (const f of pythonBackend) {
    const label = moduleLabel(f)
    const line = label && mindmapLine(3, label)
    if (line) lines.push(line)
  }

  lines.push(mindmapLine(2, 'Движки перевода'))
  lines.push(mindmapLine(3, 'google'))
  lines.push(mindmapLine(3, 'gemini_api'))
  lines.push(mindmapLine(3, 'gemini_oauth'))

  lines.push(mindmapLine(2, 'Standalone'))
  if (existsSync(join(ROOT, 'app/python/screen_translator.py'))) {
    lines.push(mindmapLine(3, 'screen_translator tkinter'))
  }

  lines.push(mindmapLine(2, 'Сборка'))
  lines.push(mindmapLine(3, 'PyInstaller backend exe'))
  lines.push(mindmapLine(3, 'electron-builder Windows'))
  if (existsSync(join(ROOT, 'app/python/build_backend.spec'))) {
    lines.push(mindmapLine(3, 'build_backend spec'))
  }

  lines.push(mindmapLine(2, 'Конфиг'))
  lines.push(mindmapLine(3, 'APPDATA config json'))
  lines.push(mindmapLine(3, 'google_token json OAuth'))

  if (manualTests.length) {
    lines.push(mindmapLine(2, 'Ручное тестирование'))
    for (const item of manualTests) {
      const short = item.length > 44 ? `${item.slice(0, 44).trim()}` : item
      const line = mindmapLine(3, short)
      if (line) lines.push(line)
    }
  }

  if (plans.length) {
    lines.push(mindmapLine(2, 'Планы'))
    for (const plan of plans) lines.push(mindmapLine(3, basename(plan, '.md')))
  } else {
    lines.push(mindmapLine(2, 'Планы'))
    lines.push(mindmapLine(3, 'пока нет cursor plans'))
  }

  lines.push(mindmapLine(2, 'Git'))
  lines.push(mindmapLine(3, `ветка ${branch}`))
  lines.push(mindmapLine(3, `commit ${commit}`))
  const dirtyLine = mindmapLine(3, dirty)
  if (dirtyLine) lines.push(dirtyLine)

  return lines.filter(Boolean).join('\n')
}

function buildMarkdown(mindmap) {
  const generatedAt = new Date().toISOString().slice(0, 10)
  const plans = listPlans()

  const plansTable =
    plans.length === 0
      ? '_Планов в `.cursor/plans/` пока нет. Для фичи вызовите `/planner`._\n'
      : [
          '| План | Путь |',
          '|------|------|',
          ...plans.map((p) => `| ${basename(p, '.md')} | \`${p}\` |`),
          ''
        ].join('\n')

  return `# Roadmap — Screen Translator

> Сгенерировано автоматически: **${generatedAt}**
> Команда: \`npm run roadmap\` или \`node scripts/generate-roadmap-mindmap.mjs\`

Mindmap отражает **текущее состояние** репозитория: модули, RPC-методы, сборку и открытые пункты ручного тестирования из README.

> **Как отрисовать:** встроенный Markdown Preview не рисует \`mindmap\`.
> Откройте \`docs/ROADMAP.html\` в браузере или выполните \`npm run roadmap:view\`.

## Mindmap

\`\`\`mermaid
${mindmap}
\`\`\`

## Как обновить

\`\`\`powershell
npm run roadmap
\`\`\`

После крупных изменений перегенерируйте файл и закоммитьте как \`docs(roadmap): обновить mindmap\`.

## Планы фич

${plansTable}

## Уровни документации

| Документ | Назначение |
|----------|------------|
| \`docs/ROADMAP.md\` | Снимок состояния проекта (этот файл) |
| \`.cursor/plans/*.md\` | Детальный план одной фичи |
| \`README.md\` | Архитектура и запуск |
| \`docs/ROADMAP.html\` | Интерактивный просмотр mindmap в браузере |
`
}

function buildHtml(mindmap, generatedAt) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Screen Translator — Roadmap mindmap</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #0f1117;
      color: #e8eaed;
    }
    header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #2a2d36;
    }
    h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    .meta { margin: 0.4rem 0 0; color: #9aa0a6; font-size: 0.875rem; }
    code { background: #1e2130; padding: 0.1rem 0.35rem; border-radius: 4px; }
    #diagram {
      min-height: calc(100vh - 72px);
      padding: 1.5rem;
      overflow: auto;
    }
    .mermaid { display: flex; justify-content: center; }
    #error {
      display: none;
      margin: 1rem 1.5rem;
      padding: 1rem;
      background: #3b1f1f;
      border: 1px solid #7a3030;
      border-radius: 8px;
      color: #f5c2c2;
    }
  </style>
</head>
<body>
  <header>
    <h1>Roadmap — Screen Translator</h1>
    <p class="meta">Сгенерировано: ${generatedAt} · Обновить: <code>npm run roadmap</code> · Открыть: <code>npm run roadmap:view</code></p>
  </header>
  <div id="error"></div>
  <div id="diagram"><pre class="mermaid">${mindmap}</pre></div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
    const err = document.getElementById('error')
    try {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
      const src = document.querySelector('#diagram pre.mermaid')?.textContent?.trim() || ''
      await mermaid.parse(src)
      await mermaid.run({ nodes: [document.querySelector('#diagram pre.mermaid')] })
    } catch (e) {
      err.style.display = 'block'
      err.textContent = 'Не удалось отрисовать mindmap: ' + (e?.message || e)
    }
  </script>
</body>
</html>
`
}

function openInBrowser(filePath) {
  const quoted = `"${filePath}"`
  const cmd =
    process.platform === 'win32'
      ? `start "" ${quoted}`
      : process.platform === 'darwin'
        ? `open ${quoted}`
        : `xdg-open ${quoted}`
  execSync(cmd, { stdio: 'ignore', shell: true })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const mindmap = buildMindmapTree()
  const markdown = buildMarkdown(mindmap)

  if (args.stdout) {
    process.stdout.write(markdown)
    return
  }

  const generatedAt = new Date().toISOString().slice(0, 10)
  const outDir = dirname(args.output)
  const htmlPath = join(outDir, 'ROADMAP.html')

  mkdirSync(outDir, { recursive: true })
  writeFileSync(args.output, markdown, 'utf8')
  writeFileSync(htmlPath, buildHtml(mindmap, generatedAt), 'utf8')

  console.log(`[roadmap] записано: ${relative(ROOT, args.output).replace(/\\/g, '/')}`)
  console.log(`[roadmap] просмотр:  ${relative(ROOT, htmlPath).replace(/\\/g, '/')}`)

  if (args.open) {
    openInBrowser(htmlPath)
    console.log('[roadmap] открыто в браузере')
  }
}

main()
