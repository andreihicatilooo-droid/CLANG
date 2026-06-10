# Screen Translator (Unified)

Electron UI + Python backend for screen-region OCR and translation.

## Architecture

```
┌─────────────────────┐     JSON-RPC/HTTP      ┌──────────────────────────┐
│  Electron (React)   │ ◄────────────────────► │  Python backend          │
│  app/electron       │   localhost:17890     │  app/python/backend       │
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

Both apps read/write the same config at `%APPDATA%\ScreenTranslator\config.json`. The Python standalone (`python screen_translator.py` from `app/python`) still works independently.

### IPC flow (translate region)

1. User presses configured hotkey → Electron opens capture overlay.
2. User selects region → Electron screenshots, crops, base64-encodes PNG.
3. Electron POSTs `translate_region` to Python backend.
4. Backend runs OCR + translation (per `engine` in config).
5. Backend returns lines + translated text (or seamless inpainted image).
6. Electron renders per-line overlay blocks or full image overlay.

## Project layout

```
app/
  electron/   # Electron + React UI
  python/     # Python backend + standalone tkinter app
```

## Development

### Prerequisites

- Node.js 20+
- Python 3.11+ with Windows OCR language packs installed
- Python venv at `app/python/venv` with deps installed

### Python backend only

```powershell
cd G:\CLANG\app\python
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python -m backend
```

Health check: `curl http://127.0.0.1:17890/health`

### Electron + Python (dev)

```powershell
# Terminal 1 — backend (optional; Electron auto-spawns it)
cd G:\CLANG\app\python
.\venv\Scripts\python -m backend

# Terminal 2 — Electron UI
cd G:\CLANG\app\electron
npm install
npm run dev
```

Electron spawns `python -m backend` from `../python` using the venv if present.

## Single installer build (Windows)

```powershell
cd G:\CLANG\app\python
.\venv\Scripts\pip install -r requirements.txt

cd G:\CLANG\app\electron
npm install
npm run build:win
```

This runs:

1. `npm run build:backend` — PyInstaller builds `app/python/dist/screen-translator-backend.exe`
2. `npm run build` — electron-vite compiles the app
3. `electron-builder --win` — NSIS installer bundles Electron + backend exe in `resources/backend/`

Output: `app/electron/dist/ScreenTranslator-1.0.0-setup.exe`

## Backend API (JSON-RPC 2.0)

POST `http://127.0.0.1:17890/rpc`

| Method | Description |
|--------|-------------|
| `health` | Server status |
| `get_config` | Read shared config |
| `save_config` | `{ updates: {...} }` |
| `get_ocr_languages` | Installed Windows OCR languages |
| `translate_region` | `{ image_base64 }` → lines, translated, seamless image |
| `oauth_start` / `oauth_poll` / `oauth_status` / `oauth_logout` | Gemini OAuth |

## Needs manual testing

- Google OAuth browser flow end-to-end from Electron Settings
- Multi-monitor capture (currently uses primary display bounds)
- Custom hotkey combos with Win/Super modifier
- Seamless inpainting on varied backgrounds
- PyInstaller one-file backend cold-start time in installed build
