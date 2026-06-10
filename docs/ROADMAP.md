# Roadmap — Screen Translator

> Сгенерировано автоматически: **2026-06-10**
> Команда: `npm run roadmap` или `node scripts/generate-roadmap-mindmap.mjs`

Mindmap отражает **текущее состояние** репозитория: модули, RPC-методы, сборку и открытые пункты ручного тестирования из README.

> **Как отрисовать:** встроенный Markdown Preview не рисует `mindmap`.
> Откройте `docs/ROADMAP.html` в браузере или выполните `npm run roadmap:view`.

## Mindmap

```mermaid
mindmap
  root((Screen Translator))
    "version 1 0 0"
    "Electron UI"
      "Main process"
        "backendClient"
        "displayCapture"
        "hotkeyManager"
        "index"
        "overlayHelpers"
        "pythonManager"
      "Renderer"
        "App"
        "CaptureScreen"
        "OverlayScreen"
        "SettingsScreen"
      "Preload"
        "preload bridge"
      "Shared"
        "config"
    "Backend JSON-RPC"
      "RPC localhost"
      "get_config"
      "get_ocr_languages"
      "health"
      "oauth_logout"
      "oauth_poll"
      "oauth_start"
      "oauth_status"
      "save_config"
      "shutdown"
      "translate_region"
    "Python app"
      "capture"
      "config"
      "hotkey"
      "inpainting"
      "oauth"
      "ocr"
      "settings_ui"
      "translators"
      "tray"
    "Backend package"
      "__main__"
      "handlers"
      "server"
    "Движки перевода"
      "google"
      "gemini_api"
      "gemini_oauth"
    "Standalone"
      "screen_translator tkinter"
    "Сборка"
      "PyInstaller backend exe"
      "electron-builder Windows"
      "build_backend spec"
    "Конфиг"
      "APPDATA config json"
      "google_token json OAuth"
    "Планы"
      "пока нет cursor plans"
    "Git"
      "ветка main"
      "commit 94cc7d5"
      "изменения не закоммичены"
```

## Как обновить

```powershell
npm run roadmap
```

После крупных изменений перегенерируйте файл и закоммитьте как `docs(roadmap): обновить mindmap`.

## Планы фич

_Планов в `.cursor/plans/` пока нет. Для фичи вызовите `/planner`._


## Уровни документации

| Документ | Назначение |
|----------|------------|
| `docs/ROADMAP.md` | Снимок состояния проекта (этот файл) |
| `.cursor/plans/*.md` | Детальный план одной фичи |
| `README.md` | Архитектура и запуск |
| `docs/ROADMAP.html` | Интерактивный просмотр mindmap в браузере |
