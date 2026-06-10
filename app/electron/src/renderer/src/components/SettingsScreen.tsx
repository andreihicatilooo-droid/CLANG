import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Keyboard, Languages, Settings, Sparkles } from 'lucide-react'
import type { HotkeyBinding, HotkeyMode, ScreenTranslatorConfig } from '../../../shared/config'
import {
  AI_STUDIO_KEY_URL,
  CONFIG_DEFAULTS,
  describeHotkeyBinding,
  describeHotkeyMode,
  describeHotkeys,
  ENGINES,
  GEMINI_MODELS,
  getHotkeyBindings,
  syncLegacyHotkeyFields,
  TARGET_LANGS
} from '../../../shared/config'

type TabId = 'languages' | 'hotkeys' | 'general'

type ModelOption = { id: string; label: string }

function defaultModelOptions(): ModelOption[] {
  return GEMINI_MODELS.map((id) => ({ id, label: id }))
}

function hotkeysEqual(a: HotkeyBinding[], b: HotkeyBinding[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (item, index) =>
      item.hotkey_ctrl === b[index].hotkey_ctrl &&
      item.hotkey_alt === b[index].hotkey_alt &&
      item.hotkey_shift === b[index].hotkey_shift &&
      item.hotkey_win === b[index].hotkey_win &&
      item.hotkey_key === b[index].hotkey_key &&
      (item.mode ?? undefined) === (b[index].mode ?? undefined)
  )
}

function configsEqual(a: ScreenTranslatorConfig, b: ScreenTranslatorConfig): boolean {
  return (Object.keys(CONFIG_DEFAULTS) as (keyof ScreenTranslatorConfig)[]).every((key) => {
    if (key === 'hotkeys') {
      return hotkeysEqual(getHotkeyBindings(a), getHotkeyBindings(b))
    }
    return a[key] === b[key]
  })
}

function Md3Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-md-on-surface">{label}</span>
      <span className="md3-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="md3-switch-track">
          <span className="md3-switch-thumb" />
        </span>
      </span>
    </label>
  )
}

function NavItem({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className={`md3-nav-item ${active ? 'active' : ''}`}>
      <span className="md3-nav-icon">{icon}</span>
      {label}
    </button>
  )
}

