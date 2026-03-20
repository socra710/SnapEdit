import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:read-image'),
  writeClipboardImage: (dataUrl: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write-image', dataUrl),
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
