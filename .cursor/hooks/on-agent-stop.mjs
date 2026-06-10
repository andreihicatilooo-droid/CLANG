#!/usr/bin/env node
/**
 * Hook stop: после завершения основного агента — финальная фиксация оставшихся изменений.
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function main() {
  const input = readFileSync(0, 'utf8')
  let payload = {}
  try {
    payload = JSON.parse(input || '{}')
  } catch {
    /* empty */
  }

  const { status, loop_count = 0 } = payload
  if (status !== 'completed' || loop_count >= 3) {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  const hasChanges = (gitStatus.stdout || '').trim().length > 0

  if (!hasChanges) {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const followup =
    'Сессия завершена, но остались незакоммиченные изменения. Запусти `node scripts/commit-logical.mjs --all` — создаст логические коммиты на русском по областям (backend, electron, agents, docs). Не пушь без явной просьбы пользователя. Покажи список созданных коммитов из .cursor/commit-journal.jsonl.'

  process.stdout.write(`${JSON.stringify({ followup_message: followup })}\n`)
}

main().catch(() => {
  process.stdout.write('{}\n')
  process.exit(0)
})
