/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    readClipboardImage: () => Promise<string | null>
    writeClipboardImage: (dataUrl: string) => Promise<void>
  }
}
