"""Global Win32 hotkey listener with reload support."""
import ctypes
import ctypes.wintypes
import threading
from . import config

WM_HOTKEY  = 0x0312
MOD_ALT    = 0x0001
MOD_CTRL   = 0x0002
MOD_SHIFT  = 0x0004
MOD_WIN    = 0x0008
HOTKEY_ID_BASE = 1
MAX_HOTKEYS = 5
WM_USER_RELOAD = 0x0400 + 1
WM_USER_QUIT   = 0x0400 + 2


def _bindings_from_config():
    hotkeys = config.get('hotkeys')
    if hotkeys:
        return hotkeys[:MAX_HOTKEYS]
    return [{
        'hotkey_ctrl':  config.get('hotkey_ctrl'),
        'hotkey_alt':   config.get('hotkey_alt'),
        'hotkey_shift': config.get('hotkey_shift'),
        'hotkey_win':   config.get('hotkey_win'),
        'hotkey_key':   config.get('hotkey_key') or 'T',
    }]


def _mods_from_binding(binding):
    m = 0
    if binding.get('hotkey_ctrl'):  m |= MOD_CTRL
    if binding.get('hotkey_alt'):   m |= MOD_ALT
    if binding.get('hotkey_shift'): m |= MOD_SHIFT
    if binding.get('hotkey_win'):   m |= MOD_WIN
    return m


def _vk_from_binding(binding):
    k = (binding.get('hotkey_key') or 'T').upper()[0]
    return ord(k)


def describe_binding(binding):
    parts = []
    if binding.get('hotkey_ctrl'):  parts.append('Ctrl')
    if binding.get('hotkey_alt'):   parts.append('Alt')
    if binding.get('hotkey_shift'): parts.append('Shift')
    if binding.get('hotkey_win'):   parts.append('Win')
    parts.append((binding.get('hotkey_key') or 'T').upper())
    return ' + '.join(parts)


def describe():
    bindings = _bindings_from_config()
    primary = describe_binding(bindings[0])
    if len(bindings) <= 1:
        return primary
    return f'{primary} (+{len(bindings) - 1})'


class HotkeyListener:
    def __init__(self, on_trigger):
        self.on_trigger = on_trigger
        self.thread_id = None
        self.thread = None
        self._stop = False
        self._registered_ids = []

    def start(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def reload(self):
        if self.thread_id:
            ctypes.windll.user32.PostThreadMessageW(
                self.thread_id, WM_USER_RELOAD, 0, 0)

    def stop(self):
        self._stop = True
        if self.thread_id:
            ctypes.windll.user32.PostThreadMessageW(
                self.thread_id, WM_USER_QUIT, 0, 0)

    def _register(self):
        self._registered_ids = []
        seen = set()
        for index, binding in enumerate(_bindings_from_config()):
            signature = (
                binding.get('hotkey_ctrl'),
                binding.get('hotkey_alt'),
                binding.get('hotkey_shift'),
                binding.get('hotkey_win'),
                (binding.get('hotkey_key') or 'T').upper()[0],
            )
            if signature in seen:
                continue
            seen.add(signature)

            hotkey_id = HOTKEY_ID_BASE + index
            ok = ctypes.windll.user32.RegisterHotKey(
                None, hotkey_id, _mods_from_binding(binding), _vk_from_binding(binding))
            if ok:
                self._registered_ids.append(hotkey_id)
            else:
                print(f'[!] Не удалось зарегистрировать {describe_binding(binding)}')
        return len(self._registered_ids) > 0

    def _unregister(self):
        for hotkey_id in self._registered_ids:
            ctypes.windll.user32.UnregisterHotKey(None, hotkey_id)
        self._registered_ids = []

    def _run(self):
        self.thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        if not self._register():
            print(f'[!] Не удалось зарегистрировать {describe()}')

        msg = ctypes.wintypes.MSG()
        while not self._stop:
            ret = ctypes.windll.user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret in (0, -1):
                break
            if msg.message == WM_HOTKEY and msg.wParam in self._registered_ids:
                try:
                    self.on_trigger()
                except Exception as e:
                    print(f'[!] hotkey trigger: {e}')
            elif msg.message == WM_USER_RELOAD:
                self._unregister()
                self._register()
            elif msg.message == WM_USER_QUIT:
                break

        self._unregister()
