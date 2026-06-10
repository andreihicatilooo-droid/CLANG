# Участие в разработке

Спасибо за интерес к Screen Translator. Репозиторий — монорепо с двумя основными частями:

| Область | Путь | Стек |
|---------|------|------|
| UI | `app/electron/` | Electron 39, React 19, TypeScript |
| Backend | `app/python/` | Python 3.11+, winrt OCR, JSON-RPC |

## Требования

- Windows 10/11 (OCR и захват экрана завязаны на платформу)
- Node.js 20+
- Python 3.11+ с `app/python/venv` и зависимостями из `requirements.txt`

## Локальный запуск

```powershell
# Backend
cd app/python
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python -m backend

# Electron (отдельный терминал)
cd app/electron
npm install
npm run dev
```

Проверка бэкенда: `curl http://127.0.0.1:17890/health`

## Стиль изменений

- **Минимальный diff** — не рефакторить соседний код без необходимости
- **Соглашения файла** — именование, импорты и структура как в окружающем коде
- **Разделение областей** — Electron и Python в отдельных коммитах
- **Конфиг** — общий путь `%APPDATA%\ScreenTranslator\config.json`; не ломать совместимость standalone Python

## Коммиты

Формат сообщений:

```
тип(область): описание на русском
```

Примеры: `feat(electron): выбор монитора для захвата`, `fix(backend): таймаут OAuth poll`.

Корневой скрипт для логического разбиения:

```powershell
npm run commit:logical
```

## Cursor / CERBER

При работе через Cursor см. [AGENTS.md](AGENTS.md) — оркестрация субагентов (`electron-dev`, `python-backend`, `planner`, `verifier`).

## Документация

- [README.md](README.md) — обзор и сборка
- [docs/README.md](docs/README.md) — индекс docs
- `npm run roadmap` — актуализировать mindmap проекта

## Что проверить перед PR

1. `npm run typecheck` в `app/electron`
2. Backend стартует: `python -m backend`
3. Не коммитить `venv/`, `node_modules/`, `dist/`, `out/`, токены OAuth
4. Ручные сценарии из раздела «Ручное тестирование» в README — по возможности

## Вопросы

Issues: [GitHub Issues](https://github.com/andreihicatilooo-droid/CLANG/issues)
