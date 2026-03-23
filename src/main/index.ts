import { app, shell, BrowserWindow, ipcMain, clipboard, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

let sessionDataPath = ''

const setupAutoUpdater = (): void => {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No updates available')
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] Failed to check/install update:', error)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '업데이트 준비 완료',
      message: '새 버전이 다운로드되었습니다. 지금 재시작할까요?',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1
    })

    if (result.response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[updater] checkForUpdatesAndNotify failed:', error)
  })
}

const isPngDataUrl = (value: string): boolean => {
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
}

const validateClipboardImageDataUrl = (dataUrl: unknown): dataUrl is string => {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return false
  }
  if (dataUrl.length > 15 * 1024 * 1024) {
    return false
  }
  return isPngDataUrl(dataUrl)
}

function createWindow(): void {
  // Create the browser window.
  const logoPath = join(__dirname, '../../resources/logo.png')
  const icon = nativeImage.createFromPath(logoPath)
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    title: 'SnapEdit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((error) => {
      console.error('[main] Failed to load renderer URL:', error)
    })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((error) => {
      console.error('[main] Failed to load renderer file:', error)
    })
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  sessionDataPath = join(app.getPath('temp'), 'SnapEdit', 'session')
  mkdirSync(sessionDataPath, { recursive: true })
  app.setPath('sessionData', sessionDataPath)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Clipboard: 이미지 읽기 — PNG buffer를 base64 dataURL로 반환
  ipcMain.handle('clipboard:read-image', () => {
    try {
      const img = clipboard.readImage()
      if (img.isEmpty()) return null
      const base64 = img.toPNG().toString('base64')
      return `data:image/png;base64,${base64}`
    } catch (error) {
      console.error('[main] clipboard:read-image failed:', error)
      return null
    }
  })

  // Clipboard: 이미지 쓰기 — dataURL을 NativeImage로 변환 후 클립보드에 복사
  ipcMain.handle('clipboard:write-image', (_event, dataUrl: unknown) => {
    try {
      if (!validateClipboardImageDataUrl(dataUrl)) {
        throw new Error('Invalid clipboard payload: only PNG dataURL is supported')
      }
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) {
        throw new Error('Invalid clipboard payload: image decode failed')
      }
      clipboard.writeImage(img)
    } catch (error) {
      console.error('[main] clipboard:write-image failed:', error)
      throw error
    }
  })

  process.on('uncaughtException', (error) => {
    console.error('[main] uncaughtException:', error)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason)
  })

  createWindow()

  if (app.isPackaged) {
    setupAutoUpdater()
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (!sessionDataPath) return
  try {
    rmSync(sessionDataPath, { recursive: true, force: true })
  } catch (error) {
    console.error('[main] Failed to cleanup session data:', error)
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
