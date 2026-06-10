# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Screen Translator backend sidecar."""

import os

block_cipher = None
root = os.path.abspath('.')

a = Analysis(
    ['run_backend.py'],
    pathex=[root],
    binaries=[],
    datas=[],
    hiddenimports=[
        'app.config',
        'app.ocr',
        'app.translators',
        'app.inpainting',
        'app.oauth',
        'app.api_validation',
        'backend',
        'backend.handlers',
        'backend.server',
        'PIL',
        'cv2',
        'numpy',
        'deep_translator',
        'google.auth',
        'google.oauth2',
        'google_auth_oauthlib',
        'winrt',
        'winrt.windows.media.ocr',
        'winrt.windows.graphics.imaging',
        'winrt.windows.storage.streams',
        'winrt.windows.globalization',
        'winrt.windows.foundation',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'pystray'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='screen-translator-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
