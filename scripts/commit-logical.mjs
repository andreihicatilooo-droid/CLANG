#!/usr/bin/env node
/**
 * Создаёт логические коммиты по областям репозитория.
 * Использование:
 *   node scripts/commit-logical.mjs --stage electron-dev --summary "обновлён overlay"
 *   node scripts/commit-logical.mjs --all
 *   node scripts/commit-logical.mjs --dry-run --all
 */

import { execSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JOURNAL = join(ROOT, '.cursor', 'commit-journal.jsonl')

const EXCLUDE_PATTERNS = [
  /^app\/python\/venv\//,
  /^app\/electron\/node_modules\//,
  /^app\/electron\/out\//,
  /^app\/electron\/dist\//,
  /^app\/python\/build\//,
  /^app\/python\/dist\//,
  /\/__pycache__\//,
  /\.log$/,
  /^\.cursor\/debug/,
  /^debug-.*\.log$/
]

const STAGE_GROUPS = {
  'electron-dev': {
    label: 'Electron UI',
    type: 'feat',
    scope: 'electron',
    match: (p) => p.startsWith('app/electron/') || p.startsWith('screen_translator_js/')
  },
  'python-backend': {
    label: 'Python backend',
    type: 'feat',
    scope: 'backend',
    match: (p) =>
      p.startsWith('app/python/backend/') ||
      p.startsWith('app/python/app/') ||
      p.startsWith('screen_translator/backend/') ||
      p.startsWith('screen_translator/app/') ||
      [
        'app/python/requirements.txt',
        'app/python/build_backend.spec',
        'app/python/ScreenTranslator.spec',
        'app/python/build.bat',
        'app/python/screen_translator.py',
        'app/python/run_backend.py',
        'screen_translator/requirements.txt',
        'screen_translator/build_backend.spec',
        'screen_translator/ScreenTranslator.spec',
        'screen_translator/build.bat',
        'screen_translator/screen_translator.py'
      ].includes(p)
  },
  planner: {
    label: 'План разработки',
    type: 'docs',
    scope: 'план',
    match: (p) => p.startsWith('.cursor/plans/')
  },
  agents: {
    label: 'Конфигурация агентов',
    type: 'chore',
    scope: 'agents',
    match: (p) =>
      p.startsWith('.cursor/agents/') ||
      p.startsWith('.cursor/rules/') ||
      p.startsWith('.cursor/hooks/') ||
      p.startsWith('.cursor/skills/') ||
      p === '.cursor/hooks.json' ||
      p === 'AGENTS.md'
  },
  docs: {
    label: 'Документация',
    type: 'docs',
    scope: null,
    match: (p) => p === 'README.md' || p.startsWith('docs/')
  },
  scripts: {
    label: 'Скрипты сборки',
    type: 'chore',
    scope: 'scripts',
    match: (p) => p.startsWith('scripts/')
  }
}

const DEFAULT_ORDER = [
  'python-backend',
  'electron-dev',
  'planner',
  'agents',
  'scripts',
  'docs'
]

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim()
}

