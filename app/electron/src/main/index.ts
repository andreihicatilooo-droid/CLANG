import { app, BrowserWindow, clipboard, ipcMain, Menu, screen, shell, Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  buildErrorBlock,
  buildLoadingBlock,
  overlayStyleFromConfig,
  type OverlayBlock
} from './overlayHelpers'
import {
  captureDisplayRegion,
  getVirtualDesktopBounds,
  resolveRegionSelection,
  type VirtualBounds
} from './displayCapture'
import { isBackendRunning, startPythonBackend, stopPythonBackend } from './pythonManager'
import {
  getConfig,
  saveConfig,
  translateRegion,
  generateTranslationPage,
  getOcrLanguages,
  oauthStart,
  oauthPoll,
  oauthStatus,
  oauthLogout,
  validateGeminiApiKey,
  validateGcpLocal,
  listGeminiModels,
  scanAiStudio
} from './backendClient'
import { registerCaptureHotkey, unregisterCaptureHotkey } from './hotkeyManager'
import {
  blocksFromTranslateResult,
  makeRegionKey,
  processCapturedRegion
} from './regionTranslate'
import type { TranslateRegionResult } from './backendClient'
import type { ScreenTranslatorConfig } from '../shared/config'
import { CONFIG_DEFAULTS, describeHotkeys } from '../shared/config'

let isQuitting = false

let mainWindow: BrowserWindow | null = null
let captureWindows: BrowserWindow[] = []
let overlayWindow: BrowserWindow | null = null
let translationPageWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayCloseTimer: ReturnType<typeof setTimeout> | null = null
let overlayPayload: { blocks: OverlayBlock[]; width: number; height: number } | null = null
let appConfig: ScreenTranslatorConfig = { ...CONFIG_DEFAULTS }
let captureVirtualBounds: VirtualBounds | null = null
let backendStopRequested = false
let previewRequestId = 0
let regionTranslateCache: {
  key: string
  result: TranslateRegionResult
  processed: Awaited<ReturnType<typeof processCapturedRegion>>
  previewOnly?: boolean
} | null = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindow?.show()
  })
}

function getOverlayAutoCloseMs(): number {
  const seconds = appConfig.overlay_auto_close ?? 30
  return seconds > 0 ? seconds * 1000 : 0
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!appConfig.start_minimized) {
      mainWindow?.show()
    }
  })
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(icon)
  rebuildTrayMenu()
  tray.setToolTip('Screen Translator')
  tray.on('click', () => mainWindow?.show())
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const hotkeyLabel = describeHotkeys(appConfig)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => mainWindow?.show() },
    {
      label: `Capture Screen (${hotkeyLabel})`,
      click: () => openCaptureWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

function captureRouteHash(
  offsetX: number,
  offsetY: number,
  livePreviewEnabled: boolean,
  livePreviewDebounceMs: number
): string {
  const lp = livePreviewEnabled ? 1 : 0
  return `capture?ox=${offsetX}&oy=${offsetY}&lp=${lp}&lpd=${livePreviewDebounceMs}`
}

function loadCaptureRoute(
  win: BrowserWindow,
  offsetX: number,
  offsetY: number,
  livePreviewOverride?: boolean
): void {
  const route = captureRouteHash(
    offsetX,
    offsetY,
    livePreviewOverride ?? appConfig.live_preview_enabled,
    appConfig.live_preview_debounce_ms
  )
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${route}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  }
}

function closeAllCaptureWindows(): void {
  captureWindows.filter((win) => !win.isDestroyed()).forEach((win) => win.close())
}

function openCaptureWindow(livePreviewOverride?: boolean): void {
  const active = captureWindows.filter((win) => !win.isDestroyed())
  if (active.length > 0) {
    active.forEach((win) => win.show())
    return
  }

  captureWindows = []
  regionTranslateCache = null
  previewRequestId = 0
  captureVirtualBounds = getVirtualDesktopBounds()
  const displays = screen.getAllDisplays()

  for (const display of displays) {
    const { x, y, width, height } = display.bounds
    const offsetX = x - captureVirtualBounds.x
    const offsetY = y - captureVirtualBounds.y

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    win.setAlwaysOnTop(true, 'screen-saver')
    loadCaptureRoute(win, offsetX, offsetY, livePreviewOverride)

    win.on('closed', () => {
      captureWindows = captureWindows.filter((w) => w !== win)
      if (captureWindows.length === 0) {
        captureVirtualBounds = null
      }
    })

    captureWindows.push(win)
  }
}

