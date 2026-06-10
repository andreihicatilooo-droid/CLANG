import React, { useCallback, useEffect, useState } from 'react'
import { Settings, Globe, Keyboard, Monitor } from 'lucide-react'
import type { ScreenTranslatorConfig } from '../../../shared/config'
import {
  CONFIG_DEFAULTS,
  describeHotkey,
  ENGINES,
  GEMINI_MODELS,
  TARGET_LANGS
} from '../../../shared/config'

export default function SettingsScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('languages')
  const [config, setConfig] = useState<ScreenTranslatorConfig>({ ...CONFIG_DEFAULTS })
  const [ocrLanguages, setOcrLanguages] = useState<string[]>([])
  const [oauthAuthorized, setOauthAuthorized] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthMessage, setOauthMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    const [cfg, langs, oauth] = await Promise.all([
      window.api.getConfig(),
      window.api.getOcrLanguages().catch(() => [] as string[]),
      window.api.oauthStatus().catch(() => ({ authorized: false }))
    ])
    setConfig(cfg)
    setOcrLanguages(langs.length > 0 ? langs : ['en-US', 'ru-RU'])
    setOauthAuthorized(oauth.authorized)
  }, [])

  useEffect(() => {
    void loadAll()
    return window.api.onConfigChanged((cfg) => setConfig(cfg))
  }, [loadAll])

  const patch = async (updates: Partial<ScreenTranslatorConfig>): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.api.saveConfig(updates)
      setConfig(next)
    } finally {
      setSaving(false)
    }
  }

  const handleOAuth = async (): Promise<void> => {
    if (oauthAuthorized) {
      await window.api.oauthLogout()
      setOauthAuthorized(false)
      setOauthMessage('Вы вышли из аккаунта.')
      return
    }

    setOauthBusy(true)
    setOauthMessage('Откройте браузер для входа…')
    try {
      const start = await window.api.oauthStart()
      if (!start.started) {
        setOauthMessage(start.message ?? 'OAuth уже выполняется')
        return
      }

      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500))
        const poll = await window.api.oauthPoll()
        if (!poll.done) continue
        setOauthAuthorized(poll.authorized)
        setOauthMessage(poll.message ?? (poll.success ? 'Авторизация успешна' : 'Ошибка OAuth'))
        return
      }
      setOauthMessage('Время ожидания OAuth истекло')
    } finally {
      setOauthBusy(false)
    }
  }

  const hotkeyLabel = describeHotkey(config)

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200">
      <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-100">
            <Monitor className="w-6 h-6 text-blue-500" />
            Экранный Переводчик
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab('languages')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'languages' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Globe className="w-5 h-5" />
            Языки
          </button>
          <button
            onClick={() => setActiveTab('hotkeys')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'hotkeys' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Keyboard className="w-5 h-5" />
            Горячие клавиши
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'general' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Settings className="w-5 h-5" />
            Основные
          </button>
        </nav>
      </div>

      <div className="flex-1 p-8 overflow-auto custom-scrollbar">
        <div className="max-w-2xl">
          {activeTab === 'languages' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Настройки языков</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6 shadow-sm">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Язык распознавания (Windows OCR)
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                    value={config.ocr_lang}
                    onChange={(e) => void patch({ ocr_lang: e.target.value })}
                  >
                    {ocrLanguages.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Язык перевода</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                    value={config.target_lang}
                    onChange={(e) => void patch({ target_lang: e.target.value })}
                  >
                    {TARGET_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-1">Сервис перевода</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                    value={config.engine}
                    onChange={(e) =>
                      void patch({ engine: e.target.value as ScreenTranslatorConfig['engine'] })
                    }
                  >
                    {ENGINES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-slate-500">
                    {ENGINES.find((e) => e.id === config.engine)?.hint}
                  </p>
                </div>

                {config.engine === 'gemini_api' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Gemini API key</label>
                      <input
                        type="password"
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                        value={config.gemini_api_key}
                        onChange={(e) => void patch({ gemini_api_key: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Модель</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                        value={config.gemini_model}
                        onChange={(e) => void patch({ gemini_model: e.target.value })}
                      >
                        {GEMINI_MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {config.engine === 'gemini_oauth' && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled={oauthBusy || saving}
                      onClick={() => void handleOAuth()}
                      className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
                    >
                      {oauthAuthorized ? 'Выйти из Google' : 'Войти через Google'}
                    </button>
                    {oauthMessage && <p className="text-sm text-slate-400">{oauthMessage}</p>}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Модель</label>
                      <select
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2"
                        value={config.gemini_model}
                        onChange={(e) => void patch({ gemini_model: e.target.value })}
                      >
                        {GEMINI_MODELS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'hotkeys' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Горячие клавиши</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-sm flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['hotkey_ctrl', 'Ctrl'],
                      ['hotkey_alt', 'Alt'],
                      ['hotkey_shift', 'Shift'],
                      ['hotkey_win', 'Win']
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={config[key]}
                        onChange={(e) => void patch({ [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Клавиша</label>
                  <input
                    type="text"
                    maxLength={1}
                    className="w-24 bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2 uppercase"
                    value={config.hotkey_key}
                    onChange={(e) => void patch({ hotkey_key: e.target.value.toUpperCase().slice(0, 1) })}
                  />
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-sm text-slate-300">Захват экрана</span>
                  <kbd className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-300 font-mono text-sm">
                    {hotkeyLabel}
                  </kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Закрыть оверлей</span>
                  <kbd className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-300 font-mono text-sm">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Основные настройки</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-sm space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.start_minimized}
                    onChange={(e) => void patch({ start_minimized: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-300">Запускать свёрнутым в трей</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.overlay_seamless}
                    onChange={(e) => void patch({ overlay_seamless: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-300">Бесшовный оверлей (inpainting)</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.show_original}
                    onChange={(e) => void patch({ show_original: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-300">Показывать оригинальный текст</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.copy_to_clipboard}
                    onChange={(e) => void patch({ copy_to_clipboard: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-300">Копировать перевод в буфер</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