function runGit(args, { raw = false } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed: ${err}`)
  }
  // raw: не обрезать вывод — porcelain-строки начинаются со значимого пробела
  return raw ? (r.stdout || '') : (r.stdout || '').trim()
}

function parseArgs(argv) {
  const out = { stage: null, summary: '', all: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--stage') out.stage = argv[++i]
    else if (a === '--summary') out.summary = argv[++i] || ''
    else if (a === '--all') out.all = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help') out.help = true
  }
  return out
}

function isExcluded(path) {
  const p = path.replace(/\\/g, '/')
  return EXCLUDE_PATTERNS.some((re) => re.test(p))
}

function listChangedFiles() {
  const files = new Set()

  const porcelain = runGit(['status', '--porcelain'], { raw: true })
    .split('\n')
    .filter((line) => line.trim().length > 0)
  for (const line of porcelain) {
    const path = line.slice(3).trim().replace(/\\/g, '/')
    if (path.includes(' -> ')) {
      const [, renamed] = path.split(' -> ')
      if (!isExcluded(renamed)) files.add(renamed)
      continue
    }
    if (!isExcluded(path)) files.add(path)
  }

  // Раскрыть неотслеживаемые файлы внутри каталогов (git status даёт только `?? dir/`)
  try {
    const untracked = runGit(['ls-files', '-o', '--exclude-standard'])
      .split('\n')
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, '/'))
    for (const p of untracked) {
      if (!isExcluded(p)) files.add(p)
    }
  } catch {
    /* ignore */
  }

  return [...files]
}

function fileBelongsToStage(file, stageKey) {
  const cfg = STAGE_GROUPS[stageKey]
  if (!cfg) return false
  const p = file.replace(/\\/g, '/')
  if (cfg.match(p)) return true
  // Каталог из git status: `?? screen_translator_js/`
  const dir = p.endsWith('/') ? p : `${p}/`
  return cfg.match(dir)
}

function groupFiles(files, stageFilter = null) {
  const groups = new Map()
  const other = []

  for (const file of files) {
    let placed = false
    for (const key of Object.keys(STAGE_GROUPS)) {
      if (stageFilter && key !== stageFilter) continue
      if (fileBelongsToStage(file, key)) {
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(file)
        placed = true
        break
      }
    }
    if (!placed && !stageFilter) other.push(file)
  }

  if (other.length && !stageFilter) groups.set('other', other)
  return groups
}

function inferVerb(files, stageKey) {
  if (stageKey === 'planner' || stageKey === 'docs') return 'docs'
  const text = runGit(['diff', '--cached', '--name-only', ...files.length ? ['--', ...files] : []]).toLowerCase()
  const unstaged = files.some((f) => {
    try {
      const d = runGit(['diff', '--', f]).toLowerCase()
      return d.includes('fix') || d.includes('bug')
    } catch {
      return false
    }
  })
  if (text.includes('fix') || stageKey === 'debugger') return 'fix'
  if (unstaged) return 'fix'
  return STAGE_GROUPS[stageKey]?.type || 'chore'
}

function buildMessage(stageKey, files, summary, verbOverride) {
  const cfg = STAGE_GROUPS[stageKey]
  const verb = verbOverride || (cfg ? inferVerb(files, stageKey) : 'chore')

  if (summary) {
    const scope = cfg?.scope ? `(${cfg.scope})` : ''
    return `${verb}${scope}: ${summary}`
  }

  const labels = {
    'electron-dev': 'обновить Electron UI',
    'python-backend': 'обновить Python backend',
    planner: 'добавить план разработки',
    agents: 'обновить конфигурацию агентов',
    scripts: 'обновить скрипты',
    docs: 'обновить документацию',
    other: 'прочие изменения'
  }

  const scope = cfg?.scope ? `(${cfg.scope})` : ''
  const detail = files.length === 1 ? ` — ${files[0]}` : ` — ${files.length} файлов`
  return `${verb}${scope}: ${labels[stageKey] || 'изменения'}${detail}`
}

function appendJournal(entry) {
  const dir = dirname(JOURNAL)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(JOURNAL, `${JSON.stringify(entry)}\n`, 'utf8')
}

function expandAddPaths(files) {
  const paths = new Set()
  for (const f of files) {
    const p = f.replace(/\\/g, '/')
    paths.add(p.endsWith('/') ? p.slice(0, -1) : p)
  }
  return [...paths]
}

function commitGroup(stageKey, files, summary, dryRun, verbOverride) {
  if (!files.length) return null

  const message = buildMessage(stageKey, files, summary, verbOverride)
  const addPaths = expandAddPaths(files)

  if (dryRun) {
    console.log(`[dry-run] ${message}`)
    console.log(`  пути: ${addPaths.join(', ')}`)
    return { message, files: addPaths, sha: null }
  }

  runGit(['add', '--', ...addPaths])

  const staged = runGit(['diff', '--cached', '--name-only'])
  if (!staged) {
    console.log(`[skip] нет изменений для этапа ${stageKey}`)
    return null
  }

  runGit(['commit', '-m', message])
  const sha = runGit(['rev-parse', '--short', 'HEAD'])

  const entry = {
    timestamp: new Date().toISOString(),
    stage: stageKey,
    sha,
    message,
    files
  }
  appendJournal(entry)

  console.log(`[commit ${sha}] ${message}`)
  return entry
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(`Использование:
  node scripts/commit-logical.mjs --stage <этап> [--summary "текст"]
  node scripts/commit-logical.mjs --all
  node scripts/commit-logical.mjs --dry-run --all

Этапы: ${Object.keys(STAGE_GROUPS).join(', ')}, other`)
    process.exit(0)
  }

  const changed = listChangedFiles()
  if (!changed.length) {
    console.log('[ok] нет незакоммиченных изменений')
    process.exit(0)
  }

  const results = []

  if (args.stage) {
    const groups = groupFiles(changed, args.stage)
    const files = groups.get(args.stage) || []
    const verb = args.stage === 'debugger' ? 'fix' : undefined
    const r = commitGroup(args.stage, files, args.summary, args.dryRun, verb)
    if (r) results.push(r)
  } else if (args.all) {
    const groups = groupFiles(changed)
    const order = [...DEFAULT_ORDER, 'other']
    for (const key of order) {
      const files = groups.get(key)
      if (!files?.length) continue
      const r = commitGroup(key, files, '', args.dryRun)
      if (r) results.push(r)
    }
  } else {
    console.error('Укажите --stage <этап> или --all')
    process.exit(1)
  }

  if (!results.length) {
    console.log('[ok] нечего коммитить для указанного этапа')
  } else if (!args.dryRun) {
    console.log(`\nЗафиксировано коммитов: ${results.length}. Журнал: ${relative(ROOT, JOURNAL)}`)
  }
}

main()