async function closeCaptureWindowAndWait(): Promise<void> {
  const wins = captureWindows.filter((win) => !win.isDestroyed())
  if (wins.length === 0) return

  await Promise.all(
    wins.map(
      (win) =>
        new Promise<void>((resolve) => {
          win.once('closed', () => setTimeout(resolve, 80))
          win.close()
        })
    )
  )
  captureWindows = []
}

function closeOverlay(): void {
  if (overlayCloseTimer) {
    clearTimeout(overlayCloseTimer)
    overlayCloseTimer = null
  }
  overlayPayload = null
  if (overlayWindow) {
    const win = overlayWindow
    overlayWindow = null
    win.close()
  }
}

function openTranslationPage(html: string): void {
  if (translationPageWindow && !translationPageWindow.isDestroyed()) {
    translationPageWindow.close()
  }
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    autoHideMenuBar: true,
    title: 'Перевод — экспериментальная страница',
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  })
  translationPageWindow = win
  win.on('closed', () => {
    if (translationPageWindow === win) translationPageWindow = null
  })
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  void win.loadURL(dataUrl)
}

async function maybeOpenTranslationPage(result: TranslateRegionResult): Promise<void> {
  if (!appConfig.experimental_enabled || !appConfig.experimental_page_generate) return
  if (appConfig.engine === 'nano_banana_pro') return
  if (result.error || !result.translated || result.seamless_image_base64) return

  try {
    const page = await generateTranslationPage(result.original ?? '', result.translated)
    if (page.html && !page.error) {
      openTranslationPage(page.html)
    }
  } catch (err) {
    console.error('[page-generate]', err)
  }
}

function replaceOverlayBlocks(blocks: OverlayBlock[]): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayPayload) return
  overlayPayload = { ...overlayPayload, blocks }
  overlayWindow.webContents.send('overlay-data', overlayPayload)
}

async function captureRegionHidden(region: Parameters<typeof captureDisplayRegion>[0]) {
  const wins = captureWindows.filter((win) => !win.isDestroyed())
  const savedOpacity = wins.map((win) => win.getOpacity())
  wins.forEach((win) => win.setOpacity(0))
  await new Promise((resolve) => setTimeout(resolve, 40))
  try {
    return await captureDisplayRegion(region)
  } finally {
    wins.forEach((win, index) => win.setOpacity(savedOpacity[index] ?? 1))
  }
}

function broadcastPreviewResult(payload: Record<string, unknown>): void {
  captureWindows
    .filter((win) => !win.isDestroyed())
    .forEach((win) => win.webContents.send('preview-result', payload))
}

function deliverOverlayData(): void {
  if (!overlayWindow || !overlayPayload) return
  overlayWindow.webContents.send('overlay-data', overlayPayload)
  overlayWindow.showInactive()
  overlayWindow.focus()
}

