declare global {
  interface Window {
    electronAPI: {
      readClipboardImage: () => Promise<string | null>
      writeClipboardImage: (dataUrl: string) => Promise<void>
    }
  }
}
