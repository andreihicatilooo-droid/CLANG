# Screen Translator

**OCR и перевод выделенной области экрана на Windows**

Electron-интерфейс и Python-бэкенд с общим конфигом. Поддерживаются Google Translate, Gemini (OAuth), Windows OCR (winrt) и seamless-inpainting поверх исходного фона.

| | |
|---|---|
| **Платформа** | Windows 10/11 |
| **UI** | Electron 39 · React 19 · TypeScript · Tailwind |
| **Backend** | Python 3.11+ · JSON-RPC HTTP `:17890` |
| **Версия** | 1.0.0 |
| **Репозиторий** | [andreihicatilooo-droid/CLANG](https://github.com/andreihicatilooo-droid/CLANG) |

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Структура репозитория](#структура-репозитория)
- [Быстрый старт](#быстрый-старт)
- [Сборка установщика](#сборка-установщика-windows)
- [Backend API](#backend-api-json-rpc-20)
- [Документация](#документация)
- [Ручное тестирование](#ручное-тестирование)
- [Разработка](#разработка)
- [Лицензия](#лицензия)

## Возможности

- Выделение области экрана по горячей клавише
- OCR через встроенный Windows OCR (winrt)
- Перевод: Google Translate, Gemini API (OAuth)
- Режим seamless — inpainting перевода поверх фона
- Настройки, трей, overlay с построчным выводом
- Standalone tkinter-приложение (`screen_translator.py`) без Electron
- Единый NSIS-установщик с упакованным PyInstaller-бэкендом

Макеты UI: [`app/electron/design/`](app/electron/design/).

## Архитектура

```
┌─────────────────────┐     JSON-RPC/HTTP      ┌──────────────────────────┐
│  Electron (React)   │ ◄────────────────────► │  Python backend          │
│  app/electron       │   localhost:17890      │  app/python/backend      │
│                     │                        │                          │
│  • Capture overlay  │                        │  • Windows OCR (winrt)   │
│  • Settings UI      │                        │  • Google / Gemini       │
│  • Result overlay   │                        │  • OAuth                 │
│  • Tray + hotkeys   │                        │  • Inpainting (seamless) │
└─────────────────────┘                        └──────────────────────────┘
                              │
                              ▼
              %APPDATA%\ScreenTranslator\config.json
              %APPDATA%\ScreenTranslator\google_token.json
```

Обе части читают и пишут один конфиг. Standalone Python (`python screen_translator.py` из `app/python`) работает независимо от Electron.

### Поток перевода области

1. Горячая клавиша → Electron открывает overlay захвата.
2. Пользователь выделяет область → скриншот, обрезка, PNG в base64.
3. Electron вызывает `translate_region` на Python-бэкенде.
4. Backend: OCR + перевод (движок из `config.engine`).
5. Ответ: строки, перевод и/или seamless-изображение.
6. Electron рисует построчный overlay или полноэкранное изображение.

## Структура репозитория

```
CLANG/
├── app/
│   ├── electron/          # Electron + React UI
│   │   ├── src/main/      # IPC, hotkeys, overlay, backend client
│   │   ├── src/renderer/  # React-компоненты
│   │   └── design/        # HTML-макеты экранов
│   └── python/
│       ├── backend/       # JSON-RPC HTTP-сервер
│       ├── app/           # OCR, перевод, OAuth, inpainting
│       └── screen_translator.py   # Standalone tkinter
├── docs/                  # Roadmap и документация
├── scripts/               # Корневые утилиты (roadmap, коммиты)
├── AGENTS.md              # Инструкции для Cursor-агентов (CERBER)
├── CONTRIBUTING.md        # Руководство для разработчиков
└── package.json           # npm-скрипты репозитория
```

## Быстрый старт

### Требования

- **Node.js** 20+
- **Python** 3.11+ с установленными языковыми пакетами Windows OCR
- Виртуальное окружение: `app/python/venv`

### Только Python-бэкенд

```powershell
cd app/python
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python -m backend
```

Проверка: `curl http://127.0.0.1:17890/health`

### Electron + Python (разработка)

```powershell
# Терминал 1 — бэкенд (опционально; Electron поднимает его сам)
cd app/python
.\venv\Scripts\python -m backend

# Терминал 2 — UI
cd app/electron
npm install
npm run dev
```

Electron запускает `python -m backend` из `../python`, используя venv при наличии.

### Standalone Python (без Electron)

```powershell
cd app/python
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python screen_translator.py
```

## Релизы

Готовые сборки: [GitHub Releases](https://github.com/andreihicatilooo-droid/CLANG/releases).

| Версия | Файл | Платформа |
|--------|------|-----------|
| **1.0.0** | `ScreenTranslator-1.0.0-setup.exe` | Windows x64 (NSIS) |

Новый релиз: тег `v*` → GitHub Actions собирает установщик и публикует asset автоматически.

```powershell
git tag v1.0.0
git push origin v1.0.0
```

## Сборка установщика (Windows)

```powershell
cd app/python
.\venv\Scripts\pip install -r requirements.txt

cd ../electron
npm install
npm run build:win
```

Этапы:

1. `npm run build:backend` — PyInstaller → `app/python/dist/screen-translator-backend.exe`
2. `npm run build` — electron-vite
3. `electron-builder --win` — NSIS, бэкенд в `resources/backend/`

Результат: `app/electron/dist/ScreenTranslator-1.0.0-setup.exe`

## Backend API (JSON-RPC 2.0)

`POST http://127.0.0.1:17890/rpc`

| Метод | Описание |
|--------|----------|
| `health` | Статус сервера |
| `get_config` | Чтение общего конфига |
| `save_config` | `{ updates: {...} }` |
| `get_ocr_languages` | Установленные языки Windows OCR |
| `translate_region` | `{ image_base64 }` → строки, перевод, seamless |
| `oauth_start` / `oauth_poll` / `oauth_status` / `oauth_logout` | Gemini OAuth |

## Документация

| Файл | Описание |
|------|----------|
| [docs/README.md](docs/README.md) | Индекс документации |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Mindmap текущего состояния проекта |
| [AGENTS.md](AGENTS.md) | Оркестрация Cursor-агентов |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Как вносить изменения |

### Roadmap (mindmap)

```powershell
npm run roadmap        # сгенерировать docs/ROADMAP.md и docs/ROADMAP.html
npm run roadmap:view   # сгенерировать и открыть в браузере
```

> Mindmap **не отображается** во встроенном Markdown Preview — открывайте `docs/ROADMAP.html` в браузере.

## Ручное тестирование

- [ ] Google OAuth / Gemini из настроек Electron
- [ ] Захват на нескольких мониторах
- [ ] Горячие клавиши с Win/Super
- [ ] Seamless inpainting на разных фонах
- [ ] Холодный старт PyInstaller-бэкенда в установленной сборке

## Разработка

См. [CONTRIBUTING.md](CONTRIBUTING.md). Корневые npm-скрипты:

```powershell
npm run roadmap          # обновить mindmap
npm run commit:logical   # логические коммиты по областям
```

## Лицензия

[MIT](LICENSE) — см. файл `LICENSE`.
