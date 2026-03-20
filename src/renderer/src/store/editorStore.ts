import { create } from 'zustand'

export type Tool = 'select' | 'rect' | 'arrow' | 'number' | 'text' | 'blur'

interface EditorStore {
  activeTool: Tool
  setActiveTool: (tool: Tool) => void
  backgroundDataUrl: string | null
  setBackgroundDataUrl: (url: string | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  backgroundDataUrl: null,
  setBackgroundDataUrl: (url) => set({ backgroundDataUrl: url }),
}))
