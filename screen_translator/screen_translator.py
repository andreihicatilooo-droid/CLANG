"""Screen Translator — entry point."""
import sys
import os
import tkinter as tk

# Ensure local imports work when bundled by PyInstaller
if getattr(sys, 'frozen', False):
    sys.path.insert(0, os.path.dirname(sys.executable))

from app import config, hotkey, capture, tray, settings_ui


def main():
    config.load()

    root = tk.Tk()
    root.withdraw()
    root.title('Screen Translator')


    listener = None
    tray_obj = None

    def trigger():
        root.after(0, lambda: capture.RegionSelector(root, on_region))

    def on_region(x1, y1, x2, y2, img):
        capture.process(root, x1, y1, x2, y2, img)

    def open_settings():
        settings_ui.open_settings(root, on_settings_saved)

    def on_settings_saved():
        listener.reload()
        if tray_obj:
            tray_obj.update_hotkey(hotkey.describe())

    def quit_app():
        try:
            listener.stop()
        except Exception:
            pass
        root.after(100, root.destroy)

    listener = hotkey.HotkeyListener(trigger)
    listener.start()

    tray_obj = tray.Tray(
        on_capture=trigger,
        on_settings=open_settings,
        on_quit=quit_app,
        hotkey_str=hotkey.describe())
    tray_obj.start()

    try:
        root.mainloop()
    except KeyboardInterrupt:
        quit_app()


if __name__ == '__main__':
    main()