export default function SettingsScreen(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('languages')
  const [savedConfig, setSavedConfig] = useState<ScreenTranslatorConfig>({ ...CONFIG_DEFAULTS })
  const [draft, setDraft] = useState<ScreenTranslatorConfig>({ ...CONFIG_DEFAULTS })
  const savedRef = useRef(savedConfig)
  const [ocrLanguages, setOcrLanguages] = useState<string[]>([])
  const [oauthAuthorized, setOauthAuthorized] = useState(false)
  const [oauthBusy, setOAuthBusy] = useState(false)
  const [oauthMessage, setOauthMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [keyValidation, setKeyValidation] = useState<{ valid: boolean; message: string } | null>(
    null
  )
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [aiStudioModels, setAiStudioModels] = useState<ModelOption[]>([])
  const [recommendedModel, setRecommendedModel] = useState('')
  const [modelsLoading, setModelsLoading] = useState(false)
  const [gcpValidation, setGcpValidation] = useState<{ valid: boolean; message: string } | null>(
    null
  )
  const [gcpChecking, setGcpChecking] = useState(false)
  const scanSeqRef = useRef(0)

  savedRef.current = savedConfig

  const modelOptions = useMemo(
    () => (aiStudioModels.length > 0 ? aiStudioModels : defaultModelOptions()),
    [aiStudioModels]
  )

  const isDirty = useMemo(() => !configsEqual(draft, savedConfig), [draft, savedConfig])
  const hotkeyBindings = useMemo(() => getHotkeyBindings(draft), [draft])
  const hotkeyLabel = describeHotkeys(draft)

  const updateHotkeyBinding = (index: number, updates: Partial<HotkeyBinding>): void => {
    const next = hotkeyBindings.map((binding, i) =>
      i === index ? { ...binding, ...updates } : binding
    )
    updateDraft(syncLegacyHotkeyFields(next))
  }

  const addHotkeyBinding = (): void => {
    if (hotkeyBindings.length >= 5) return
    const next = [
      ...hotkeyBindings,
      {
        hotkey_ctrl: true,
        hotkey_alt: false,
        hotkey_shift: false,
        hotkey_win: false,
        hotkey_key: 'Q'
      }
    ]
    updateDraft(syncLegacyHotkeyFields(next))
  }

  const removeHotkeyBinding = (index: number): void => {
    if (hotkeyBindings.length <= 1) return
    const next = hotkeyBindings.filter((_, i) => i !== index)
    updateDraft(syncLegacyHotkeyFields(next))
  }

  const applyScanResult = useCallback(
    (scan: {
      valid: boolean
      models: ModelOption[]
      recommended: string
      selected: string
      message: string
    }) => {
      if (scan.models.length > 0) {
        setAiStudioModels(scan.models)
      }
      setRecommendedModel(scan.recommended)
      setKeyValidation({ valid: scan.valid, message: scan.message })

      if (!scan.valid) return

      setDraft((prev) => {
        const modelIds = scan.models.map((m) => m.id)
        let nextModel = prev.gemini_model
        if (prev.gemini_model_auto) {
          nextModel = scan.selected
        } else if (!modelIds.includes(prev.gemini_model)) {
          nextModel = scan.recommended
        }
        if (nextModel === prev.gemini_model) return prev
        return { ...prev, gemini_model: nextModel }
      })
    },
    []
  )

  const runAiStudioScan = useCallback(
    async (
      apiKey: string,
      opts?: { currentModel?: string; modelAuto?: boolean }
    ) => {
      const trimmed = apiKey.trim()
      if (trimmed.length < 20) {
        setAiStudioModels([])
        setRecommendedModel('')
        setKeyValidation(null)
        return
      }

      const seq = ++scanSeqRef.current
      setModelsLoading(true)
      try {
        const scan = await window.api.scanAiStudio(
          trimmed,
          opts?.currentModel,
          opts?.modelAuto ?? true
        )
        if (seq !== scanSeqRef.current) return
        applyScanResult(scan)
      } catch (err) {
        if (seq !== scanSeqRef.current) return
        setKeyValidation({
          valid: false,
          message: err instanceof Error ? err.message : 'Ошибка сканирования'
        })
      } finally {
        if (seq === scanSeqRef.current) {
          setModelsLoading(false)
        }
      }
    },
    [applyScanResult]
  )

  const updateDraft = (updates: Partial<ScreenTranslatorConfig>): void => {
    setSaveMessage(null)
    if ('gemini_api_key' in updates) {
      setKeyValidation(null)
    } else if (!('gemini_model' in updates) && !('gemini_model_auto' in updates)) {
      setKeyValidation(null)
    }
    setDraft((prev) => ({ ...prev, ...updates }))
  }

  const loadAll = useCallback(async () => {
    const [cfg, langs, oauth] = await Promise.all([
      window.api.getConfig(),
      window.api.getOcrLanguages().catch(() => [] as string[]),
      window.api.oauthStatus().catch(() => ({ authorized: false }))
    ])
    setSavedConfig(cfg)
    setDraft(cfg)
    setOcrLanguages(langs.length > 0 ? langs : ['en-US', 'ru-RU'])
    setOauthAuthorized(oauth.authorized)
    if (cfg.engine === 'gemini_api' && cfg.gemini_api_key.trim()) {
      void runAiStudioScan(cfg.gemini_api_key, {
        currentModel: cfg.gemini_model,
        modelAuto: cfg.gemini_model_auto
      })
    }
  }, [runAiStudioScan])

  useEffect(() => {
    document.body.classList.add('settings-mode')
    void loadAll()
    const unsubscribe = window.api.onConfigChanged((cfg) => {
      setSavedConfig(cfg)
      setDraft((current) => (configsEqual(current, savedRef.current) ? cfg : current))
    })
    return () => {
      document.body.classList.remove('settings-mode')
      unsubscribe()
    }
  }, [loadAll])

  useEffect(() => {
    if (draft.engine !== 'gemini_api') return
    const key = draft.gemini_api_key.trim()
    if (key.length < 20) return

    const timer = window.setTimeout(() => {
      void runAiStudioScan(key, {
        currentModel: draft.gemini_model,
        modelAuto: draft.gemini_model_auto
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draft.gemini_api_key, draft.engine, draft.gemini_model_auto, runAiStudioScan])

  const handleRescan = async (): Promise<void> => {
    if (!draft.gemini_api_key.trim()) {
      setKeyValidation({ valid: false, message: 'Введите API ключ' })
      return
    }
    await runAiStudioScan(draft.gemini_api_key)
  }

  const handleGcpCheck = async (): Promise<void> => {
    if (!draft.gcp_local_url.trim()) {
      setGcpValidation({ valid: false, message: 'Укажите URL сервиса' })
      return
    }
    setGcpChecking(true)
    try {
      const res = await window.api.validateGcpLocal(
        draft.gcp_local_url.trim(),
        draft.gcp_local_api_key.trim()
      )
      setGcpValidation({ valid: res.valid, message: res.message })
    } catch (err) {
      setGcpValidation({
        valid: false,
        message: err instanceof Error ? err.message : 'Ошибка проверки'
      })
    } finally {
      setGcpChecking(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveMessage(null)

    try {
      let configToSave = draft

      if (draft.engine === 'gemini_api') {
        if (!draft.gemini_api_key.trim()) {
          setSaveMessage({ type: 'error', text: 'Укажите API-ключ Google AI Studio' })
          return
        }
        const scan = await window.api.scanAiStudio(
          draft.gemini_api_key,
          draft.gemini_model,
          draft.gemini_model_auto
        )
        applyScanResult(scan)
        if (!scan.valid) {
          setSaveMessage({ type: 'error', text: scan.message })
          return
        }
        if (draft.gemini_model_auto) {
          configToSave = { ...draft, gemini_model: scan.selected }
          setDraft(configToSave)
        }
      }

      if (configToSave.engine === 'gemini_oauth' && !oauthAuthorized) {
        setSaveMessage({
          type: 'error',
          text: 'Для Gemini OAuth выполните вход через Google'
        })
        return
      }

      if (configToSave.engine === 'gcp_local') {
        if (!configToSave.gcp_local_url.trim()) {
          setSaveMessage({ type: 'error', text: 'Укажите URL GCP Translate' })
          return
        }
        const gcp = await window.api.validateGcpLocal(
          configToSave.gcp_local_url.trim(),
          configToSave.gcp_local_api_key.trim()
        )
        setGcpValidation({ valid: gcp.valid, message: gcp.message })
        if (!gcp.valid) {
          setSaveMessage({ type: 'error', text: gcp.message })
          return
        }
      }

      const next = await window.api.saveConfig(configToSave)
      setSavedConfig(next)
      setDraft(next)
      setSaveMessage({ type: 'success', text: 'Настройки сохранены' })
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось сохранить'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = (): void => {
    setDraft(savedConfig)
    setSaveMessage(null)
    setKeyValidation(null)
  }

  const handleOAuth = async (): Promise<void> => {
    if (oauthAuthorized) {
      await window.api.oauthLogout()
      setOauthAuthorized(false)
      setOauthMessage('Вы вышли из аккаунта.')
      return
    }

    setOAuthBusy(true)
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
      setOAuthBusy(false)
    }
  }

  const tabTitle =
    activeTab === 'languages'
      ? 'Языки и перевод'
      : activeTab === 'hotkeys'
        ? 'Горячие клавиши'
        : 'Основные'

  return (
    <div className="flex h-screen bg-md-background text-md-on-surface">
      <aside className="md3-nav-rail flex flex-col items-center py-3 shrink-0">
        <div className="flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-md-primary-container text-md-primary">
          <Sparkles className="w-7 h-7" />
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          <NavItem
            active={activeTab === 'languages'}
            icon={<Languages className="w-5 h-5" />}
            label="Языки"
            onClick={() => setActiveTab('languages')}
          />
          <NavItem
            active={activeTab === 'hotkeys'}
            icon={<Keyboard className="w-5 h-5" />}
            label="Клавиши"
            onClick={() => setActiveTab('hotkeys')}
          />
          <NavItem
            active={activeTab === 'general'}
            icon={<Settings className="w-5 h-5" />}
            label="Общие"
            onClick={() => setActiveTab('general')}
          />
        </nav>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="md3-top-app-bar px-6 py-4 shrink-0">
          <h1 className="text-2xl font-normal tracking-tight">{tabTitle}</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto">
            {saveMessage && (
              <div
                className={`md3-snackbar mb-4 ${saveMessage.type === 'success' ? 'md3-snackbar-success' : 'md3-snackbar-error'}`}
              >
                {saveMessage.text}
              </div>
            )}

            {activeTab === 'languages' && (
              <div className="md3-card space-y-6">
                <div>
                  <label className="md3-label">Язык распознавания (Windows OCR)</label>
                  <select
                    className="md3-select"
                    value={draft.ocr_lang}
                    onChange={(e) => updateDraft({ ocr_lang: e.target.value })}
                  >
                    {ocrLanguages.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="md3-label">Язык перевода</label>
                  <select
                    className="md3-select"
                    value={draft.target_lang}
                    onChange={(e) => updateDraft({ target_lang: e.target.value })}
                  >
                    {TARGET_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <hr className="md3-divider" />

                <div>
                  <label className="md3-label">Сервис перевода</label>
                  <select
                    className="md3-select"
                    value={draft.engine}
                    onChange={(e) =>
                      updateDraft({ engine: e.target.value as ScreenTranslatorConfig['engine'] })
                    }
                  >
                    {ENGINES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                  <p className="md3-hint">{ENGINES.find((e) => e.id === draft.engine)?.hint}</p>
                </div>

                {draft.engine === 'gemini_api' && (
                  <div className="space-y-4">
                    <div>
                      <label className="md3-label">API-ключ Google AI Studio</label>
                      <input
                        type="password"
                        className="md3-textfield"
                        value={draft.gemini_api_key}
                        onChange={(e) => updateDraft({ gemini_api_key: e.target.value })}
                        placeholder="AIza…"
                        autoComplete="off"
                      />
                      <p className="md3-hint mt-2">
                        Ключ создаётся в{' '}
                        <button
                          type="button"
                          className="text-md-primary underline hover:opacity-80"
                          onClick={() => void window.api.openExternal(AI_STUDIO_KEY_URL)}
                        >
                          Google AI Studio
                        </button>
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <button
                          type="button"
                          className="md3-btn-tonal"
                          disabled={modelsLoading || saving}
                          onClick={() => void handleRescan()}
                        >
                          {modelsLoading ? 'Сканирование…' : 'Сканировать снова'}
                        </button>
                        {keyValidation && (
                          <span
                            className={
                              keyValidation.valid ? 'md3-api-status-valid' : 'md3-api-status-invalid'
                            }
                          >
                            {keyValidation.message}
                          </span>
                        )}
                        {!keyValidation && modelsLoading && (
                          <span className="text-sm text-md-on-surface-variant">
                            Сканирование моделей…
                          </span>
                        )}
                      </div>
                    </div>

                    <Md3Switch
                      label="Автовыбор модели (рекомендуется для перевода с экрана)"
                      checked={draft.gemini_model_auto}
                      onChange={(value) => {
                        updateDraft({
                          gemini_model_auto: value,
                          ...(value && recommendedModel ? { gemini_model: recommendedModel } : {})
                        })
                      }}
                    />

                    <div>
                      <label className="md3-label">
                        Модель Gemini
                        {modelsLoading && (
                          <span className="text-md-on-surface-variant font-normal ml-2">
                            (сканирование…)
                          </span>
                        )}
                      </label>
                      {draft.gemini_model_auto ? (
                        <div className="md3-textfield opacity-90 cursor-default">
                          {recommendedModel || draft.gemini_model || '—'}
                          {recommendedModel && (
                            <span className="text-md-on-surface-variant text-sm ml-2">
                              (авто)
                            </span>
                          )}
                        </div>
                      ) : (
                        <select
                          className="md3-select"
                          value={draft.gemini_model}
                          onChange={(e) => updateDraft({ gemini_model: e.target.value })}
                          disabled={modelsLoading}
                        >
                          {modelOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                              {m.id === recommendedModel ? ' ★' : ''}
                            </option>
                          ))}
                          {!modelOptions.some((m) => m.id === draft.gemini_model) &&
                            draft.gemini_model && (
                              <option value={draft.gemini_model}>{draft.gemini_model}</option>
                            )}
                        </select>
                      )}
                      <p className="md3-hint">
                        {draft.gemini_model_auto
                          ? 'Модель определяется автоматически при каждом переводе (кэш 5 мин)'
                          : `Рекомендуется: ${recommendedModel || 'сканируйте ключ'}. ★ — лучший выбор для vision`}
                      </p>
                    </div>
                  </div>
                )}

                {draft.engine === 'gemini_oauth' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="md3-btn-tonal"
                        disabled={oauthBusy || saving}
                        onClick={() => void handleOAuth()}
                      >
                        {oauthAuthorized ? 'Выйти из Google' : 'Войти через Google'}
                      </button>
                      <span className="text-sm text-md-on-surface-variant">
                        {oauthAuthorized ? '✓ Авторизован' : '○ Не авторизован'}
                      </span>
                    </div>
                    {oauthMessage && <p className="md3-hint">{oauthMessage}</p>}
                    <div>
                      <label className="md3-label">Модель</label>
                      <select
                        className="md3-select"
                        value={draft.gemini_model}
                        onChange={(e) => updateDraft({ gemini_model: e.target.value })}
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

                {draft.engine === 'local_nllb' && (
                  <div className="flex items-center gap-2 text-sm text-md-on-surface-variant">
                    <Sparkles className="w-4 h-4" />
                    NLLB на вашем ПК — без сети. Модель ~600 МБ, кэш в %APPDATA%
                  </div>
                )}

                {draft.engine === 'google' && (
                  <div className="flex items-center gap-2 text-sm text-md-on-surface-variant">
                    <Globe className="w-4 h-4" />
                    Google Translate — ключ не требуется
                  </div>
                )}

                {draft.engine === 'gcp_local' && (
                  <div className="space-y-4">
                    <div>
                      <label className="md3-label">URL Cloud Run</label>
                      <input
                        type="url"
                        className="md3-textfield"
                        value={draft.gcp_local_url}
                        onChange={(e) => updateDraft({ gcp_local_url: e.target.value })}
                        placeholder="https://screen-translator-translate-….run.app"
                        autoComplete="off"
                      />
                      <p className="md3-hint mt-2">
                        NLLB на GCP — быстрый перевод после Windows OCR. Деплой:{' '}
                        <code className="text-xs">deploy/gcp-translate/deploy.ps1</code>
                      </p>
                    </div>
                    <div>
                      <label className="md3-label">API-ключ (X-API-Key)</label>
                      <input
                        type="password"
                        className="md3-textfield"
                        value={draft.gcp_local_api_key}
                        onChange={(e) => updateDraft({ gcp_local_api_key: e.target.value })}
                        placeholder="из вывода deploy.ps1"
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="md3-btn-tonal"
                        disabled={gcpChecking || saving}
                        onClick={() => void handleGcpCheck()}
                      >
                        {gcpChecking ? 'Проверка…' : 'Проверить подключение'}
                      </button>
                      {gcpValidation && (
                        <span
                          className={
                            gcpValidation.valid ? 'md3-api-status-valid' : 'md3-api-status-invalid'
                          }
                        >
                          {gcpValidation.message}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {(isDirty || saving) && (
                  <div className="md3-save-bar">
                    {isDirty && (
                      <span className="text-sm text-md-on-surface-variant mr-auto">
                        Есть несохранённые изменения
                      </span>
                    )}
                    <button
                      type="button"
                      className="md3-btn-text"
                      disabled={!isDirty || saving}
                      onClick={handleDiscard}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      className="md3-btn-filled"
                      disabled={!isDirty || saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'hotkeys' && (
              <div className="md3-card space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-md-on-surface mb-3">Перевод в реальном времени</h3>
                  <div className="space-y-4">
                    <Md3Switch
                      label="Показывать перевод при выделении"
                      checked={draft.live_preview_enabled}
                      onChange={(value) => updateDraft({ live_preview_enabled: value })}
                    />
                    <div className={draft.live_preview_enabled ? '' : 'opacity-50 pointer-events-none'}>
                      <label className="md3-label">
                        Задержка перед переводом ({draft.live_preview_debounce_ms} мс)
                      </label>
                      <input
                        type="range"
                        min={300}
                        max={2000}
                        step={50}
                        value={draft.live_preview_debounce_ms}
                        onChange={(e) =>
                          updateDraft({ live_preview_debounce_ms: Number(e.target.value) })
                        }
                        className="md3-range"
                      />
                      <p className="md3-hint">300–2000 мс. Меньше — быстрее, но больше запросов к API.</p>
                    </div>
                  </div>
                </div>

                <hr className="md3-divider" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-md-on-surface">Комбинации захвата</h3>
                    <button
                      type="button"
                      className="md3-btn-tonal"
                      disabled={hotkeyBindings.length >= 5}
                      onClick={addHotkeyBinding}
                    >
                      Добавить
                    </button>
                  </div>

                  {hotkeyBindings.map((binding, index) => (
                    <div key={index} className="rounded-xl border border-md-outline-variant/40 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-md-on-surface-variant">
                          Комбинация {index + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          {binding.mode && (
                            <span className="text-xs text-md-on-surface-variant">
                              {describeHotkeyMode(binding.mode)}
                            </span>
                          )}
                          <kbd className="md3-kbd">{describeHotkeyBinding(binding)}</kbd>
                          {hotkeyBindings.length > 1 && (
                            <button
                              type="button"
                              className="md3-btn-text text-sm"
                              onClick={() => removeHotkeyBinding(index)}
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {(
                          [
                            ['hotkey_ctrl', 'Ctrl'],
                            ['hotkey_alt', 'Alt'],
                            ['hotkey_shift', 'Shift'],
                            ['hotkey_win', 'Win']
                          ] as const
                        ).map(([key, label]) => (
                          <Md3Switch
                            key={key}
                            label={label}
                            checked={binding[key]}
                            onChange={(value) => updateHotkeyBinding(index, { [key]: value })}
                          />
                        ))}
                      </div>

                      <div>
                        <label className="md3-label">Клавиша</label>
                        <input
                          type="text"
                          maxLength={1}
                          className="md3-textfield w-24 uppercase"
                          value={binding.hotkey_key}
                          onChange={(e) =>
                            updateHotkeyBinding(index, {
                              hotkey_key: e.target.value.toUpperCase().slice(0, 1)
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="md3-label">Режим перевода</label>
                        <select
                          className="md3-select max-w-xs"
                          value={binding.mode ?? ''}
                          onChange={(e) =>
                            updateHotkeyBinding(index, {
                              mode: e.target.value ? (e.target.value as HotkeyMode) : undefined
                            })
                          }
                        >
                          <option value="">{describeHotkeyMode(undefined)}</option>
                          <option value="live">{describeHotkeyMode('live')}</option>
                          <option value="window">{describeHotkeyMode('window')}</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <hr className="md3-divider" />

                <div className="flex justify-between items-center">
                  <span className="text-sm text-md-on-surface">Захват экрана</span>
                  <kbd className="md3-kbd">{hotkeyLabel}</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-md-on-surface">Закрыть оверлей</span>
                  <kbd className="md3-kbd">Esc</kbd>
                </div>

                {(isDirty || saving) && (
                  <div className="md3-save-bar">
                    {isDirty && (
                      <span className="text-sm text-md-on-surface-variant mr-auto">
                        Есть несохранённые изменения
                      </span>
                    )}
                    <button
                      type="button"
                      className="md3-btn-text"
                      disabled={!isDirty || saving}
                      onClick={handleDiscard}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      className="md3-btn-filled"
                      disabled={!isDirty || saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'general' && (
              <div className="md3-card space-y-4">
                <Md3Switch
                  label="Запускать свёрнутым в трей"
                  checked={draft.start_minimized}
                  onChange={(v) => updateDraft({ start_minimized: v })}
                />
                <Md3Switch
                  label="Бесшовный оверлей (inpainting)"
                  checked={draft.overlay_seamless}
                  onChange={(v) => updateDraft({ overlay_seamless: v })}
                />
                <Md3Switch
                  label="Показывать оригинальный текст"
                  checked={draft.show_original}
                  onChange={(v) => updateDraft({ show_original: v })}
                />
                <Md3Switch
                  label="Копировать перевод в буфер"
                  checked={draft.copy_to_clipboard}
                  onChange={(v) => updateDraft({ copy_to_clipboard: v })}
                />

                <hr className="md3-divider" />

                <h3 className="text-sm font-medium text-md-on-surface">Внешний вид оверлея</h3>

                <div>
                  <label className="md3-label">Тема</label>
                  <select
                    className="md3-select max-w-xs"
                    value={draft.overlay_theme}
                    onChange={(e) =>
                      updateDraft({ overlay_theme: e.target.value as 'dark' | 'light' })
                    }
                  >
                    <option value="dark">Тёмная</option>
                    <option value="light">Светлая</option>
                  </select>
                </div>

                <div>
                  <label className="md3-label">Размер шрифта ({draft.overlay_font_size})</label>
                  <input
                    type="range"
                      min={11}
                      max={28}
                    step={1}
                    value={draft.overlay_font_size}
                    onChange={(e) => updateDraft({ overlay_font_size: Number(e.target.value) })}
                    className="md3-range"
                  />
                </div>

                <div>
                  <label className="md3-label">
                    Прозрачность ({Math.round(draft.overlay_alpha * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={1}
                    step={0.02}
                    value={draft.overlay_alpha}
                    onChange={(e) =>
                      updateDraft({
                        overlay_alpha: Math.round(Number(e.target.value) * 100) / 100
                      })
                    }
                    className="md3-range"
                  />
                </div>

                <div>
                  <label className="md3-label">Автозакрытие (сек, 0 = не закрывать)</label>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    className="md3-textfield w-28"
                    value={draft.overlay_auto_close}
                    onChange={(e) =>
                      updateDraft({ overlay_auto_close: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>

                {(isDirty || saving) && (
                  <div className="md3-save-bar">
                    {isDirty && (
                      <span className="text-sm text-md-on-surface-variant mr-auto">
                        Есть несохранённые изменения
                      </span>
                    )}
                    <button
                      type="button"
                      className="md3-btn-text"
                      disabled={!isDirty || saving}
                      onClick={handleDiscard}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      className="md3-btn-filled"
                      disabled={!isDirty || saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
