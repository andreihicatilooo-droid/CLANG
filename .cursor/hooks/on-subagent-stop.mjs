#!/usr/bin/env node
/**
 * Hook subagentStop: после этапа CERBER просит агента зафиксировать логический коммит.
 * stdin: JSON { status, subagent_type, task, summary, modified_files, loop_count }
 * stdout: JSON { followup_message } | {}
 */

import { readFileSync } from 'node:fs'

const STAGE_COMMIT_MAP = {
  'electron-dev': {
    stage: 'electron-dev',
    prompt:
      'Этап electron-dev завершён. Вызови `/staged-commits` → `node scripts/commit-logical.mjs --stage electron-dev --summary "<суть>"`. Только Electron (app/electron/ или screen_translator_js/). На русском. Не пушь.'
  },
  'python-backend': {
    stage: 'python-backend',
    prompt:
      'Этап python-backend завершён. Вызови `/staged-commits` → `node scripts/commit-logical.mjs --stage python-backend --summary "<суть>"`. Только Python (app/python/ или screen_translator/). На русском. Не пушь.'
  },
  planner: {
    stage: 'planner',
    prompt:
      'Этап planner завершён. Если есть файл плана в .cursor/plans/, закоммить его: `node scripts/commit-logical.mjs --stage planner --summary "план: <кратко>"`. Иначе ответь `{}` без коммита.'
  },
  debugger: {
    stage: 'debugger',
    prompt:
      'Этап debugger завершён. Зафиксируй исправление: `node scripts/commit-logical.mjs --stage electron-dev --summary "исправление после отладки"` или `--stage python-backend` — по области изменений. Сообщение на русском, тип fix. Не пушь.'
  },
  verifier: {
    stage: null,
    prompt:
      'Этап verifier завершён. Если verifier внёс правки в файлы — закоммить их отдельным коммитом `fix(verify): ...` через `/staged-commits`. Если правок нет — переходи к финальному отчёту без коммита.'
  }
}

async function main() {
  const input = readFileSync(0, 'utf8')
  let payload
  try {
    payload = JSON.parse(input || '{}')
  } catch {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const { status, subagent_type: type, summary = '', loop_count = 0 } = payload

  if (status !== 'completed') {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  if (loop_count >= 8) {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const cfg = STAGE_COMMIT_MAP[type]
  if (!cfg) {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const summaryHint = summary ? ` Контекст: ${String(summary).slice(0, 400)}` : ''
  const followup = `${cfg.prompt}${summaryHint}`

  process.stdout.write(`${JSON.stringify({ followup_message: followup })}\n`)
}

main().catch(() => {
  process.stdout.write('{}\n')
  process.exit(0)
})
