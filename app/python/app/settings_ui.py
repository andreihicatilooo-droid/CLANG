"""Modern dark settings window."""
import tkinter as tk
from tkinter import messagebox

from . import config, hotkey, oauth, ocr


# ── Catppuccin Mocha palette ───────────────────────────────────────────────
C = {
    'base':    '#11111b',
    'mantle':  '#181825',
    'crust':   '#1e1e2e',
    'surface': '#313244',
    'surface1':'#45475a',
    'overlay': '#585b70',
    'text':    '#cdd6f4',
    'subtext': '#a6adc8',
    'muted':   '#7f849c',
    'accent':  '#89b4fa',   # blue
    'accent2': '#cba6f7',   # mauve
    'success': '#a6e3a1',
    'error':   '#f38ba8',
    'warning': '#fab387',
}

FONT     = ('Segoe UI', 11)
FONT_BIG = ('Segoe UI', 16, 'bold')
FONT_SM  = ('Segoe UI Semibold', 10)
FONT_LBL = ('Segoe UI', 10)


_TARGET_LANGS = [
    ('Русский', 'ru'),  ('English', 'en'), ('Deutsch', 'de'),
    ('Français','fr'),  ('Español', 'es'), ('Italiano','it'),
    ('日本語',  'ja'),  ('한국어',  'ko'), ('Українська','uk'),
    ('Polski',  'pl'),  ('Türkçe',  'tr'),
]

_ENGINES = [
    ('google',       'Google',         'Бесплатно. Windows OCR + Google Translate.'),
    ('gemini_api',   'Google AI Studio', 'Gemini Vision. Ключ: aistudio.google.com/apikey'),
    ('gemini_oauth', 'Gemini · OAuth', 'Вход через Google-аккаунт.'),
]

_GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
]

_THEMES = [('Тёмная', 'dark'), ('Светлая', 'light')]

_settings_win = None


# ── UI helpers ─────────────────────────────────────────────────────────────
class HoverFrame(tk.Frame):
    """Frame with hover color change for button-like behavior."""
    def __init__(self, parent, bg, hover_bg, command=None, **kw):
        super().__init__(parent, bg=bg, **kw)
        self._bg, self._hover = bg, hover_bg
        self._command = command
        self.bind('<Enter>', self._on_enter)
        self.bind('<Leave>', self._on_leave)
        if command:
            self.bind('<Button-1>', lambda _: command())
            self.configure(cursor='hand2')

    def _on_enter(self, _):
        self._recolor(self._hover)

    def _on_leave(self, e):
        x, y = self.winfo_pointerxy()
        wx = self.winfo_rootx()
        wy = self.winfo_rooty()
        ww = self.winfo_width()
        wh = self.winfo_height()
        if not (wx <= x < wx + ww and wy <= y < wy + wh):
            self._recolor(self._bg)

    def _recolor(self, color):
        self.configure(bg=color)
        def _walk(w):
            for ch in w.winfo_children():
                try:
                    ch.configure(bg=color)
                except tk.TclError:
                    pass
                _walk(ch)
        _walk(self)

    def bind_all_children(self):
        if not self._command:
            return
        def _walk(w):
            w.bind('<Button-1>', lambda _: self._command())
            for ch in w.winfo_children():
                _walk(ch)
        _walk(self)


def make_button(parent, text, command, *, primary=False, danger=False, width=None):
    bg = C['accent'] if primary else C['surface']
    hov = C['accent2'] if primary else C['surface1']
    fg = C['crust'] if primary else C['text']
    if danger:
        bg, hov, fg = C['error'], '#eb6f8e', '#11111b'
    f = HoverFrame(parent, bg=bg, hover_bg=hov, command=command,
                   highlightthickness=0)
    lbl = tk.Label(f, text=text, bg=bg, fg=fg, font=FONT_SM,
                   padx=22, pady=10, cursor='hand2')
    if width:
        lbl.configure(width=width)
    lbl.pack()
    f.bind_all_children()
    return f


