import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import screenshot from 'screenshot-desktop'
import Jimp from 'jimp'
import Tesseract from 'tesseract.js'
import { translate } from '@vitalets/google-translate-api'
import {
  buildErrorBlock,
  buildOverlayBlocks,
  extractOcrLines,
  type OverlayBlock
} from './overlayHelpers'

let isQuitting = false

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayDismissRegistered = false
let overlayCloseTimer: ReturnType<typeof setTimeout> | null = null

const OVERLAY_AUTO_CLOSE_MS = 30_000

// #region agent log
function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
): void {
  fetch('http://127.0.0.1:7386/ingest/9a727f05-8ed1-4b84-8329-9c0d9f893225', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3dad4a' },
    body: JSON.stringify({
      sessionId: '3dad4a',
      runId: 'pre-fix',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {})
}
// #endregion

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

  mainWindow.on('ready-to-show', () => mainWindow?.show())
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
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => mainWindow?.show() },
    {
      label: 'Capture Screen',
      accelerator: 'CommandOrControl+Shift+E',
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
  tray.setToolTip('Screen Translator')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.show())
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
  unregisterOverlayDismiss()
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
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

  const sendData = (): void => {
    // #region agent log
    debugLog('index.ts:sendData', 'overlay-data IPC send', {
      blockCount: blocks.length,
      width,
      height,
      screenX,
      screenY
    }, 'A')
    // #endregion
    overlayWindow?.webContents.send('overlay-data', { blocks, width, height })
    overlayWindow?.showInactive()
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/overlay')
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }
  overlayWindow.webContents.once('did-finish-load', sendData)

  overlayWindow.on('closed', () => {
    overlayWindow = null
    unregisterOverlayDismiss()
    if (overlayCloseTimer) {
      clearTimeout(overlayCloseTimer)
      overlayCloseTimer = null
    }
  })

  registerOverlayDismiss()
  overlayCloseTimer = setTimeout(() => closeOverlay(), OVERLAY_AUTO_CLOSE_MS)
}

function regionToScreen(x: number, y: number): { screenX: number; screenY: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  return {
    screenX: primaryDisplay.bounds.x + x,
    screenY: primaryDisplay.bounds.y + y
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()

  globalShortcut.register('CommandOrControl+Shift+E', () => {
    openCaptureWindow()
  })

  ipcMain.on('close-capture', () => {
    if (captureWindow) captureWindow.close()
  })

  ipcMain.on('close-overlay', () => {
    closeOverlay()
  })

  // #region agent log
  ipcMain.on('debug-log', (_event, payload: {
    location: string
    message: string
    data: Record<string, unknown>
    hypothesisId: string
  }) => {
    debugLog(payload.location, payload.message, payload.data, payload.hypothesisId)
  })
  // #endregion

  ipcMain.on('process-region', async (_event, { x, y, width, height }) => {
    if (captureWindow) captureWindow.close()

    const { screenX, screenY } = regionToScreen(x, y)
    const primaryDisplay = screen.getPrimaryDisplay()

    // #region agent log
    debugLog('index.ts:process-region', 'region received', {
      x,
      y,
      width,
      height,
      screenX,
      screenY,
      scaleFactor: primaryDisplay.scaleFactor,
      displayBounds: primaryDisplay.bounds,
      displaySize: primaryDisplay.size
    }, 'D')
    // #endregion

    try {
      const imgBuffer = await screenshot()
      const image = await Jimp.read(imgBuffer)

      // #region agent log
      debugLog('index.ts:process-region', 'screenshot loaded', {
        imgW: image.bitmap.width,
        imgH: image.bitmap.height,
        cropX: x,
        cropY: y,
        cropW: width,
        cropH: height
      }, 'D')
      // #endregion

      image.crop(x, y, width, height)
      const croppedBuffer = await image.getBufferAsync(Jimp.MIME_PNG)

      const { data } = await Tesseract.recognize(croppedBuffer, 'eng')
      const lines = extractOcrLines(data)
      const trimmedText = data.text.trim()

      // #region agent log
      debugLog('index.ts:process-region', 'OCR done', {
        trimmedLen: trimmedText.length,
        lineCount: lines.length,
        textPreview: trimmedText.slice(0, 80)
      }, 'B')
      // #endregion

      if (!trimmedText || lines.length === 0) {
        showOverlay(
          screenX,
          screenY,
          width,
          height,
          buildErrorBlock(width, height, 'Текст не найден в этой области')
        )
        return
      }

      const res = await translate(trimmedText, { to: 'ru' })

      // #region agent log
      debugLog('index.ts:process-region', 'translate done', {
        translatedLen: res.text.length,
        translatedPreview: res.text.slice(0, 80)
      }, 'C')
      // #endregion

      const blocks = buildOverlayBlocks(lines, res.text, image)

      // #region agent log
      debugLog('index.ts:process-region', 'blocks built', { blockCount: blocks.length }, 'E')
      // #endregion

      showOverlay(screenX, screenY, width, height, blocks)
    } catch (err) {
      // #region agent log
      debugLog('index.ts:process-region', 'pipeline error', {
        error: err instanceof Error ? err.message : String(err)
      }, 'C')
      // #endregion
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
  globalShortcut.unregisterAll()
})
