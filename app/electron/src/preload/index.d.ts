import { ElectronAPI } from '@electron-toolkit/preload'
import type { ScreenTranslatorConfig } from '../shared/config'

export interface ScreenTranslatorAPI {
  getConfig: () => Promise<ScreenTranslatorConfig>
  saveConfig: (updates: Partial<ScreenTranslatorConfig>) => Promise<ScreenTranslatorConfig>
  getOcrLanguages: () => Promise<string[]>
  oauthStart: () => Promise<{ started: boolean; message?: string }>
  oauthPoll: () => Promise<{
    done: boolean
    success?: boolean
    message?: string
    authorized: boolean
  }>
  oauthStatus: () => Promise<{ authorized: boolean }>
  oauthLogout: () => Promise<{ authorized: boolean }>
  validateGeminiApiKey: (
    apiKey: string,
    model?: string
  ) => Promise<{ valid: boolean; message: string }>
  listGeminiModels: (
    apiKey: string
  ) => Promise<{ models: { id: string; label: string }[]; recommended: string; error: string | null }>
  scanAiStudio: (
    apiKey: string,
    currentModel?: string,
    modelAuto?: boolean
  ) => Promise<{
    valid: boolean
    models: { id: string; label: string }[]
    recommended: string
    selected: string
    message: string
  }>
  openExternal: (url: string) => Promise<void>
  onConfigChanged: (callback: (config: ScreenTranslatorConfig) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ScreenTranslatorAPI
  }
}
