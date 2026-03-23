import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useCanvas } from '@renderer/hooks/useCanvas'

export default function FabricCanvas() {
  const elRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null) // cleanup 함수 저장
  const {
    getCanvas,
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
    redo
  } = useCanvas()

  const activeTool = useEditorStore((s) => s.activeTool)
  const showShortcuts = useEditorStore((s) => s.showShortcuts)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const setShowShortcuts = useEditorStore((s) => s.setShowShortcuts)
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts)
  const backgroundDataUrl = useEditorStore((s) => s.backgroundDataUrl)
  const setBackgroundDataUrl = useEditorStore((s) => s.setBackgroundDataUrl)
  const showToast = useEditorStore((s) => s.showToast)
  const autoLoadDoneRef = useRef(false)
  const [canvasScale, setCanvasScale] = useState(1)

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

  // 창 크기에 맞게 캔버스 표시 스케일 조정 (내부 캔버스 크기는 유지)
  useEffect(() => {
    const updateCanvasScale = () => {
      const canvas = getCanvas()
      if (!canvas) {
        setCanvasScale(1)
        return
      }

      const canvasWidth = canvas.getWidth()
      const canvasHeight = canvas.getHeight()

      if (!canvasWidth || !canvasHeight) {
        setCanvasScale(1)
        return
      }

      const availableWidth = Math.max(320, window.innerWidth - 48)
      const availableHeight = Math.max(240, window.innerHeight - 170)
      const nextScale = Math.min(1, availableWidth / canvasWidth, availableHeight / canvasHeight)

      setCanvasScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1)
    }

    updateCanvasScale()
    window.addEventListener('resize', updateCanvasScale)
    return () => window.removeEventListener('resize', updateCanvasScale)
  }, [backgroundDataUrl, getCanvas])

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
        cleanupRef.current = enableArrowMode(() => setActiveTool('select')) || null
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
    setActiveTool,
    enableTextMode,
    enableNumberMode,
    enableBlurMode,
    disableAllDrawingModes
  ])

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      const isEditableTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable === true

      if (key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        toggleShortcuts()
        return
      }

      if (!e.ctrlKey && !e.metaKey && !isEditableTarget) {
        if (key === 'v') {
          e.preventDefault()
          setActiveTool('select')
          return
        }

        if (key === 'r') {
          e.preventDefault()
          setActiveTool('rect')
          return
        }

        if (key === 'a') {
          e.preventDefault()
          setActiveTool('arrow')
          return
        }

        if (key === 'n') {
          e.preventDefault()
          setActiveTool('number')
          return
        }

        if (key === 't') {
          e.preventDefault()
          setActiveTool('text')
          return
        }

        if (key === 'b') {
          e.preventDefault()
          setActiveTool('blur')
          return
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        e.preventDefault()
        const dataUrl = exportAsDataURL()
        if (!dataUrl) {
          showToast('복사할 내용이 없습니다.', 'info')
          return
        }

        try {
          await window.electronAPI.writeClipboardImage(dataUrl)
          showToast('클립보드에 복사되었습니다.', 'success')
          window.dispatchEvent(new CustomEvent('snapedit:copy-success'))
        } catch {
          showToast('복사에 실패했습니다. 다시 시도해 주세요.', 'error')
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        undo()
      }

      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        redo()
      }

      if (e.key === 'Delete') {
        e.preventDefault()
        deleteSelected()
      }

      if (e.key === 'Escape') {
        if (showShortcuts) {
          e.preventDefault()
          setShowShortcuts(false)
          return
        }

        const currentTool = useEditorStore.getState().activeTool
        if (currentTool !== 'select') {
          e.preventDefault()
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
          setActiveTool('select')
          showToast('선택 모드로 전환되었습니다.', 'info', 1200)
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        e.preventDefault()
        try {
          const dataUrl = await window.electronAPI.readClipboardImage()
          if (dataUrl) {
            setBackgroundDataUrl(dataUrl)
            showToast('클립보드 이미지를 불러왔습니다.', 'success')
          } else {
            showToast('클립보드에 이미지가 없습니다.', 'info')
          }
        } catch {
          showToast('클립보드 접근에 실패했습니다. 권한을 확인해 주세요.', 'error')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeTool,
    deleteSelected,
    exportAsDataURL,
    redo,
    setActiveTool,
    setBackgroundDataUrl,
    setShowShortcuts,
    showShortcuts,
    showToast,
    toggleShortcuts,
    undo
  ])

  // 앱 시작 시 클립보드 이미지 자동 로드
  useEffect(() => {
    if (autoLoadDoneRef.current) return
    autoLoadDoneRef.current = true

    const autoLoad = async () => {
      try {
        const dataUrl = await window.electronAPI.readClipboardImage()
        if (dataUrl) {
          setBackgroundDataUrl(dataUrl)
          showToast('클립보드 이미지를 자동으로 불러왔습니다.', 'info', 1800)
        }
      } catch {
        showToast('초기 클립보드 확인에 실패했습니다.', 'error')
      }
    }

    autoLoad()
  }, [setBackgroundDataUrl, showToast])

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
          <p className="text-xs text-zinc-400">도구 선택 → 편집 → Ctrl+C로 복사</p>
        </div>
      )}

      {showShortcuts && (
        <div className="absolute top-3 right-3 z-20 rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur px-3 py-2 text-xs text-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)] select-none">
          <p className="font-semibold text-zinc-100 mb-1">단축키</p>
          <ul className="space-y-0.5">
            <li>V 선택</li>
            <li>R 사각형</li>
            <li>A 화살표</li>
            <li>N 번호</li>
            <li>T 텍스트</li>
            <li>B 블러</li>
            <li>Ctrl+Z / Ctrl+Y 실행취소/다시실행</li>
            <li>Ctrl+V 붙여넣기</li>
            <li>Ctrl+C 복사</li>
            <li>Esc 선택 모드 복귀</li>
            <li>? 도움말 토글</li>
          </ul>
        </div>
      )}

      {/* 캔버스 외곽 글로우 테두리 */}
      <div
        className="rounded shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.6)]"
        style={{
          lineHeight: 0,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center'
        }}
      >
        <canvas ref={elRef} />
      </div>
    </div>
  )
}
