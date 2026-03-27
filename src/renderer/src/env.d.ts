/// <reference types="vite/client" />

interface SaveImageResult {
  success: boolean
  filePath: string | null
  reason?: string
}

interface Window {
  electronAPI: {
    readClipboardImage: () => Promise<string | null>
    writeClipboardImage: (dataUrl: string) => Promise<void>
    saveCanvasImage: (dataUrl: string) => Promise<SaveImageResult>
  }
}