function showOverlay(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  blocks: OverlayBlock[]
): void {
  closeOverlay()

  const win = new BrowserWindow({
    x: screenX,
    y: screenY,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow = win
  win.setIgnoreMouseEvents(true, { forward: true })
  overlayPayload = { blocks, width, height }

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      closeOverlay()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/overlay')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }

  win.on('closed', () => {
    if (overlayWindow !== win) return
    overlayWindow = null
    if (overlayCloseTimer) {
      clearTimeout(overlayCloseTimer)
      overlayCloseTimer = null
    }
  })

  const autoCloseMs = getOverlayAutoCloseMs()
  if (autoCloseMs > 0) {
    overlayCloseTimer = setTimeout(() => closeOverlay(), autoCloseMs)
  }
}

async function loadAppConfig(): Promise<void> {
  try {
    appConfig = await getConfig()
  } catch (err) {
    console.error('[config] load failed, using defaults:', err)
    appConfig = { ...CONFIG_DEFAULTS }
  }
}

function applyConfigSideEffects(): void {
  registerCaptureHotkey(appConfig, (mode) =>
    openCaptureWindow(mode === 'live' ? true : mode === 'window' ? false : undefined)
  )
  rebuildTrayMenu()
  mainWindow?.webContents.send('config-changed', appConfig)
}

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.screentranslator.app')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    try {
      await startPythonBackend()
      await loadAppConfig()
      applyConfigSideEffects()
    } catch (err) {
      console.error('[startup] backend failed:', err)
    }

    createWindow()
    createTray()

    ipcMain.handle('get-config', async () => {
      await loadAppConfig()
      return appConfig
    })

    ipcMain.handle('save-config', async (_event, updates: Partial<ScreenTranslatorConfig>) => {
      appConfig = await saveConfig(updates)
      applyConfigSideEffects()
      return appConfig
    })

    ipcMain.handle('get-ocr-languages', async () => getOcrLanguages())
    ipcMain.handle('oauth-start', async () => oauthStart())
    ipcMain.handle('oauth-poll', async () => oauthPoll())
    ipcMain.handle('oauth-status', async () => oauthStatus())
    ipcMain.handle('oauth-logout', async () => oauthLogout())
    ipcMain.handle('validate-gemini-api-key', async (_event, apiKey: string, model?: string) =>
      validateGeminiApiKey(apiKey, model)
    )
    ipcMain.handle('validate-gcp-local', async (_event, url: string, apiKey?: string) =>
      validateGcpLocal(url, apiKey)
    )
    ipcMain.handle('list-gemini-models', async (_event, apiKey: string) =>
      listGeminiModels(apiKey)
    )
    ipcMain.handle(
      'scan-ai-studio',
      async (_event, apiKey: string, currentModel?: string, modelAuto?: boolean) =>
        scanAiStudio(apiKey, currentModel, modelAuto ?? true)
    )
    ipcMain.handle('open-external', async (_event, url: string) => {
      await shell.openExternal(url)
    })

    ipcMain.on('close-capture', () => {
      regionTranslateCache = null
      closeAllCaptureWindows()
    })

    screen.on('display-metrics-changed', () => {
      closeAllCaptureWindows()
    })

    ipcMain.on('close-overlay', () => {
      closeOverlay()
    })

    ipcMain.on('overlay-ready', () => {
      deliverOverlayData()
    })

    ipcMain.on('preview-region', async (_event, { x, y, width, height, seq }) => {
      const requestId = ++previewRequestId
      const virtualBounds = captureVirtualBounds ?? getVirtualDesktopBounds()
      const region = resolveRegionSelection(virtualBounds, x, y, width, height)
      const wins = captureWindows.filter((win) => !win.isDestroyed())
      if (wins.length === 0) return

      broadcastPreviewResult({ seq, loading: true })

      if (appConfig.engine === 'nano_banana_pro') {
        broadcastPreviewResult({
          seq,
          loading: false,
          translated: 'Nano Banana Pro: отпустите выделение для генерации страницы',
          original: null,
          error: null
        })
        return
      }

      try {
        const captured = await captureRegionHidden(region)
        const processed = await processCapturedRegion(captured, { fast: true })
        const result = await translateRegion(processed.imageBase64, { fast: true })

        if (requestId !== previewRequestId) return

        regionTranslateCache = {
          key: makeRegionKey(x, y, width, height),
          result,
          processed,
          previewOnly: true
        }

        broadcastPreviewResult({
          seq,
          loading: false,
          translated: result.translated,
          original: result.original,
          error: result.error
        })
      } catch (err) {
        console.error('[preview-region]', err)
        if (requestId !== previewRequestId) return
        broadcastPreviewResult({
          seq,
          loading: false,
          error: 'Ошибка перевода'
        })
      }
    })

    ipcMain.on('process-region', async (_event, { x, y, width, height }) => {
      const virtualBounds = captureVirtualBounds ?? getVirtualDesktopBounds()
      const region = resolveRegionSelection(virtualBounds, x, y, width, height)
      const { globalX, globalY } = region
      const overlayStyle = overlayStyleFromConfig(appConfig)
      const regionKey = makeRegionKey(x, y, width, height)
      const cached =
        regionTranslateCache?.key === regionKey && !regionTranslateCache.previewOnly
          ? regionTranslateCache
          : null

      await closeCaptureWindowAndWait()
      regionTranslateCache = null

      showOverlay(
        globalX,
        globalY,
        width,
        height,
        buildLoadingBlock(width, height, 'Перевод…', overlayStyle)
      )

      try {
        let result: TranslateRegionResult
        let processed: Awaited<ReturnType<typeof processCapturedRegion>>

        if (cached && !cached.result.error) {
          result = cached.result
          processed = cached.processed
        } else {
          const captured = await captureDisplayRegion(region)
          processed = await processCapturedRegion(captured)
          result = await translateRegion(processed.imageBase64)
        }

        if (appConfig.copy_to_clipboard && result.translated) {
          clipboard.writeText(result.translated)
        }

        const blocks = blocksFromTranslateResult(
          result,
          processed.image,
          processed.safeCropW,
          processed.safeCropH,
          processed.scaleFactor,
          width,
          height,
          appConfig,
          overlayStyle
        )

        replaceOverlayBlocks(blocks)
        void maybeOpenTranslationPage(result)
      } catch (err) {
        console.error(err)
        replaceOverlayBlocks(
          buildErrorBlock(width, height, 'Ошибка перевода', overlayStyle)
        )
      }
    })

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  unregisterCaptureHotkey()
  if (isBackendRunning() && !backendStopRequested) {
    event.preventDefault()
    backendStopRequested = true
    void stopPythonBackend().finally(() => app.quit())
  }
})
