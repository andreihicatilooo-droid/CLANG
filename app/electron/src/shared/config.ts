/** Shared config schema — mirrors app/python/app/config.py */

export interface ScreenTranslatorConfig {
  hotkey_ctrl: boolean
  hotkey_alt: boolean
  hotkey_shift: boolean
  hotkey_win: boolean
  hotkey_key: string

  ocr_lang: string
  source_lang: string
  target_lang: string

  engine: 'google' | 'gemini_api' | 'gemini_oauth'
  gemini_api_key: string
  gemini_model: string

  overlay_alpha: number
  overlay_font_size: number
  overlay_auto_close: number
  overlay_theme: 'dark' | 'light'

  copy_to_clipboard: boolean
  start_minimized: boolean
  show_original: boolean
  overlay_seamless: boolean
}

export const CONFIG_DEFAULTS: ScreenTranslatorConfig = {
  hotkey_ctrl: true,
  hotkey_alt: true,
  hotkey_shift: false,
  hotkey_win: false,
  hotkey_key: 'T',

  ocr_lang: 'en-US',
  source_lang: 'auto',
  target_lang: 'ru',

  engine: 'google',
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash',

  overlay_alpha: 0.94,
  overlay_font_size: 11,
  overlay_auto_close: 30,
  overlay_theme: 'dark',

  copy_to_clipboard: false,
  start_minimized: true,
  show_original: false,
  overlay_seamless: false
}

export const TARGET_LANGS: { label: string; code: string }[] = [
  { label: 'Русский', code: 'ru' },
  { label: 'English', code: 'en' },
  { label: 'Deutsch', code: 'de' },
  { label: 'Français', code: 'fr' },
  { label: 'Español', code: 'es' },
  { label: 'Italiano', code: 'it' },
  { label: '日本語', code: 'ja' },
  { label: '한국어', code: 'ko' },
  { label: 'Українська', code: 'uk' },
  { label: 'Polski', code: 'pl' },
  { label: 'Türkçe', code: 'tr' }
]

export const ENGINES: { id: ScreenTranslatorConfig['engine']; label: string; hint: string }[] = [
  { id: 'google', label: 'Google', hint: 'Windows OCR + Google Translate' },
  { id: 'gemini_api', label: 'Gemini · API key', hint: 'Vision translation via API key' },
  { id: 'gemini_oauth', label: 'Gemini · OAuth', hint: 'Sign in with Google account' }
]

export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
]

export function describeHotkey(cfg: ScreenTranslatorConfig): string {
  const parts: string[] = []
  if (cfg.hotkey_ctrl) parts.push('Ctrl')
  if (cfg.hotkey_alt) parts.push('Alt')
  if (cfg.hotkey_shift) parts.push('Shift')
  if (cfg.hotkey_win) parts.push('Win')
  parts.push((cfg.hotkey_key || 'T').toUpperCase())
  return parts.join(' + ')
}

export function hotkeyToAccelerator(cfg: ScreenTranslatorConfig): string {
  const parts: string[] = []
  if (cfg.hotkey_ctrl) parts.push('CommandOrControl')
  if (cfg.hotkey_alt) parts.push('Alt')
  if (cfg.hotkey_shift) parts.push('Shift')
  if (cfg.hotkey_win) parts.push('Super')
  parts.push((cfg.hotkey_key || 'T').toUpperCase())
  return parts.join('+')
}
