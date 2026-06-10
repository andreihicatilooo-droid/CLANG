# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [1.0.0] - 2026-06-11

### Добавлено

- Electron UI: захват области, overlay перевода, настройки, трей, горячие клавиши
- Python JSON-RPC backend (`localhost:17890`): OCR (winrt), Google Translate, Gemini OAuth
- Seamless inpainting — перевод поверх исходного фона
- Standalone tkinter-приложение (`screen_translator.py`)
- NSIS-установщик Windows с упакованным PyInstaller-бэкендом
- Поддержка нескольких мониторов (`displayCapture`)
- Документация: README, CONTRIBUTING, roadmap mindmap
- GitHub Actions: автосборка релиза по тегу `v*`

### Известные ограничения

- Только Windows (OCR и захват экрана)
- Ручное тестирование OAuth, Win/Super hotkeys и cold-start PyInstaller — см. README

[1.0.0]: https://github.com/andreihicatilooo-droid/CLANG/releases/tag/v1.0.0
