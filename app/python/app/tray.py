"""System tray icon with menu."""
import threading
from PIL import Image, ImageDraw, ImageFont
import pystray


def _make_icon():
    img = Image.new('RGBA', (64, 64), (30, 30, 46, 255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((4, 4, 60, 60), radius=12,
                        fill=(30, 30, 46, 255), outline=(137, 220, 235, 255), width=2)
    try:
        font = ImageFont.truetype('seguibl.ttf', 38)
    except Exception:
        font = ImageFont.load_default()
    d.text((20, 8), 'T', fill=(137, 220, 235, 255), font=font)
    return img


class Tray:
    def __init__(self, on_capture, on_settings, on_quit, hotkey_str):
        self.on_capture  = on_capture
        self.on_settings = on_settings
        self.on_quit     = on_quit
        self.hotkey_str  = hotkey_str
        self.icon = None

    def _build_menu(self):
        return pystray.Menu(
            pystray.MenuItem(f'Перевести область  ({self.hotkey_str})',
                             lambda: self.on_capture(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem('Настройки…',          lambda: self.on_settings()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem('Выход',               lambda: self._quit()),
        )

    def _quit(self):
        if self.icon:
            self.icon.stop()
        self.on_quit()

    def update_hotkey(self, hotkey_str):
        self.hotkey_str = hotkey_str
        if self.icon:
            self.icon.menu = self._build_menu()
            self.icon.update_menu()

    def start(self):
        self.icon = pystray.Icon(
            'screen_translator', _make_icon(),
            'Screen Translator', self._build_menu())
        threading.Thread(target=self.icon.run, daemon=True).start()
