import { appendFileSync } from 'fs'
import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import screenshot from 'screenshot-desktop'
import Jimp from 'jimp'
import Tesseract from 'tesseract.js'
import { translate } from '@vitalets/google-translate-api'
import {
  buildErrorBlock,
  buildFullRegionBlock,
  buildOverlayBlocks,
  extractOcrLines,
  scaleBlocksToDip,
  type OverlayBlock
} from './overlayHelpers'

let isQuitting = false

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let overlayDismissRegistered = false
let overlayCloseTimer: ReturnType<typeof setTimeout> | null = null
let overlayPayload: { blocks: OverlayBlock[]; width: number; height: number } | null = null

const OVERLAY_AUTO_CLOSE_MS = 30_000
const DEBUG_LOG_PATH = resolve(__dirname, '../../../debug-3dad4a.log')

// #region agent log
function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'post-fix'
): void {
  const entry = {
    sessionId: '3dad4a',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now()
  }
  try {
    appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`)
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7386/ingest/9a727f05-8ed1-4b84-8329-9c0d9f893225', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3dad4a' },
    body: JSON.stringify(entry)
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
  tray.setToolTip('Screen Translator (overlay-v3)')
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
  overlayPayload = null
  unregisterOverlayDismiss()
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
}

function deliverOverlayData(): void {
  if (!overlayWindow || !overlayPayload) return
  // #region agent log
  debugLog('index.ts:deliverOverlayData', 'overlay-data IPC send', {
    blockCount: overlayPayload.blocks.length,
    width: overlayPayload.width,
    height: overlayPayload.height,
    textPreview: overlayPayload.blocks[0]?.text?.slice(0, 80) ?? ''
  }, 'A')
  // #endregion
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
  // #region agent log
  debugLog('index.ts:startup', 'app ready', { buildMarker: 'overlay-v3' }, 'A')
  // #endregion

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

  ipcMain.on('overlay-ready', () => {
    // #region agent log
    debugLog('index.ts:overlay-ready', 'renderer ready handshake', {}, 'A')
    // #endregion
    deliverOverlayData()
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

      const scaleFactor = primaryDisplay.scaleFactor
      const cropX = Math.round(x * scaleFactor)
      const cropY = Math.round(y * scaleFactor)
      const cropW = Math.round(width * scaleFactor)
      const cropH = Math.round(height * scaleFactor)

      image.crop(cropX, cropY, cropW, cropH)
      const croppedBuffer = await image.getBufferAsync(Jimp.MIME_PNG)

      const worker = await Tesseract.createWorker('eng')
      let data
      try {
        ;({ data } = await worker.recognize(croppedBuffer, {}, { text: true, blocks: true }))
      } finally {
        await worker.terminate()
      }
      const lines = extractOcrLines(data)
      const trimmedText = data.text.trim()

      // #region agent log
      debugLog('index.ts:process-region', 'OCR done', {
        trimmedLen: trimmedText.length,
        lineCount: lines.length,
        blockCount: data.blocks?.length ?? 0,
        textPreview: trimmedText.slice(0, 80),
        scaleFactor
      }, 'B')
      // #endregion

      if (!trimmedText) {
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

      let blocks =
        lines.length > 0
          ? buildOverlayBlocks(lines, res.text, image)
          : buildFullRegionBlock(cropW, cropH, res.text, image)
      blocks = scaleBlocksToDip(blocks, scaleFactor)

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
