#!/usr/bin/env node
/**
 * postToolUse (Task): напоминание о коммите после делегирования субагенту.
 */

import { readFileSync } from 'node:fs'

const COMMIT_AGENTS = new Set(['electron-dev', 'python-backend', 'debugger', 'planner'])

async function main() {
  const input = readFileSync(0, 'utf8')
  let payload = {}
  try {
    payload = JSON.parse(input || '{}')
  } catch {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const toolInput = payload.tool_input || payload.input || {}
  const subagentType = toolInput.subagent_type || ''

  if (!COMMIT_AGENTS.has(subagentType)) {
    process.stdout.write('{}\n')
    process.exit(0)
  }

  const context =
    'После завершения Task-субагента будет автоматически запрошен логический коммит на русском (hook subagentStop). Не коммить вручную до завершения этапа, если не просят иначе.'

  process.stdout.write(`${JSON.stringify({ additional_context: context })}\n`)
}

main().catch(() => {
  process.stdout.write('{}\n')
  process.exit(0)
})
