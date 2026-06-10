"""Region selection overlay + translation dispatch."""
import threading
import tkinter as tk
from PIL import ImageGrab, ImageTk

from . import config
from . import translators


# ── Region selection ───────────────────────────────────────────────────────
class RegionSelector:
    def __init__(self, root, on_select):
        self.root = root
        self.on_select = on_select
        self.sx = self.sy = 0
        self.rect_id = None

        self.screenshot = ImageGrab.grab(all_screens=True)
        sw, sh = self.screenshot.size

        win = tk.Toplevel(root)
        self.win = win
        win.attributes('-fullscreen', True)
        win.attributes('-topmost', True)
        win.overrideredirect(True)
        win.focus_force()

        self.photo = ImageTk.PhotoImage(self.screenshot)
        cv = tk.Canvas(win, cursor='cross', highlightthickness=0,
                       width=sw, height=sh)
        cv.pack(fill=tk.BOTH, expand=True)
        cv.create_image(0, 0, anchor='nw', image=self.photo)
        cv.create_rectangle(0, 0, sw, sh,
                            fill='black', stipple='gray50', outline='')
        cv.create_text(sw // 2, 28,
                       text='Выделите область для перевода  •  Esc — отмена',
                       fill='white', font=('Segoe UI', 13, 'bold'))

        cv.bind('<ButtonPress-1>',   self._press)
        cv.bind('<B1-Motion>',       self._drag)
        cv.bind('<ButtonRelease-1>', self._release)
        win.bind('<Escape>', lambda _: win.destroy())
        self.cv = cv

    def _press(self, e):
        self.sx, self.sy = e.x, e.y
        if self.rect_id:
            self.cv.delete(self.rect_id)

    def _drag(self, e):
        if self.rect_id:
            self.cv.delete(self.rect_id)
        self.rect_id = self.cv.create_rectangle(
            self.sx, self.sy, e.x, e.y,
            outline='#89dceb', width=2, fill='white', stipple='gray25')

    def _release(self, e):
        x1, y1 = min(self.sx, e.x), min(self.sy, e.y)
        x2, y2 = max(self.sx, e.x), max(self.sy, e.y)
        self.win.destroy()
        if x2 - x1 > 10 and y2 - y1 > 10:
            self.on_select(x1, y1, x2, y2, self.screenshot.crop((x1, y1, x2, y2)))


# ── Translation overlay ────────────────────────────────────────────────────
def show_overlay(root, x1, y1, x2, y2, text_or_img, error=False, original=None, source_image=None):
    from PIL import Image, ImageTk
    from .overlay_adaptive import adaptive_overlay_colors, sample_region_stats
    is_image = isinstance(text_or_img, Image.Image)
    auto_close = int(config.get('overlay_auto_close') or 30)

    if is_image:
        w, h = text_or_img.size
        win = tk.Toplevel(root)
        win.geometry(f'{w}x{h}+{x1}+{y1}')
        win.overrideredirect(True)
        win.attributes('-topmost', True)
        photo = ImageTk.PhotoImage(text_or_img)
        lbl = tk.Label(win, image=photo, highlightthickness=0, bd=0)
        lbl.image = photo
        lbl.pack(fill=tk.BOTH, expand=True)
        win.bind('<Button-1>', lambda _: win.destroy())
        win.bind('<Escape>',   lambda _: win.destroy())
        if auto_close > 0:
            win.after(auto_close * 1000, lambda: win.destroy() if win.winfo_exists() else None)
        return

    text = text_or_img
    PAD = 10
    w = max(x2 - x1, 260)
    alpha = float(config.get('overlay_alpha') or 0.94)
    base_font = int(config.get('overlay_font_size') or 11)

    if error:
        BG, FG, BORD, MUTED = '#2e1a1a', '#f38ba8', '#7f1d1d', '#f38ba8'
        font_size = max(11, base_font)
    elif source_image is not None:
        stats = sample_region_stats(source_image, 0, 0, source_image.size[0], source_image.size[1])
        adaptive = adaptive_overlay_colors(stats, alpha=alpha)
        BG = '#%02x%02x%02x' % adaptive['bg']
        FG = adaptive['fg']
        BORD = '#%02x%02x%02x' % tuple(max(0, c - 20) for c in adaptive['bg'])
        MUTED = FG
        font_size = adaptive['font_size']
        alpha = adaptive['alpha']
    else:
        theme = config.get('overlay_theme') or 'dark'
        if theme == 'light':
            BG, FG, BORD, MUTED = '#f9f9fb', '#1e1e2e', '#bcc0d4', '#7c7f93'
        else:
            BG, FG, BORD, MUTED = '#1e1e2e', '#cdd6f4', '#45475a', '#9399b2'
        font_size = base_font

    full_text = text if not original else f'{original}\n\n──\n{text}'

    dummy = tk.Label(root, text=full_text, wraplength=w - PAD * 2,
                     font=('Segoe UI', font_size))
    dummy.update_idletasks()
    req_h = dummy.winfo_reqheight() + PAD * 2 + 24
    dummy.destroy()
    h = max(y2 - y1, req_h, 64)

    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    ox = max(0, min(x1, sw - w))
    oy = max(0, min(y1, sh - h))

    win = tk.Toplevel(root)
    win.geometry(f'{w}x{h}+{ox}+{oy}')
    win.overrideredirect(True)
    win.attributes('-topmost', True)
    win.attributes('-alpha', alpha)
    win.configure(bg=BORD)

    inner = tk.Frame(win, bg=BG)
    inner.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)

    close = tk.Label(inner, text='✕', bg=BG, fg=MUTED,
                     cursor='hand2', font=('Segoe UI', 9, 'bold'))
    close.place(relx=1.0, x=-8, y=4, anchor='ne')
    close.bind('<Button-1>', lambda _: win.destroy())

    lbl = tk.Label(inner, text=full_text, wraplength=w - PAD * 2,
                   justify=tk.LEFT, bg=BG, fg=FG,
                   font=('Segoe UI', font_size), anchor='nw')
    lbl.pack(fill=tk.BOTH, expand=True, padx=PAD, pady=(PAD + 2, PAD))

    win.bind('<Button-1>', lambda _: win.destroy())
    win.bind('<Escape>',   lambda _: win.destroy())

    if auto_close > 0:
        win.after(auto_close * 1000,
                  lambda: win.destroy() if win.winfo_exists() else None)


# ── Worker ─────────────────────────────────────────────────────────────────
def process(root, x1, y1, x2, y2, img):
    def worker():
        try:
            translated, original = translators.translate_image(img)
        except translators.TranslationError as e:
            root.after(0, show_overlay, root, x1, y1, x2, y2, str(e), True)
            return
        except Exception as e:
            root.after(0, show_overlay, root, x1, y1, x2, y2,
                       f'Ошибка: {e}', True)
            return

        if not translated:
            root.after(0, show_overlay, root, x1, y1, x2, y2,
                       '(текст не распознан)', True)
            return

        if config.get('copy_to_clipboard'):
            try:
                root.clipboard_clear()
                if isinstance(translated, str):
                    root.clipboard_append(translated)
            except Exception:
                pass

        root.after(0, lambda: show_overlay(
            root, x1, y1, x2, y2, translated, False, original, img))

    threading.Thread(target=worker, daemon=True).start()
