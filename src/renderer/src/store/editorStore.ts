import { create } from 'zustand'

export type Tool = 'select' | 'rect' | 'arrow' | 'number' | 'text' | 'blur'
export type ToastType = 'success' | 'error' | 'info'
export type ArrowRouting = 'straight' | 'elbow'

export interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

interface EditorStore {
  activeTool: Tool
  setActiveTool: (tool: Tool) => void
  arrowRouting: ArrowRouting
  setArrowRouting: (routing: ArrowRouting) => void
  showShortcuts: boolean
  setShowShortcuts: (open: boolean) => void
  toggleShortcuts: () => void
  backgroundDataUrl: string | null
  setBackgroundDataUrl: (url: string | null) => void
  canUndo: boolean
  canRedo: boolean
  setHistoryState: (state: { canUndo: boolean; canRedo: boolean }) => void
  toasts: ToastMessage[]
  showToast: (message: string, type?: ToastType, durationMs?: number) => void
  removeToast: (id: number) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  arrowRouting: 'straight',
  setArrowRouting: (routing) => set({ arrowRouting: routing }),
  showShortcuts: false,
  setShowShortcuts: (open) => set({ showShortcuts: open }),
  toggleShortcuts: () => set((state) => ({ showShortcuts: !state.showShortcuts })),
  backgroundDataUrl: null,
  setBackgroundDataUrl: (url) => set({ backgroundDataUrl: url }),
  canUndo: false,
  canRedo: false,
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
  toasts: [],
  showToast: (message, type = 'info', durationMs = 2200) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }))

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id)
      }))
    }, durationMs)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    }))
}))
