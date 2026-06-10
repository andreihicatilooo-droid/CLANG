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
HOTKEY_ID  = 1
WM_USER_RELOAD = 0x0400 + 1
WM_USER_QUIT   = 0x0400 + 2


def _mods_from_config():
    m = 0
    if config.get('hotkey_ctrl'):  m |= MOD_CTRL
    if config.get('hotkey_alt'):   m |= MOD_ALT
    if config.get('hotkey_shift'): m |= MOD_SHIFT
    if config.get('hotkey_win'):   m |= MOD_WIN
    return m


def _vk_from_config():
    k = (config.get('hotkey_key') or 'T').upper()[0]
    return ord(k)


def describe():
    parts = []
    if config.get('hotkey_ctrl'):  parts.append('Ctrl')
    if config.get('hotkey_alt'):   parts.append('Alt')
    if config.get('hotkey_shift'): parts.append('Shift')
    if config.get('hotkey_win'):   parts.append('Win')
    parts.append((config.get('hotkey_key') or 'T').upper())
    return ' + '.join(parts)


class HotkeyListener:
    def __init__(self, on_trigger):
        self.on_trigger = on_trigger
        self.thread_id = None
        self.thread = None
        self._stop = False

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
        return ctypes.windll.user32.RegisterHotKey(
            None, HOTKEY_ID, _mods_from_config(), _vk_from_config())

    def _unregister(self):
        ctypes.windll.user32.UnregisterHotKey(None, HOTKEY_ID)

    def _run(self):
        self.thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        if not self._register():
            print(f'[!] Не удалось зарегистрировать {describe()}')

        msg = ctypes.wintypes.MSG()
        while not self._stop:
            ret = ctypes.windll.user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret in (0, -1):
                break
            if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
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
