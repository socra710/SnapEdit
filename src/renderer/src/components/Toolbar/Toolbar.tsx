import { useEditorStore, type ArrowRouting, type Tool } from '@renderer/store/editorStore'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

interface ToolDef {
  id: Tool
  label: string
  title: string
  icon: React.ReactNode
}

const arrowRoutingOptions: Array<{ value: ArrowRouting; label: string }> = [
  { value: 'straight', label: '직선' },
  { value: 'elbow', label: '엘보' }
]

const tools: ToolDef[] = [
  {
    id: 'select',
    label: '선택',
    title: '선택 (V)',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  const arrowRouting = useEditorStore((s) => s.arrowRouting)
  const setArrowRouting = useEditorStore((s) => s.setArrowRouting)
  const backgroundDataUrl = useEditorStore((s) => s.backgroundDataUrl)
  const showShortcuts = useEditorStore((s) => s.showShortcuts)
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const arrowMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isArrowMenuOpen, setIsArrowMenuOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const hasLoadedImage = Boolean(backgroundDataUrl)

  const notifyImageRequired = () => {
    useEditorStore.getState().showToast('이미지를 먼저 불러와 주세요.', 'info', 1200)
  }

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

  const handleReset = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', ctrlKey: true, shiftKey: true }))
    setIsMoreMenuOpen(false)
  }

  const handleArrowToolButton = () => {
    if (!hasLoadedImage) {
      notifyImageRequired()
      return
    }

    if (activeTool !== 'arrow') {
      setActiveTool('arrow')
      setIsArrowMenuOpen(false)
      return
    }

    setIsArrowMenuOpen((prev) => !prev)
    setIsMoreMenuOpen(false)
  }

  const handleArrowRoutingSelect = (routing: ArrowRouting) => {
    if (!hasLoadedImage) {
      notifyImageRequired()
      return
    }

    setArrowRouting(routing)
    setActiveTool('arrow')
    setIsArrowMenuOpen(false)
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (arrowMenuRef.current && !arrowMenuRef.current.contains(target)) {
        setIsArrowMenuOpen(false)
      }

      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setIsMoreMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsArrowMenuOpen(false)
      setIsMoreMenuOpen(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

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
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-20px)]">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="편집 도구"
        className="relative flex items-center gap-1 px-2 py-2 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/8 shadow-[0_8px_32px_rgba(0,0,0,0.5)] whitespace-nowrap"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileChange}
        />
        {tools.map((tool) => {
          if (tool.id === 'arrow') {
            const isActive = activeTool === 'arrow'
            const routeLabel =
              arrowRoutingOptions.find((option) => option.value === arrowRouting)?.label ?? '직선'

            return (
              <div key={tool.id} ref={arrowMenuRef} className="relative">
                <button
                  title={tool.title}
                  aria-label={tool.title}
                  aria-pressed={isActive}
                  aria-expanded={isArrowMenuOpen}
                  disabled={!hasLoadedImage}
                  onClick={handleArrowToolButton}
                  className={[
                    'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400',
                    isActive
                      ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/8'
                  ].join(' ')}
                >
                  {tool.icon}
                  <span className="leading-none">{tool.label}</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/25 text-[10px] leading-none">
                    {routeLabel}
                  </span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={isArrowMenuOpen ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                    />
                  </svg>
                </button>

                {isArrowMenuOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-28 rounded-xl border border-blue-300/25 bg-zinc-950/95 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                    {arrowRoutingOptions.map((option) => {
                      const selected = arrowRouting === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => handleArrowRoutingSelect(option.value)}
                          className={[
                            'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-150',
                            selected
                              ? 'bg-blue-600/25 text-blue-100'
                              : 'text-zinc-300 hover:text-white hover:bg-white/8'
                          ].join(' ')}
                        >
                          <span>{option.label}</span>
                          {selected && <span aria-hidden="true">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={isActive}
              disabled={!hasLoadedImage}
              onClick={() => {
                if (!hasLoadedImage) {
                  notifyImageRequired()
                  return
                }
                setActiveTool(tool.id)
                setIsArrowMenuOpen(false)
              }}
              className={[
                'flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400',
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

        <div ref={moreMenuRef} className="relative ml-1">
          <button
            title="더보기"
            aria-label="더보기"
            aria-expanded={isMoreMenuOpen}
            onClick={() => {
              setIsMoreMenuOpen((prev) => !prev)
              setIsArrowMenuOpen(false)
            }}
            className="flex items-center justify-center w-9 h-9 rounded-xl text-zinc-300 hover:text-white hover:bg-white/8 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
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
                d="M5 12h.01M12 12h.01M19 12h.01"
              />
            </svg>
          </button>

          {isMoreMenuOpen && (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-30 min-w-36 rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <button
                title="이미지 파일 삽입"
                aria-label="이미지 파일 삽입"
                onClick={() => {
                  handleSelectImageFile()
                  setIsMoreMenuOpen(false)
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/8 transition-all duration-150"
              >
                <span>이미지</span>
                <span className="text-zinc-500">파일</span>
              </button>

              <button
                title="완전 초기화 (Ctrl+Shift+R)"
                aria-label="완전 초기화"
                disabled={!hasLoadedImage}
                onClick={() => {
                  if (!hasLoadedImage) {
                    notifyImageRequired()
                    return
                  }
                  handleReset()
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-amber-300 hover:text-white hover:bg-amber-500/15 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-amber-300"
              >
                <span>초기화</span>
                <span className="text-amber-200/70">Ctrl+Shift+R</span>
              </button>

              <button
                title="단축키 도움말 (?)"
                aria-label="단축키 도움말"
                aria-pressed={showShortcuts}
                onClick={() => {
                  toggleShortcuts()
                  setIsMoreMenuOpen(false)
                }}
                className={[
                  'w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-all duration-150',
                  showShortcuts
                    ? 'bg-blue-600/25 text-blue-100'
                    : 'text-zinc-300 hover:text-white hover:bg-white/8'
                ].join(' ')}
              >
                <span>단축키</span>
                <span>{showShortcuts ? '켜짐' : '?'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
