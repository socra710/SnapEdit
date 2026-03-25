import { useEditorStore, type Tool } from '@renderer/store/editorStore'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

interface ToolDef {
  id: Tool
  label: string
  title: string
  icon: React.ReactNode
}

const tools: ToolDef[] = [
  {
    id: 'select',
    label: '선택',
    title: '선택 (V)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 15l-5.879 5.879A1 1 0 017 20.121V4.879A1 1 0 018.536 4l11 7a1 1 0 01-.658 1.832L15 15z"
        />
      </svg>
    )
  },
  {
    id: 'rect',
    label: '사각형',
    title: '빨간 사각형 (R)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          ry="3"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    id: 'arrow',
    label: '화살표',
    title: '화살표 (A)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M5 12h14M13 6l6 6-6 6"
        />
      </svg>
    )
  },
  {
    id: 'number',
    label: '번호',
    title: '스텝 번호 (N) / 번호 초기화 (Shift+N)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          1
        </text>
      </svg>
    )
  },
  {
    id: 'text',
    label: '텍스트',
    title: '텍스트 (T)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M4 6h16M12 6v12M8 18h8"
        />
      </svg>
    )
  },
  {
    id: 'blur',
    label: '블러',
    title: '블러 (B)',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
        />
      </svg>
    )
  }
]

export default function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const canUndo = useEditorStore((s) => s.canUndo)
  const canRedo = useEditorStore((s) => s.canRedo)
  const showShortcuts = useEditorStore((s) => s.showShortcuts)
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const activeToolLabel = useMemo(
    () => tools.find((tool) => tool.id === activeTool)?.label ?? '선택',
    [activeTool]
  )

  useEffect(() => {
    const handleCopySuccess = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    }

    const handleCopyFailed = () => {
      setCopied(false)
    }

    window.addEventListener('snapedit:copy-success', handleCopySuccess)
    window.addEventListener('snapedit:copy-failed', handleCopyFailed)
    return () => {
      window.removeEventListener('snapedit:copy-success', handleCopySuccess)
      window.removeEventListener('snapedit:copy-failed', handleCopyFailed)
    }
  }, [])

  const handleSelectImageFile = () => {
    fileInputRef.current?.click()
  }

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      useEditorStore.getState().showToast('이미지 파일만 삽입할 수 있습니다.', 'error')
      return
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          if (typeof result === 'string') {
            resolve(result)
          } else {
            reject(new Error('파일 읽기 결과가 비어 있습니다.'))
          }
        }
        reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'))
        reader.readAsDataURL(file)
      })

      window.dispatchEvent(new CustomEvent('snapedit:insert-image-dataurl', { detail: dataUrl }))
    } catch {
      useEditorStore.getState().showToast('이미지를 불러오지 못했습니다.', 'error')
    }
  }

  useEffect(() => {
    const toolbarEl = toolbarRef.current
    if (!toolbarEl) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        toolbarEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      )

      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    toolbarEl.addEventListener('keydown', handleKeyDown)
    return () => toolbarEl.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="편집 도구"
        className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/8 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileChange}
        />

        <button
          title="되돌리기 (Ctrl+Z)"
          aria-label="되돌리기"
          disabled={!canUndo}
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
          }}
          className={[
            'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            canUndo
              ? 'text-zinc-300 hover:text-white hover:bg-white/8'
              : 'text-zinc-600 cursor-not-allowed opacity-50'
          ].join(' ')}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M9 14L4 9m0 0l5-5M4 9h10a6 6 0 016 6v1"
            />
          </svg>
          <span className="leading-none">Undo</span>
        </button>

        <button
          title="다시 실행 (Ctrl+Y)"
          aria-label="다시 실행"
          disabled={!canRedo}
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
          }}
          className={[
            'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            canRedo
              ? 'text-zinc-300 hover:text-white hover:bg-white/8'
              : 'text-zinc-600 cursor-not-allowed opacity-50'
          ].join(' ')}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 14l5-5m0 0l-5-5m5 5H10a6 6 0 00-6 6v1"
            />
          </svg>
          <span className="leading-none">Redo</span>
        </button>

        <div className="w-px h-8 bg-white/10 mx-1" />

        {tools.map((tool) => {
          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={isActive}
              onClick={() => setActiveTool(tool.id)}
              className={[
                'flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
                isActive
                  ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/8'
              ].join(' ')}
            >
              {tool.icon}
              <span className="leading-none">{tool.label}</span>
            </button>
          )
        })}

        {/* 구분선 */}
        <div className="w-px h-8 bg-white/10 mx-1" />

        <div className="px-2 text-xs text-zinc-300 whitespace-nowrap" aria-live="polite">
          현재 도구: {activeToolLabel}
        </div>

        {/* 구분선 */}
        <div className="w-px h-8 bg-white/10 mx-1" />

        {/* Ctrl+C 복사 버튼 */}
        <button
          title="클립보드에 복사 (Ctrl+C)"
          aria-label="클립보드에 복사"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
          }}
          className={[
            'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            copied
              ? 'bg-emerald-500/25 text-emerald-200'
              : 'text-zinc-400 hover:text-white hover:bg-white/8'
          ].join(' ')}
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
          <span className="leading-none whitespace-nowrap">{copied ? '복사됨' : '복사'}</span>
        </button>

        <button
          title="이미지 파일 삽입"
          aria-label="이미지 파일 삽입"
          onClick={handleSelectImageFile}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap text-zinc-400 hover:text-white hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-9-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="leading-none whitespace-nowrap">이미지</span>
        </button>

        <button
          title="완전 초기화 (Ctrl+Shift+R)"
          aria-label="완전 초기화"
          onClick={() => {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'R', ctrlKey: true, shiftKey: true })
            )
          }}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        >
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M4 4v6h6M20 20v-6h-6M20 10a8 8 0 00-13.657-5.657L4 6M4 14a8 8 0 0013.657 5.657L20 18"
            />
          </svg>
          <span className="leading-none whitespace-nowrap">초기화</span>
        </button>

        <button
          title="단축키 도움말 (?)"
          aria-label="단축키 도움말"
          aria-pressed={showShortcuts}
          onClick={toggleShortcuts}
          className={[
            'flex items-center justify-center w-8 h-8 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',
            showShortcuts
              ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]'
              : 'text-zinc-400 hover:text-white hover:bg-white/8'
          ].join(' ')}
        >
          ?
        </button>
      </div>
    </div>
  )
}