class Switch(tk.Canvas):
    """iOS-style toggle switch."""
    W, H = 38, 20

    def __init__(self, parent, variable):
        super().__init__(parent, width=self.W, height=self.H,
                         bg=parent.cget('bg'), highlightthickness=0, bd=0)
        self.var = variable
        self.bind('<Button-1>', self._toggle)
        self.configure(cursor='hand2')
        self._draw()
        self.var.trace_add('write', lambda *_: self._draw())

    def _toggle(self, _):
        self.var.set(not self.var.get())

    def _draw(self):
        self.delete('all')
        on = bool(self.var.get())
        bg = C['accent'] if on else C['surface1']
        self.create_oval(0, 0, self.H, self.H, fill=bg, outline=bg)
        self.create_oval(self.W - self.H, 0, self.W, self.H, fill=bg, outline=bg)
        self.create_rectangle(self.H/2, 0, self.W - self.H/2, self.H,
                              fill=bg, outline=bg)
        cx = (self.W - self.H/2 - 2) if on else (self.H/2 + 2)
        r = self.H/2 - 2
        self.create_oval(cx - r, 2, cx + r, self.H - 2,
                         fill=C['text'], outline=C['text'])


class Combo(tk.Frame):
    """Dark dropdown using OptionMenu."""
    def __init__(self, parent, var, values, width=22):
        super().__init__(parent, bg=parent.cget('bg'))
        self.var = var
        self._opt = tk.OptionMenu(self, var, *values)
        self._opt.configure(
            bg=C['surface'], fg=C['text'], activebackground=C['surface1'],
            activeforeground=C['text'], highlightthickness=0, bd=0,
            font=FONT, width=width, anchor='w', relief='flat',
            indicatoron=0, padx=10, pady=5)
        self._opt['menu'].configure(
            bg=C['surface'], fg=C['text'], activebackground=C['accent'],
            activeforeground=C['crust'], bd=0, font=FONT)
        self._opt.pack(fill='x')


class Entry(tk.Entry):
    def __init__(self, parent, textvariable, *, show=None, width=30):
        super().__init__(parent, textvariable=textvariable,
                         bg=C['mantle'], fg=C['text'],
                         insertbackground=C['accent'],
                         relief='flat', bd=0, font=FONT,
                         highlightthickness=1,
                         highlightbackground=C['surface1'],
                         highlightcolor=C['accent'],
                         width=width)
        if show is not None:
            self.configure(show=show)


def label(parent, text, *, color='text', font=None):
    return tk.Label(parent, text=text, bg=parent.cget('bg'),
                    fg=C[color], font=font or FONT_LBL, anchor='w')


def section(parent, title):
    """Returns the inner content frame; renders a titled card."""
    wrap = tk.Frame(parent, bg=parent.cget('bg'))
    wrap.pack(fill='x', pady=(0, 14))
    tk.Label(wrap, text=title.upper(), bg=parent.cget('bg'),
             fg=C['subtext'], font=('Segoe UI Semibold', 8),
             anchor='w').pack(fill='x', padx=2, pady=(0, 6))
    card = tk.Frame(wrap, bg=C['mantle'])
    card.pack(fill='x')
    inner = tk.Frame(card, bg=C['mantle'])
    inner.pack(fill='x', padx=22, pady=18)
    return inner


def row(parent, title, subtitle=None):
    """Returns right-side container; renders label + subtitle on the left."""
    r = tk.Frame(parent, bg=C['mantle'])
    r.pack(fill='x', pady=4)
    left = tk.Frame(r, bg=C['mantle'])
    left.pack(side='left', fill='x', expand=True)
    tk.Label(left, text=title, bg=C['mantle'], fg=C['text'],
             font=FONT).pack(anchor='w')
    if subtitle:
        tk.Label(left, text=subtitle, bg=C['mantle'], fg=C['muted'],
                 font=('Segoe UI', 8)).pack(anchor='w')
    right = tk.Frame(r, bg=C['mantle'])
    right.pack(side='right')
    return right


