"""Persistent JSON configuration for Screen Translator."""
import json
import os
import tempfile
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
    'hotkeys':      None,
    'hotkey_modes_migrated': False,

    # Live preview during capture (Electron)
    'live_preview_enabled':     True,
    'live_preview_debounce_ms': 500,

    # Languages
    'ocr_lang':     'en-US',        # Windows OCR BCP-47 tag
    'source_lang':  'auto',         # google/gemini source ('auto' = detect)
    'target_lang':  'ru',

    # Engine (gemini_api = Google AI Studio API key)
    'engine':       'google',       # google | local_nllb | gcp_local | gemini_api | gemini_oauth | nano_banana_pro
    'gemini_api_key': '',           # https://aistudio.google.com/apikey
    'gemini_model':   'gemini-2.5-flash-lite',
    'gemini_model_auto': True,

    # GCP Cloud Run local NLLB translator
    'gcp_local_url':     '',
    'gcp_local_api_key': '',

    # Overlay appearance
    'overlay_alpha':       0.94,
    'overlay_font_size':   14,
    'overlay_auto_close':  30,      # seconds, 0 = never
    'overlay_theme':       'dark',  # dark | light

    # Behavior
    'copy_to_clipboard':   False,
    'start_minimized':     True,
    'show_original':       False,
    'overlay_seamless':    False,

    # Experimental
    'experimental_enabled':       False,
    'experimental_page_generate': True,
}

_lock = threading.Lock()
_cache = None
MAX_HOTKEYS = 5


def _legacy_hotkey(cfg):
    return {
        'hotkey_ctrl':  bool(cfg.get('hotkey_ctrl', DEFAULTS['hotkey_ctrl'])),
        'hotkey_alt':   bool(cfg.get('hotkey_alt', DEFAULTS['hotkey_alt'])),
        'hotkey_shift': bool(cfg.get('hotkey_shift', DEFAULTS['hotkey_shift'])),
        'hotkey_win':   bool(cfg.get('hotkey_win', DEFAULTS['hotkey_win'])),
        'hotkey_key':   (cfg.get('hotkey_key') or DEFAULTS['hotkey_key'])[0].upper(),
    }


def _normalize_hotkeys(cfg):
    hotkeys = cfg.get('hotkeys')
    if not hotkeys:
        hotkeys = [_legacy_hotkey(cfg)]
    else:
        normalized = []
        for item in hotkeys[:MAX_HOTKEYS]:
            if not isinstance(item, dict):
                continue
            binding = {
                'hotkey_ctrl':  bool(item.get('hotkey_ctrl', False)),
                'hotkey_alt':   bool(item.get('hotkey_alt', False)),
                'hotkey_shift': bool(item.get('hotkey_shift', False)),
                'hotkey_win':   bool(item.get('hotkey_win', False)),
                'hotkey_key':   (item.get('hotkey_key') or 'T')[0].upper(),
            }
            if item.get('mode') in ('live', 'window'):
                binding['mode'] = item['mode']
            normalized.append(binding)
        hotkeys = normalized or [_legacy_hotkey(cfg)]

    primary = hotkeys[0]
    cfg['hotkeys'] = hotkeys
    cfg['hotkey_ctrl'] = primary['hotkey_ctrl']
    cfg['hotkey_alt'] = primary['hotkey_alt']
    cfg['hotkey_shift'] = primary['hotkey_shift']
    cfg['hotkey_win'] = primary['hotkey_win']
    cfg['hotkey_key'] = primary['hotkey_key']
    return cfg


def _binding_signature(binding):
    return (
        bool(binding.get('hotkey_ctrl')),
        bool(binding.get('hotkey_alt')),
        bool(binding.get('hotkey_shift')),
        bool(binding.get('hotkey_win')),
        (binding.get('hotkey_key') or 'T')[0].upper(),
    )


def _migrate_hotkey_modes(cfg):
    """Одноразово добавляет комбинации Ctrl+Alt+A (live) и Ctrl+Alt+D (window)."""
    if cfg.get('hotkey_modes_migrated'):
        return
    hotkeys = cfg['hotkeys']
    taken = {_binding_signature(b) for b in hotkeys}
    for key, mode in (('A', 'live'), ('D', 'window')):
        binding = {
            'hotkey_ctrl':  True,
            'hotkey_alt':   True,
            'hotkey_shift': False,
            'hotkey_win':   False,
            'hotkey_key':   key,
            'mode':         mode,
        }
        signature = _binding_signature(binding)
        if signature in taken or len(hotkeys) >= MAX_HOTKEYS:
            continue
        hotkeys.append(binding)
        taken.add(signature)
    cfg['hotkey_modes_migrated'] = True


def _normalize(cfg):
    data = dict(DEFAULTS)
    data.update(cfg)
    _normalize_hotkeys(data)
    _migrate_hotkey_modes(data)
    data['live_preview_enabled'] = bool(data.get('live_preview_enabled', True))
    debounce = int(data.get('live_preview_debounce_ms', DEFAULTS['live_preview_debounce_ms']))
    data['live_preview_debounce_ms'] = max(300, min(2000, debounce))
    data['experimental_enabled'] = bool(data.get('experimental_enabled', False))
    data['experimental_page_generate'] = bool(data.get('experimental_page_generate', True))
    if data.get('engine') == 'nano_banana_pro' and not data['experimental_enabled']:
        data['engine'] = 'google'
    return data


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
        _cache = _normalize(data)
        return _cache


def save(updates=None):
    global _cache
    with _lock:
        cfg = _cache if _cache is not None else dict(DEFAULTS)
        if updates:
            cfg.update(updates)
        cfg = _normalize(cfg)
        os.makedirs(CONFIG_DIR, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=CONFIG_DIR, suffix='.json')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, CONFIG_PATH)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        _cache = cfg
        return cfg


def get(key, default=None):
    return load().get(key, DEFAULTS.get(key, default))


def set_(key, value):
    save({key: value})
