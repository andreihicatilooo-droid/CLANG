import { app, shell, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import screenshot from 'screenshot-desktop'
import Jimp from 'jimp'
import Tesseract from 'tesseract.js'
import { translate } from '@vitalets/google-translate-api'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let resultWindow: BrowserWindow | null = null
let tray: Tray | null = null

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
    if (!app.isQuitting) {
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

function createTray() {
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => mainWindow?.show() },
    { label: 'Capture Screen', accelerator: 'CommandOrControl+Shift+E', click: () => openCaptureWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      app.isQuitting = true
      app.quit()
    }}
  ])
  tray.setToolTip('Screen Translator')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.show())
}

function openCaptureWindow() {
  if (captureWindow) {
    captureWindow.show()
    return
  }

  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  captureWindow = new BrowserWindow({
    width, height, x, y,
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

  captureWindow.on('closed', () => captureWindow = null)
}

function openResultWindow(x: number, y: number) {
  if (resultWindow) {
    resultWindow.setBounds({ x, y, width: 350, height: 250 })
    resultWindow.show()
    return
  }

  resultWindow = new BrowserWindow({
    width: 350,
    height: 250,
    x, y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  resultWindow.on('blur', () => {
    resultWindow?.close()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    resultWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/result')
  } else {
    resultWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'result' })
  }

  resultWindow.on('closed', () => resultWindow = null)
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

  ipcMain.on('process-region', async (_event, { x, y, width, height }) => {
    if (captureWindow) captureWindow.close()

    const resultX = x
    const resultY = y + height + 10
    openResultWindow(resultX, resultY)
    resultWindow?.webContents.send('translation-loading')

    try {
      const imgBuffer = await screenshot()
      
      const image = await Jimp.read(imgBuffer)
      image.crop(x, y, width, height)
      const croppedBuffer = await image.getBufferAsync(Jimp.MIME_PNG)

      const { data: { text } } = await Tesseract.recognize(croppedBuffer, 'eng')

      const trimmedText = text.trim()
      if (!trimmedText) {
        resultWindow?.webContents.send('translation-result', { error: 'No text detected in this area.' })
        return
      }

      const res = await translate(trimmedText, { to: 'ru' })

      resultWindow?.webContents.send('translation-result', {
        original: trimmedText,
        translated: res.text
      })
    } catch (err) {
      console.error(err)
      resultWindow?.webContents.send('translation-result', { error: 'Failed to translate: ' + String(err) })
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

