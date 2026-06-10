---
name: staged-commits
description: Создаёт логические git-коммиты на русском после этапов разработки. Используй после electron-dev, python-backend, planner, debugger или по запросу «зафиксируй изменения».
---

# Логические коммиты (staged-commits)

Автоматическая фиксация изменений по **логическим частям** репозитория. Сообщения коммитов — **на русском**.

## Когда использовать

- После завершения субагента `electron-dev`, `python-backend`, `planner`, `debugger`
- По hook `subagentStop` / `stop`
- Когда пользователь просит «зафиксируй», «закоммить этап»

## Этапы и области

| Этап | Пути | Префикс сообщения |
|------|------|-------------------|
| `python-backend` | `app/python/`, `screen_translator/` | `feat(backend):` / `fix(backend):` |
| `electron-dev` | `app/electron/`, `screen_translator_js/` | `feat(electron):` / `fix(electron):` |
| `planner` | `.cursor/plans/` | `docs(план):` |
| `agents` | `.cursor/agents/`, rules, hooks, skills, `AGENTS.md` | `chore(agents):` |
| `scripts` | `scripts/` | `chore(scripts):` |
| `docs` | `README.md` | `docs:` |

## Команды

```powershell
# Один этап (после субагента)
node scripts/commit-logical.mjs --stage electron-dev --summary "добавить выбор языка OCR в Settings"

# Все оставшиеся изменения по областям
node scripts/commit-logical.mjs --all

# Предпросмотр без коммита
node scripts/commit-logical.mjs --dry-run --all
```

## Правила

1. **Один логический коммит = одна область** — не смешивать Electron и Python в одном коммите
2. **Сообщение на русском**, формат: `тип(область): краткое описание`
3. **Типы**: `feat`, `fix`, `docs`, `chore`, `refactor`
4. **Не коммить**: `venv/`, `node_modules/`, `out/`, `dist/`, `*.log`, `__pycache__`
5. **Не пушить** без явной просьбы пользователя
6. После коммита — проверить `.cursor/commit-journal.jsonl` (журнал фиксации)

## Примеры сообщений

```
feat(electron): добавить IPC для списка языков OCR
feat(backend): реализовать RPC get_ocr_languages
docs(план): план интеграции OAuth в Settings
fix(electron): исправить масштабирование overlay на HiDPI
chore(agents): добавить хуки автокоммитов после этапов
```

## Планировщик (planner)

Перед коммитом плана сохрани вывод в файл:

```
.cursor/plans/<дата>-<краткое-имя>.md
```

Затем:

```powershell
node scripts/commit-logical.mjs --stage planner --summary "план интеграции OAuth"
```

## Если нечего коммитить

Сообщи пользователю: «Изменений для этапа X нет» — не создавай пустой коммит.
