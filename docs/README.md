# Документация Screen Translator

## Файлы

| Документ | Назначение |
|----------|------------|
| [ROADMAP.md](ROADMAP.md) | Mermaid mindmap: модули, RPC, сборка, открытые пункты тестирования |
| [ROADMAP.html](ROADMAP.html) | Тот же mindmap, отрисованный в браузере (Mermaid.js) |

## Обновление roadmap

Из корня репозитория:

```powershell
npm run roadmap        # перегенерировать ROADMAP.md и ROADMAP.html
npm run roadmap:view   # перегенерировать и открыть HTML
```

Источник: `scripts/generate-roadmap-mindmap.mjs` — сканирует `app/electron` и `app/python`, читает RPC-методы и версию из `package.json`.

## Связанные материалы

- [README.md](../README.md) — установка, архитектура, API
- [CONTRIBUTING.md](../CONTRIBUTING.md) — разработка
- [AGENTS.md](../AGENTS.md) — Cursor-агенты
- [app/electron/design/](../app/electron/design/) — HTML-макеты UI
