/** Shared config schema — mirrors app/python/app/config.py */

export type HotkeyMode = 'live' | 'window'

export interface HotkeyBinding {
  hotkey_ctrl: boolean
  hotkey_alt: boolean
  hotkey_shift: boolean
  hotkey_win: boolean
  hotkey_key: string
  mode?: HotkeyMode
}

export interface ScreenTranslatorConfig {
  hotkey_ctrl: boolean
  hotkey_alt: boolean
  hotkey_shift: boolean
  hotkey_win: boolean
  hotkey_key: string
  hotkeys: HotkeyBinding[]

  live_preview_enabled: boolean
  live_preview_debounce_ms: number

  ocr_lang: string
  source_lang: string
  target_lang: string

  engine: 'google' | 'local_nllb' | 'gcp_local' | 'gemini_api' | 'gemini_oauth'
  gemini_api_key: string
  gemini_model: string
  gemini_model_auto: boolean
  gcp_local_url: string
  gcp_local_api_key: string

  overlay_alpha: number
  overlay_font_size: number
  overlay_auto_close: number
  overlay_theme: 'dark' | 'light'

  copy_to_clipboard: boolean
  start_minimized: boolean
  show_original: boolean
  overlay_seamless: boolean
}

const DEFAULT_HOTKEY: HotkeyBinding = {
  hotkey_ctrl: true,
  hotkey_alt: true,
  hotkey_shift: false,
  hotkey_win: false,
  hotkey_key: 'T'
}

export const CONFIG_DEFAULTS: ScreenTranslatorConfig = {
  hotkey_ctrl: true,
  hotkey_alt: true,
  hotkey_shift: false,
  hotkey_win: false,
  hotkey_key: 'T',
  hotkeys: [
    { ...DEFAULT_HOTKEY },
    { hotkey_ctrl: true, hotkey_alt: true, hotkey_shift: false, hotkey_win: false, hotkey_key: 'A', mode: 'live' },
    { hotkey_ctrl: true, hotkey_alt: true, hotkey_shift: false, hotkey_win: false, hotkey_key: 'D', mode: 'window' }
  ],

  live_preview_enabled: true,
  live_preview_debounce_ms: 750,

  ocr_lang: 'en-US',
  source_lang: 'auto',
  target_lang: 'ru',

  engine: 'google',
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash',
  gemini_model_auto: true,
  gcp_local_url: '',
  gcp_local_api_key: '',

  overlay_alpha: 0.94,
  overlay_font_size: 14,
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

export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey'

export const ENGINES: { id: ScreenTranslatorConfig['engine']; label: string; hint: string }[] = [
  {
    id: 'local_nllb',
    label: 'Локальный NLLB',
    hint: 'Самый быстрый: Windows OCR + NLLB на вашем ПК (~0.1–0.5 с)'
  },
  { id: 'google', label: 'Google Translate', hint: 'Windows OCR + бесплатный перевод текста' },
  {
    id: 'gemini_api',
    label: 'Google AI Studio',
    hint: 'Gemini Vision через API-ключ из aistudio.google.com'
  },
  { id: 'gemini_oauth', label: 'Gemini · OAuth', hint: 'Вход через Google-аккаунт' },
  {
    id: 'gcp_local',
    label: 'GCP Local (NLLB)',
    hint: 'Быстрый перевод: Windows OCR → NLLB на Cloud Run'
  }
]

export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
]

export function getHotkeyBindings(cfg: ScreenTranslatorConfig): HotkeyBinding[] {
  if (cfg.hotkeys?.length) return cfg.hotkeys
  return [
    {
      hotkey_ctrl: cfg.hotkey_ctrl,
      hotkey_alt: cfg.hotkey_alt,
      hotkey_shift: cfg.hotkey_shift,
      hotkey_win: cfg.hotkey_win,
      hotkey_key: cfg.hotkey_key || 'T'
    }
  ]
}

export function describeHotkeyBinding(binding: HotkeyBinding): string {
  const parts: string[] = []
  if (binding.hotkey_ctrl) parts.push('Ctrl')
  if (binding.hotkey_alt) parts.push('Alt')
  if (binding.hotkey_shift) parts.push('Shift')
  if (binding.hotkey_win) parts.push('Win')
  parts.push((binding.hotkey_key || 'T').toUpperCase())
  return parts.join(' + ')
}

export function describeHotkeyMode(mode?: HotkeyMode): string {
  if (mode === 'live') return 'Реальное время'
  if (mode === 'window') return 'Окно выделения'
  return 'Как в настройках'
}

export function describeHotkey(cfg: ScreenTranslatorConfig): string {
  return describeHotkeyBinding(getHotkeyBindings(cfg)[0])
}

export function describeHotkeys(cfg: ScreenTranslatorConfig): string {
  const bindings = getHotkeyBindings(cfg)
  const primary = describeHotkeyBinding(bindings[0])
  if (bindings.length <= 1) return primary
  return `${primary} (+${bindings.length - 1})`
}

export function hotkeyBindingToAccelerator(binding: HotkeyBinding): string {
  const parts: string[] = []
  if (binding.hotkey_ctrl) parts.push('CommandOrControl')
  if (binding.hotkey_alt) parts.push('Alt')
  if (binding.hotkey_shift) parts.push('Shift')
  if (binding.hotkey_win) parts.push('Super')
  if (parts.length === 0) parts.push('CommandOrControl')
  parts.push((binding.hotkey_key || 'T').toUpperCase())
  return parts.join('+')
}

export function hotkeyToAccelerator(cfg: ScreenTranslatorConfig): string {
  return hotkeyBindingToAccelerator(getHotkeyBindings(cfg)[0])
}

export function syncLegacyHotkeyFields(hotkeys: HotkeyBinding[]): Pick<
  ScreenTranslatorConfig,
  'hotkeys' | 'hotkey_ctrl' | 'hotkey_alt' | 'hotkey_shift' | 'hotkey_win' | 'hotkey_key'
> {
  const primary = hotkeys[0] ?? { ...DEFAULT_HOTKEY }
  return {
    hotkeys,
    hotkey_ctrl: primary.hotkey_ctrl,
    hotkey_alt: primary.hotkey_alt,
    hotkey_shift: primary.hotkey_shift,
    hotkey_win: primary.hotkey_win,
    hotkey_key: primary.hotkey_key
  }
}

export function clampLivePreviewDebounceMs(value: number): number {
  return Math.min(2000, Math.max(300, Math.round(value)))
}