# ── Settings window ────────────────────────────────────────────────────────
def open_settings(root, on_save):
    global _settings_win
    if _settings_win is not None and _settings_win.winfo_exists():
        _settings_win.lift()
        _settings_win.focus_force()
        return

    cfg = config.load()
    win = tk.Toplevel(root)
    _settings_win = win
    win.title('Screen Translator — Настройки')
    win.geometry('860x680')
    win.configure(bg=C['crust'])
    win.minsize(760, 600)
    try:
        win.iconbitmap(default='')
    except Exception:
        pass

    # Variables ──────────────────────────────────────────────────────────
    v_ctrl  = tk.BooleanVar(value=cfg['hotkey_ctrl'])
    v_alt   = tk.BooleanVar(value=cfg['hotkey_alt'])
    v_shift = tk.BooleanVar(value=cfg['hotkey_shift'])
    v_win   = tk.BooleanVar(value=cfg['hotkey_win'])
    v_key   = tk.StringVar(value=cfg['hotkey_key'])

    available_ocr = ocr.available_languages() or ['en-US', 'ru-RU']
    if cfg['ocr_lang'] not in available_ocr:
        available_ocr = list(set(available_ocr + [cfg['ocr_lang']]))

    v_ocr    = tk.StringVar(value=cfg['ocr_lang'])
    v_target = tk.StringVar(value=cfg['target_lang'])
    v_clip   = tk.BooleanVar(value=cfg['copy_to_clipboard'])
    v_orig   = tk.BooleanVar(value=cfg['show_original'])
    v_min    = tk.BooleanVar(value=cfg['start_minimized'])
    v_seamless = tk.BooleanVar(value=cfg.get('overlay_seamless', False))

    v_engine   = tk.StringVar(value=cfg['engine'])
    v_api      = tk.StringVar(value=cfg['gemini_api_key'])
    v_model    = tk.StringVar(value=cfg['gemini_model'])
    v_show_api = tk.BooleanVar(value=False)

    v_theme = tk.StringVar(value=cfg['overlay_theme'])
    v_font  = tk.IntVar(value=cfg['overlay_font_size'])
    v_alpha = tk.DoubleVar(value=cfg['overlay_alpha'])
    v_close = tk.IntVar(value=cfg['overlay_auto_close'])

    # ── Header ───────────────────────────────────────────────────────────
    header = tk.Frame(win, bg=C['crust'])
    header.pack(fill='x', padx=28, pady=(22, 4))
    tk.Label(header, text='Настройки', bg=C['crust'],
             fg=C['text'], font=FONT_BIG).pack(anchor='w')
    tk.Label(header, text='Screen Translator', bg=C['crust'],
             fg=C['muted'], font=('Segoe UI', 9)).pack(anchor='w')

    # ── Sidebar + content ────────────────────────────────────────────────
    body = tk.Frame(win, bg=C['crust'])
    body.pack(fill='both', expand=True, padx=20, pady=(18, 0))

    sidebar = tk.Frame(body, bg=C['crust'], width=220)
    sidebar.pack(side='left', fill='y')
    sidebar.pack_propagate(False)

    content_wrap = tk.Frame(body, bg=C['crust'])
    content_wrap.pack(side='left', fill='both', expand=True, padx=(8, 0))

    # Scrollable content
    canvas = tk.Canvas(content_wrap, bg=C['crust'], highlightthickness=0, bd=0)
    canvas.pack(side='left', fill='both', expand=True)
    scroll = tk.Scrollbar(content_wrap, orient='vertical', command=canvas.yview)
    scroll.pack(side='right', fill='y')
    canvas.configure(yscrollcommand=scroll.set)

    content = tk.Frame(canvas, bg=C['crust'])
    canvas.create_window((0, 0), window=content, anchor='nw',
                         width=canvas.winfo_reqwidth())

    def _on_resize(e):
        canvas.itemconfigure('all', width=e.width)
    canvas.bind('<Configure>', _on_resize)
    content.bind('<Configure>',
                 lambda _: canvas.configure(scrollregion=canvas.bbox('all')))

    def _on_wheel(e):
        canvas.yview_scroll(int(-1 * (e.delta / 120)), 'units')
    canvas.bind_all('<MouseWheel>', _on_wheel)

    # ── Sidebar buttons ──────────────────────────────────────────────────
    panes = {}
    nav_buttons = {}

    def show_pane(name):
        for p in panes.values():
            p.pack_forget()
        panes[name].pack(fill='both', expand=True)
        for n, (btn, icon_lbl, text_lbl) in nav_buttons.items():
            active = (n == name)
            btn._bg = C['surface'] if active else C['crust']
            btn._hover = C['surface1'] if active else C['mantle']
            btn._recolor(btn._bg)
            fg_color = C['text'] if active else C['subtext']
            icon_lbl.configure(fg=fg_color)
            text_lbl.configure(
                fg=fg_color,
                font=('Segoe UI Semibold', 10) if active else FONT)
        canvas.yview_moveto(0)

    def add_nav(name, label_text, icon):
        btn = HoverFrame(sidebar, bg=C['crust'], hover_bg=C['mantle'],
                         command=lambda n=name: show_pane(n))
        btn.pack(fill='x', pady=4)
        inner = tk.Frame(btn, bg=btn.cget('bg'))
        inner.pack(fill='x', padx=16, pady=12)
        icon_lbl = tk.Label(inner, text=icon, bg=inner.cget('bg'),
                            fg=C['subtext'], font=('Segoe UI', 14))
        icon_lbl.pack(side='left')
        text_lbl = tk.Label(inner, text=label_text, bg=inner.cget('bg'),
                            fg=C['subtext'], font=FONT)
        text_lbl.pack(side='left', padx=12)
        btn.bind_all_children()
        nav_buttons[name] = (btn, icon_lbl, text_lbl)

    add_nav('general',    'Общее',         '⚙')
    add_nav('engine',     'Перевод',       '🌐')
    add_nav('appearance', 'Внешний вид',   '🎨')
    add_nav('about',      'О программе',   'ⓘ')

    # ── Pane: General ────────────────────────────────────────────────────
    p_general = tk.Frame(content, bg=C['crust'])
    panes['general'] = p_general

    s = section(p_general, 'Горячая клавиша')
    r = row(s, 'Комбинация', 'Срабатывает в любом приложении')
    keys_frame = tk.Frame(r, bg=C['mantle'])
    keys_frame.pack()
    def chip(parent, text, var):
        f = tk.Frame(parent, bg=C['mantle'])
        f.pack(side='left', padx=3)
        Switch(f, var).pack(side='left')
        tk.Label(f, text=text, bg=C['mantle'], fg=C['subtext'],
                 font=FONT_LBL).pack(side='left', padx=(6, 4))
    chip(keys_frame, 'Ctrl',  v_ctrl)
    chip(keys_frame, 'Alt',   v_alt)
    chip(keys_frame, 'Shift', v_shift)
    chip(keys_frame, 'Win',   v_win)
    tk.Label(keys_frame, text='+', bg=C['mantle'], fg=C['muted'],
             font=FONT).pack(side='left', padx=6)
    Entry(keys_frame, v_key, width=3).pack(side='left')

    s = section(p_general, 'Язык')
    Combo(row(s, 'Перевод на', 'Целевой язык'),
          v_target, [c for _, c in _TARGET_LANGS], width=18).pack()

    s = section(p_general, 'Поведение')
    Switch(row(s, 'Копировать перевод в буфер обмена'), v_clip).pack()
    Switch(row(s, 'Показывать оригинал', 'Над переводом'), v_orig).pack()
    Switch(row(s, 'Запускать свёрнутым в трей'), v_min).pack()
    Switch(row(s, 'Бесшовный перевод', 'Закрашивает оригинальный текст на фоне'), v_seamless).pack()

    # ── Pane: Engine ─────────────────────────────────────────────────────
    p_engine = tk.Frame(content, bg=C['crust'])
    panes['engine'] = p_engine

    s = section(p_engine, 'Движок перевода')
    engine_cards = tk.Frame(s, bg=C['mantle'])
    engine_cards.pack(fill='x', pady=(2, 4))

    engine_card_widgets = {}
    def render_engines():
        for w in engine_cards.winfo_children():
            w.destroy()
        engine_card_widgets.clear()
        for key, name, desc in _ENGINES:
            selected = (v_engine.get() == key)
            bg = C['surface'] if selected else C['crust']
            hov = C['surface1'] if selected else C['mantle']
            card = HoverFrame(engine_cards, bg=bg, hover_bg=hov,
                              command=lambda k=key: (v_engine.set(k), render_engines(), update_engine_visibility()))
            card.pack(fill='x', pady=5)
            inner = tk.Frame(card, bg=bg)
            inner.pack(fill='x', padx=18, pady=14)
            dot_color = C['accent'] if selected else C['surface1']
            tk.Label(inner, text='●', bg=bg, fg=dot_color,
                     font=('Segoe UI', 12)).pack(side='left', padx=(0, 12))
            txt = tk.Frame(inner, bg=bg); txt.pack(side='left', fill='x', expand=True)
            tk.Label(txt, text=name, bg=bg, fg=C['text'],
                     font=('Segoe UI Semibold', 11), anchor='w').pack(anchor='w')
            tk.Label(txt, text=desc, bg=bg, fg=C['muted'],
                     font=('Segoe UI', 9), anchor='w').pack(anchor='w')
            card.bind_all_children()

    render_engines()

    # Gemini section
    gemini_section = tk.Frame(p_engine, bg=C['crust'])
    gemini_inner = section(gemini_section, 'Gemini')

    r = row(gemini_inner, 'API ключ', 'aistudio.google.com/apikey')
    apikey_box = tk.Frame(r, bg=C['mantle']); apikey_box.pack()
    api_entry = Entry(apikey_box, v_api, show='•', width=28)
    api_entry.pack(side='left')
    def toggle_show():
        api_entry.configure(show='' if v_show_api.get() else '•')
    eye = tk.Label(apikey_box, text='👁', bg=C['mantle'], fg=C['muted'],
                   font=('Segoe UI', 11), cursor='hand2', padx=8)
    eye.pack(side='left')
    def _flip_eye(_=None):
        v_show_api.set(not v_show_api.get())
        toggle_show()
    eye.bind('<Button-1>', _flip_eye)

    Combo(row(gemini_inner, 'Модель'),
          v_model, _GEMINI_MODELS, width=22).pack()

    # OAuth section
    oauth_section = tk.Frame(p_engine, bg=C['crust'])
    oauth_inner = section(oauth_section, 'OAuth')

    oauth_status_var = tk.StringVar()
    def refresh_oauth():
        oauth_status_var.set(
            '✓ Авторизован' if oauth.is_authorized() else '○ Не авторизован')

    r = row(oauth_inner, 'Вход через Google',
            'Браузер откроется автоматически')
    oauth_btns = tk.Frame(r, bg=C['mantle']); oauth_btns.pack()
    def do_login():
        def done(ok, msg):
            win.after(0, lambda: (
                refresh_oauth(),
                messagebox.showinfo('OAuth', msg) if ok
                else messagebox.showerror('OAuth', msg)))
        oauth.run_oauth_flow(done)
    def do_logout():
        oauth.logout(); refresh_oauth()
    make_button(oauth_btns, 'Войти', do_login, primary=True).pack(side='left', padx=3)
    make_button(oauth_btns, 'Выйти', do_logout).pack(side='left', padx=3)

    r = row(oauth_inner, 'Статус')
    tk.Label(r, textvariable=oauth_status_var, bg=C['mantle'],
             fg=C['success'], font=FONT).pack()
    refresh_oauth()

    # OCR section (only for Google)
    ocr_section = tk.Frame(p_engine, bg=C['crust'])
    ocr_inner = section(ocr_section, 'Распознавание (Windows OCR)')
    Combo(row(ocr_inner, 'Язык OCR',
              'Языковые пакеты Windows. Добавить: Параметры → Язык'),
          v_ocr, available_ocr, width=14).pack()

    def update_engine_visibility():
        eng = v_engine.get()
        gemini_section.pack_forget()
        oauth_section.pack_forget()
        ocr_section.pack_forget()
        if eng in ('gemini_api', 'gemini_oauth'):
            gemini_section.pack(fill='x', pady=(8, 0))
        if eng == 'gemini_oauth':
            oauth_section.pack(fill='x', pady=(8, 0))
        if eng == 'google':
            ocr_section.pack(fill='x', pady=(8, 0))

    update_engine_visibility()

    # ── Pane: Appearance ─────────────────────────────────────────────────
    p_appearance = tk.Frame(content, bg=C['crust'])
    panes['appearance'] = p_appearance

    s = section(p_appearance, 'Оверлей')
    Combo(row(s, 'Тема'), v_theme, [c for _, c in _THEMES], width=14).pack()

    r = row(s, 'Размер шрифта')
    font_box = tk.Frame(r, bg=C['mantle']); font_box.pack()
    tk.Label(font_box, textvariable=v_font, bg=C['mantle'], fg=C['text'],
             font=FONT, width=3).pack(side='right', padx=(8, 0))
    sc = tk.Scale(font_box, from_=8, to=24, orient='horizontal',
                  variable=v_font, bg=C['mantle'], fg=C['text'],
                  troughcolor=C['surface'], activebackground=C['accent'],
                  highlightthickness=0, bd=0, length=160, showvalue=False)
    sc.pack(side='left')

    r = row(s, 'Прозрачность')
    alpha_box = tk.Frame(r, bg=C['mantle']); alpha_box.pack()
    alpha_lbl = tk.Label(alpha_box, text='', bg=C['mantle'], fg=C['text'],
                         font=FONT, width=4)
    alpha_lbl.pack(side='right', padx=(8, 0))
    def update_alpha_lbl(*_):
        alpha_lbl.configure(text=f'{v_alpha.get():.2f}')
    update_alpha_lbl()
    v_alpha.trace_add('write', update_alpha_lbl)
    tk.Scale(alpha_box, from_=0.5, to=1.0, resolution=0.02,
             orient='horizontal', variable=v_alpha,
             bg=C['mantle'], fg=C['text'], troughcolor=C['surface'],
             activebackground=C['accent'], highlightthickness=0, bd=0,
             length=160, showvalue=False).pack(side='left')

    r = row(s, 'Автозакрытие, сек', '0 — не закрывать автоматически')
    tk.Spinbox(r, from_=0, to=300, textvariable=v_close, width=6,
               bg=C['mantle'], fg=C['text'], buttonbackground=C['surface'],
               relief='flat', bd=0, font=FONT,
               highlightthickness=1,
               highlightbackground=C['surface1'],
               highlightcolor=C['accent']).pack()

    # ── Pane: About ──────────────────────────────────────────────────────
    p_about = tk.Frame(content, bg=C['crust'])
    panes['about'] = p_about
    s = section(p_about, 'Программа')
    tk.Label(s, text='Screen Translator', bg=C['mantle'], fg=C['text'],
             font=('Segoe UI', 13, 'bold')).pack(anchor='w', pady=(2, 4))
    tk.Label(s,
             text='Выделите область экрана — получите перевод поверх неё.\n'
                  'Распознавание — Windows OCR или Gemini Vision.',
             bg=C['mantle'], fg=C['subtext'], font=FONT,
             justify='left').pack(anchor='w')
    tk.Label(s, text='Версия 1.0', bg=C['mantle'], fg=C['muted'],
             font=('Segoe UI', 8)).pack(anchor='w', pady=(12, 0))

    s = section(p_about, 'Конфигурация')
    tk.Label(s, text=f'Файл: {config.CONFIG_PATH}', bg=C['mantle'],
             fg=C['muted'], font=('Consolas', 8)).pack(anchor='w')

    show_pane('general')

    # ── Footer ───────────────────────────────────────────────────────────
    footer = tk.Frame(win, bg=C['crust'])
    footer.pack(fill='x', padx=28, pady=18)

    hk_lbl = tk.Label(footer,
                      text=f'Текущая комбинация: {hotkey.describe()}',
                      bg=C['crust'], fg=C['muted'], font=('Segoe UI', 9))
    hk_lbl.pack(side='left')

    def save_and_close():
        config.save({
            'hotkey_ctrl':  v_ctrl.get(),
            'hotkey_alt':   v_alt.get(),
            'hotkey_shift': v_shift.get(),
            'hotkey_win':   v_win.get(),
            'hotkey_key':   (v_key.get() or 'T')[0].upper(),
            'ocr_lang':     v_ocr.get(),
            'target_lang':  v_target.get(),
            'copy_to_clipboard': v_clip.get(),
            'show_original':     v_orig.get(),
            'start_minimized':   v_min.get(),
            'engine':         v_engine.get(),
            'gemini_api_key': v_api.get().strip(),
            'gemini_model':   v_model.get(),
            'overlay_theme':      v_theme.get(),
            'overlay_font_size':  int(v_font.get()),
            'overlay_alpha':      round(float(v_alpha.get()), 2),
            'overlay_auto_close': int(v_close.get()),
            'overlay_seamless':   v_seamless.get(),
        })
        on_save()
        close()

    make_button(footer, 'Сохранить', save_and_close,
                primary=True).pack(side='right', padx=(8, 0))
    make_button(footer, 'Отмена', lambda: close()).pack(side='right')

    def close():
        global _settings_win
        _settings_win = None
        try:
            canvas.unbind_all('<MouseWheel>')
        except Exception:
            pass
        win.destroy()
    win.protocol('WM_DELETE_WINDOW', close)
