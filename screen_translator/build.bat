@echo off
chcp 65001 >nul
setlocal

echo ============================================
echo   Screen Translator — сборка exe
echo ============================================
echo.

cd /d "%~dp0"

if exist build  rmdir /s /q build
if exist dist   rmdir /s /q dist
if exist ScreenTranslator.spec del ScreenTranslator.spec

echo Установка зависимостей...
py -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo [!] Не удалось установить зависимости
    pause
    exit /b 1
)

echo.
echo Сборка через PyInstaller...
py -m PyInstaller ^
  --noconfirm ^
  --onefile ^
  --windowed ^
  --name ScreenTranslator ^
  --collect-all pystray ^
  --collect-all PIL ^
  --collect-all deep_translator ^
  --collect-all google.auth ^
  --collect-all google_auth_oauthlib ^
  --collect-all winrt ^
  --hidden-import tkinter ^
  --paths . ^
  screen_translator.py

if errorlevel 1 (
    echo.
    echo [!] Сборка не удалась
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Готово: dist\ScreenTranslator.exe
echo   exe полностью самодостаточный.
echo ============================================
echo.
pause
