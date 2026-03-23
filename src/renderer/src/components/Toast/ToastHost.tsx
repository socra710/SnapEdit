import { useEditorStore } from '@renderer/store/editorStore'

const typeClassMap = {
  success: 'bg-emerald-500/90 border-emerald-300/40',
  error: 'bg-rose-500/90 border-rose-300/40',
  info: 'bg-zinc-700/90 border-white/15'
}

export default function ToastHost() {
  const toasts = useEditorStore((s) => s.toasts)
  const removeToast = useEditorStore((s) => s.removeToast)

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => removeToast(toast.id)}
          className={[
            'pointer-events-auto min-w-64 max-w-[80vw] px-3 py-2 rounded-lg border text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur',
            typeClassMap[toast.type]
          ].join(' ')}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}
