import { useEffect, useRef } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useCanvas } from '@renderer/hooks/useCanvas'

export default function FabricCanvas() {
  const elRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)  // cleanup 함수 저장
  const {
    initCanvas,
    loadBackground,
    enableRectMode,
    enableArrowMode,
    enableTextMode,
    enableNumberMode,
    enableBlurMode,
    disableAllDrawingModes,
    exportAsDataURL,
    deleteSelected,
    undo,
    redo,
  } = useCanvas()

  const activeTool = useEditorStore((s) => s.activeTool)
  const backgroundDataUrl = useEditorStore((s) => s.backgroundDataUrl)
  const setBackgroundDataUrl = useEditorStore((s) => s.setBackgroundDataUrl)

  // 캔버스 초기화 (마운트 시 1회)
  useEffect(() => {
    if (elRef.current) {
      initCanvas(elRef.current)
    }
  }, [initCanvas])

  // 배경 이미지 변경 시 캔버스에 로드
  useEffect(() => {
    if (backgroundDataUrl) {
      loadBackground(backgroundDataUrl)
    }
  }, [backgroundDataUrl, loadBackground])

  // 툴 변경 시 드로잉 모드 전환
  useEffect(() => {
    // 이전 cleanup 실행
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    // 새로운 도구 활성화 및 cleanup 저장
    switch (activeTool) {
      case 'select':
        disableAllDrawingModes()
        break
      case 'rect':
        cleanupRef.current = enableRectMode() || null
        break
      case 'arrow':
        cleanupRef.current = enableArrowMode() || null
        break
      case 'text':
        cleanupRef.current = enableTextMode() || null
        break
      case 'number':
        cleanupRef.current = enableNumberMode() || null
        break
      case 'blur':
        cleanupRef.current = enableBlurMode() || null
        break
      default:
        disableAllDrawingModes()
    }

    // Cleanup: 언마운트 시 정리
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      disableAllDrawingModes()
    }
  }, [
    activeTool,
    enableRectMode,
    enableArrowMode,
    enableTextMode,
    enableNumberMode,
    enableBlurMode,
    disableAllDrawingModes,
  ])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        const dataUrl = exportAsDataURL()
        if (dataUrl) {
          await window.electronAPI.writeClipboardImage(dataUrl)
        }
      }

      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        undo()
      }

      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        redo()
      }

      if (e.key === 'Delete') {
        e.preventDefault()
        deleteSelected()
      }

      if (e.key === 'v' || e.key === 'V') {
        if (!e.ctrlKey) return
        e.preventDefault()
        const dataUrl = await window.electronAPI.readClipboardImage()
        if (dataUrl) {
          setBackgroundDataUrl(dataUrl)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exportAsDataURL, undo, redo, deleteSelected, setBackgroundDataUrl])

  // 앱 시작 시 클립보드 이미지 자동 로드
  useEffect(() => {
    const autoLoad = async () => {
      const dataUrl = await window.electronAPI.readClipboardImage()
      if (dataUrl) setBackgroundDataUrl(dataUrl)
    }
    autoLoad()
  }, [setBackgroundDataUrl])

  return (
    <div className="relative flex items-center justify-center">
      {/* 배경 이미지가 없을 때 안내 메시지 */}
      {!backgroundDataUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500 select-none pointer-events-none">
          <svg
            className="w-12 h-12 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-3-3v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 text-xs font-mono">
              Ctrl+V
            </kbd>{' '}
            로 클립보드 이미지를 불러오세요
          </p>
        </div>
      )}
      {/* 캔버스 외곽 글로우 테두리 */}
      <div
        className="rounded shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.6)]"
        style={{ lineHeight: 0 }}
      >
        <canvas ref={elRef} />
      </div>
    </div>
  )
}
