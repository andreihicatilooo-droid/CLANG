"""Persistent JSON configuration for Screen Translator."""
import json
import os
import threading

APP_NAME = 'ScreenTranslator'
CONFIG_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), APP_NAME)
CONFIG_PATH = os.path.join(CONFIG_DIR, 'config.json')
TOKEN_PATH = os.path.join(CONFIG_DIR, 'google_token.json')

DEFAULTS = {
    # Hotkey
    'hotkey_ctrl':  True,
    'hotkey_alt':   True,
    'hotkey_shift': False,
    'hotkey_win':   False,
    'hotkey_key':   'T',

    # Languages
    'ocr_lang':     'en-US',        # Windows OCR BCP-47 tag
    'source_lang':  'auto',         # google/gemini source ('auto' = detect)
    'target_lang':  'ru',

    # Engine
    'engine':       'google',       # google | gemini_api | gemini_oauth
    'gemini_api_key': '',
    'gemini_model':   'gemini-2.5-flash',

    # Overlay appearance
    'overlay_alpha':       0.94,
    'overlay_font_size':   11,
    'overlay_auto_close':  30,      # seconds, 0 = never
    'overlay_theme':       'dark',  # dark | light

    # Behavior
    'copy_to_clipboard':   False,
    'start_minimized':     True,
    'show_original':       False,
    'overlay_seamless':    False,
}

_lock = threading.Lock()
_cache = None


def load():
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        os.makedirs(CONFIG_DIR, exist_ok=True)
        data = dict(DEFAULTS)
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                    data.update(json.load(f))
            except Exception:
                pass
        _cache = data
        return _cache


def save(updates=None):
    global _cache
    with _lock:
        cfg = _cache if _cache is not None else dict(DEFAULTS)
        if updates:
            cfg.update(updates)
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        _cache = cfg
        return cfg


def get(key):
    return load().get(key, DEFAULTS.get(key))


def set_(key, value):
    save({key: value})
