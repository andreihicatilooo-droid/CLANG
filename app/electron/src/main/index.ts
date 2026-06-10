import { app, BrowserWindow, clipboard, ipcMain, screen, Tray, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import screenshot from 'screenshot-desktop'
import Jimp from 'jimp'
import {
  buildErrorBlock,
  buildFullRegionBlock,
  buildOverlayBlocks,
  buildSeamlessImageBlock,
  scaleBlocksToDip,
  type OverlayBlock
} from './overlayHelpers'
import { startPythonBackend, stopPythonBackend } from './pythonManager'
import {
  getConfig,
  saveConfig,
  translateRegion,
  getOcrLanguages,
  oauthStart,
  oauthPoll,
  oauthStatus,
  oauthLogout
} from './backendClient'
import { registerCaptureHotkey, unregisterCaptureHotkey } from './hotkeyManager'
import type { ScreenTranslatorConfig } from '../shared/config'
import { CONFIG_DEFAULTS, describeHotkey } from '../shared/config'

let isQuitting = false

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayDismissRegistered = false
let overlayCloseTimer: ReturnType<typeof setTimeout> | null = null
let overlayPayload: { blocks: OverlayBlock[]; width: number; height: number } | null = null
let appConfig: ScreenTranslatorConfig = { ...CONFIG_DEFAULTS }

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
  const hotkeyLabel = describeHotkey(appConfig)
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

function openCaptureWindow(): void {
  if (captureWindow) {
    captureWindow.show()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  captureWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/capture')
  } else {
    captureWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'capture' })
  }

  captureWindow.on('closed', () => {
    captureWindow = null
  })
}

function registerOverlayDismiss(): void {
  if (overlayDismissRegistered) return
  globalShortcut.register('Escape', () => closeOverlay())
  overlayDismissRegistered = true
}

function unregisterOverlayDismiss(): void {
  if (!overlayDismissRegistered) return
  globalShortcut.unregister('Escape')
  overlayDismissRegistered = false
}

function closeOverlay(): void {
  if (overlayCloseTimer) {
    clearTimeout(overlayCloseTimer)
    overlayCloseTimer = null
  }
  overlayPayload = null
  unregisterOverlayDismiss()
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
}

function deliverOverlayData(): void {
  if (!overlayWindow || !overlayPayload) return
  overlayWindow.webContents.send('overlay-data', overlayPayload)
  overlayWindow.showInactive()
}

function showOverlay(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  blocks: OverlayBlock[]
): void {
  closeOverlay()

  overlayWindow = new BrowserWindow({
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
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayPayload = { blocks, width, height }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/overlay')
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
    unregisterOverlayDismiss()
    if (overlayCloseTimer) {
      clearTimeout(overlayCloseTimer)
      overlayCloseTimer = null
    }
  })

  registerOverlayDismiss()
  const autoCloseMs = getOverlayAutoCloseMs()
  if (autoCloseMs > 0) {
    overlayCloseTimer = setTimeout(() => closeOverlay(), autoCloseMs)
  }
}

function regionToScreen(x: number, y: number): { screenX: number; screenY: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  return {
    screenX: primaryDisplay.bounds.x + x,
    screenY: primaryDisplay.bounds.y + y
  }
}

async function reloadAppConfig(): Promise<void> {
  try {
    appConfig = await getConfig()
  } catch (err) {
    console.error('[config] load failed, using defaults:', err)
    appConfig = { ...CONFIG_DEFAULTS }
  }
  registerCaptureHotkey(appConfig, () => openCaptureWindow())
  rebuildTrayMenu()
  mainWindow?.webContents.send('config-changed', appConfig)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.screentranslator.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    await startPythonBackend()
    await reloadAppConfig()
  } catch (err) {
    console.error('[startup] backend failed:', err)
  }

  createWindow()
  createTray()

  ipcMain.handle('get-config', async () => {
    await reloadAppConfig()
    return appConfig
  })

  ipcMain.handle('save-config', async (_event, updates: Partial<ScreenTranslatorConfig>) => {
    appConfig = await saveConfig(updates)
    registerCaptureHotkey(appConfig, () => openCaptureWindow())
    rebuildTrayMenu()
    mainWindow?.webContents.send('config-changed', appConfig)
    return appConfig
  })

  ipcMain.handle('get-ocr-languages', async () => getOcrLanguages())
  ipcMain.handle('oauth-start', async () => oauthStart())
  ipcMain.handle('oauth-poll', async () => oauthPoll())
  ipcMain.handle('oauth-status', async () => oauthStatus())
  ipcMain.handle('oauth-logout', async () => oauthLogout())

  ipcMain.on('close-capture', () => {
    if (captureWindow) captureWindow.close()
  })

  ipcMain.on('close-overlay', () => {
    closeOverlay()
  })

  ipcMain.on('overlay-ready', () => {
    deliverOverlayData()
  })

  ipcMain.on('process-region', async (_event, { x, y, width, height }) => {
    if (captureWindow) captureWindow.close()

    const { screenX, screenY } = regionToScreen(x, y)
    const primaryDisplay = screen.getPrimaryDisplay()

    try {
      const imgBuffer = await screenshot()
      const image = await Jimp.read(imgBuffer)

      const scaleFactor = primaryDisplay.scaleFactor
      const cropX = Math.round(x * scaleFactor)
      const cropY = Math.round(y * scaleFactor)
      const cropW = Math.round(width * scaleFactor)
      const cropH = Math.round(height * scaleFactor)

      image.crop(cropX, cropY, cropW, cropH)
      const croppedBuffer = await image.getBufferAsync(Jimp.MIME_PNG)
      const imageBase64 = croppedBuffer.toString('base64')

      const result = await translateRegion(imageBase64)

      if (result.error) {
        showOverlay(
          screenX,
          screenY,
          width,
          height,
          buildErrorBlock(width, height, result.error)
        )
        return
      }

      if (result.seamless_image_base64) {
        const dataUrl = `data:image/png;base64,${result.seamless_image_base64}`
        const blocks = scaleBlocksToDip(
          buildSeamlessImageBlock(cropW, cropH, dataUrl),
          scaleFactor
        )
        showOverlay(screenX, screenY, width, height, blocks)
        return
      }

      if (appConfig.copy_to_clipboard && result.translated) {
        clipboard.writeText(result.translated)
      }

      const displayText = appConfig.show_original && result.original
        ? `${result.original}\n\n──\n${result.translated}`
        : result.translated

      let blocks =
        result.lines.length > 0
          ? buildOverlayBlocks(result.lines, displayText, image)
          : buildFullRegionBlock(cropW, cropH, displayText, image)
      blocks = scaleBlocksToDip(blocks, scaleFactor)

      showOverlay(screenX, screenY, width, height, blocks)
    } catch (err) {
      console.error(err)
      showOverlay(
        screenX,
        screenY,
        width,
        height,
        buildErrorBlock(width, height, 'Ошибка перевода')
      )
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  unregisterCaptureHotkey()
  globalShortcut.unregisterAll()
  stopPythonBackend()
})
