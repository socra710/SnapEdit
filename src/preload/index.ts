import { contextBridge, ipcRenderer } from 'electron'

interface SaveImageResult {
  success: boolean
  filePath: string | null
  reason?: string
}

const electronAPI = {
  readClipboardImage: (): Promise<string | null> => ipcRenderer.invoke('clipboard:read-image'),
  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),
  saveCanvasImage: (dataUrl: string): Promise<SaveImageResult> =>
    ipcRenderer.invoke('canvas:save-image', dataUrl)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electronAPI = electronAPI
}
