import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ScreenTranslatorConfig } from '../shared/config'

const api = {
  getConfig: (): Promise<ScreenTranslatorConfig> => ipcRenderer.invoke('get-config'),
  saveConfig: (updates: Partial<ScreenTranslatorConfig>): Promise<ScreenTranslatorConfig> =>
    ipcRenderer.invoke('save-config', updates),
  getOcrLanguages: (): Promise<string[]> => ipcRenderer.invoke('get-ocr-languages'),
  oauthStart: (): Promise<{ started: boolean; message?: string }> =>
    ipcRenderer.invoke('oauth-start'),
  oauthPoll: (): Promise<{
    done: boolean
    success?: boolean
    message?: string
    authorized: boolean
  }> => ipcRenderer.invoke('oauth-poll'),
  oauthStatus: (): Promise<{ authorized: boolean }> => ipcRenderer.invoke('oauth-status'),
  oauthLogout: (): Promise<{ authorized: boolean }> => ipcRenderer.invoke('oauth-logout'),
  onConfigChanged: (callback: (config: ScreenTranslatorConfig) => void): (() => void) => {
    const handler = (_event: unknown, config: ScreenTranslatorConfig): void => callback(config)
    ipcRenderer.on('config-changed', handler)
    return () => ipcRenderer.removeListener('config-changed', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error define in dts
  window.electron = electronAPI
  // @ts-expect-error define in dts
  window.api = api
}
