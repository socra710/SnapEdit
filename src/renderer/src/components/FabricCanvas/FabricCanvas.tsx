import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useCanvas } from '@renderer/hooks/useCanvas'

export default function FabricCanvas() {
  const elRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null) // cleanup 함수 저장
  const {
    getCanvas,
    initCanvas,
    cleanup,
    loadBackground,
    enableRectMode,
    enableArrowMode,
    enableTextMode,
    enableNumberMode,
    enableBlurMode,
    disableAllDrawingModes,
    exportAsDataURL,
    deleteSelected,
    selectAll,
    moveSelectedBy,
    duplicateSelected,
    insertImageObject,
    resetNumberCounter,
    resetToInitialState,
    undo,
    redo
  } = useCanvas()

  const activeTool = useEditorStore((s) => s.activeTool)
  const arrowRouting = useEditorStore((s) => s.arrowRouting)
  const showShortcuts = useEditorStore((s) => s.showShortcuts)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const setShowShortcuts = useEditorStore((s) => s.setShowShortcuts)
  const toggleShortcuts = useEditorStore((s) => s.toggleShortcuts)
  const backgroundDataUrl = useEditorStore((s) => s.backgroundDataUrl)
  const setBackgroundDataUrl = useEditorStore((s) => s.setBackgroundDataUrl)
  const showToast = useEditorStore((s) => s.showToast)
  const autoLoadDoneRef = useRef(false)
  const [canvasScale, setCanvasScale] = useState(1)

  const handleImageInsert = useCallback(
    async (dataUrl: string, source: 'clipboard' | 'file') => {
      const canvas = getCanvas()
      const hasObjects = Boolean(canvas && canvas.getObjects().length > 0)
      const hasBackground = Boolean(canvas?.backgroundImage || backgroundDataUrl)

      if (!hasObjects && !hasBackground) {
        setBackgroundDataUrl(dataUrl)
        showToast(
          source === 'clipboard'
            ? '클립보드 이미지를 배경으로 불러왔습니다.'
            : '이미지를 배경으로 불러왔습니다.',
          'success'
        )
        return
      }

      const inserted = await insertImageObject(dataUrl)
      if (inserted) {
        setActiveTool('select')
        showToast(
          source === 'clipboard'
            ? '클립보드 이미지를 오브젝트로 삽입했습니다.'
            : '이미지를 오브젝트로 삽입했습니다.',
          'success'
        )
      }
    },
    [
      backgroundDataUrl,
      getCanvas,
      insertImageObject,
      setActiveTool,
      setBackgroundDataUrl,
      showToast
    ]
  )

  const handleResetToInitialState = useCallback(() => {
    const confirmed = window.confirm('현재 작업 내용을 모두 지우고 앱 실행 초기 상태로 되돌릴까요?')
    if (!confirmed) {
      return false
    }

    resetToInitialState()
    setBackgroundDataUrl(null)
    setActiveTool('select')
    setShowShortcuts(false)
    showToast('앱이 초기 상태로 재설정되었습니다.', 'info', 1600)
    return true
  }, [resetToInitialState, setActiveTool, setBackgroundDataUrl, setShowShortcuts, showToast])

  const handleSaveCanvas = useCallback(async () => {
    const dataUrl = exportAsDataURL()
    if (!dataUrl) {
      showToast('저장할 내용이 없습니다.', 'info')
      return
    }

    try {
      const result = await window.electronAPI.saveCanvasImage(dataUrl)
      if (result.success) {
        showToast(`파일이 저장되었습니다: ${result.filePath}`, 'success')
      } else if (result.reason === 'user_cancelled') {
        showToast('저장이 취소되었습니다.', 'info', 1200)
      } else {
        showToast(`저장에 실패했습니다: ${result.reason}`, 'error')
      }
    } catch (error) {
      console.error('[renderer] handleSaveCanvas failed:', error)
      showToast('저장 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error')
    }
  }, [exportAsDataURL, showToast])

  // 캔버스 초기화 (마운트 시 1회)
  useEffect(() => {
    if (elRef.current) {
      initCanvas(elRef.current)
    }
    return () => {
      cleanup()
    }
  }, [cleanup, initCanvas])

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
        cleanupRef.current = enableTextMode(() => setActiveTool('select')) || null
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
    arrowRouting,
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
      const isShortcutBlocked = isEditableTarget || e.isComposing

      if (key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        toggleShortcuts()
        return
      }

      if (!e.ctrlKey && !e.metaKey && !isShortcutBlocked) {
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
          if (e.shiftKey) {
            e.preventDefault()
            resetNumberCounter()
            showToast('번호가 1로 초기화되었습니다.', 'info', 1200)
            return
          }

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

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'r') {
        if (isShortcutBlocked) return
        e.preventDefault()
        handleResetToInitialState()
        return
      }

      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        if (isShortcutBlocked) return
        e.preventDefault()
        const selected = selectAll()
        if (!selected) {
          showToast('선택할 오브젝트가 없습니다.', 'info', 1200)
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        if (isShortcutBlocked) return
        e.preventDefault()
        const duplicated = await duplicateSelected()
        if (!duplicated) {
          showToast('복제할 오브젝트를 선택하세요.', 'info', 1200)
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        if (isShortcutBlocked) return
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
          window.dispatchEvent(new CustomEvent('snapedit:copy-failed'))
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 's') {
        if (isShortcutBlocked) return
        e.preventDefault()
        await handleSaveCanvas()
      }

      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        if (isShortcutBlocked) return
        e.preventDefault()
        undo()
      }

      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        if (isShortcutBlocked) return
        e.preventDefault()
        redo()
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      ) {
        if (isShortcutBlocked) return
        const step = e.shiftKey ? 10 : 1
        const delta =
          key === 'arrowup'
            ? { dx: 0, dy: -step }
            : key === 'arrowdown'
              ? { dx: 0, dy: step }
              : key === 'arrowleft'
                ? { dx: -step, dy: 0 }
                : { dx: step, dy: 0 }

        const moved = moveSelectedBy(delta.dx, delta.dy)
        if (moved) {
          e.preventDefault()
        }
      }

      if (e.key === 'Delete') {
        if (isShortcutBlocked) return
        e.preventDefault()
        deleteSelected()
      }

      if (e.key === 'Escape') {
        if (isShortcutBlocked) return
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
        if (isShortcutBlocked) return
        e.preventDefault()
        try {
          const dataUrl = await window.electronAPI.readClipboardImage()
          if (dataUrl) {
            await handleImageInsert(dataUrl, 'clipboard')
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
    deleteSelected,
    duplicateSelected,
    exportAsDataURL,
    moveSelectedBy,
    redo,
    handleResetToInitialState,
    handleSaveCanvas,
    resetNumberCounter,
    selectAll,
    setActiveTool,
    setBackgroundDataUrl,
    setShowShortcuts,
    showShortcuts,
    showToast,
    handleImageInsert,
    toggleShortcuts,
    undo
  ])

  useEffect(() => {
    const handleInsertImageFromToolbar = async (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const dataUrl = customEvent.detail
      if (!dataUrl) return
      await handleImageInsert(dataUrl, 'file')
    }

    window.addEventListener('snapedit:insert-image-dataurl', handleInsertImageFromToolbar)
    return () => {
      window.removeEventListener('snapedit:insert-image-dataurl', handleInsertImageFromToolbar)
    }
  }, [handleImageInsert])

  useEffect(() => {
    const handleSaveRequest = async () => {
      await handleSaveCanvas()
    }

    window.addEventListener('snapedit:request-save', handleSaveRequest)
    return () => {
      window.removeEventListener('snapedit:request-save', handleSaveRequest)
    }
  }, [handleSaveCanvas])

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500 select-none pointer-events-none p-12">
          <svg
            className="w-16 h-16 opacity-30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-9-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-300 mb-2">시작하기</p>
            <div className="space-y-1.5 text-xs text-zinc-400">
              <p>
                <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono">
                  Ctrl+V
                </span>{' '}
                클립보드 이미지 불러오기
              </p>
              <p>
                또는{' '}
                <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">
                  이미지
                </span>{' '}
                버튼으로 파일 선택
              </p>
            </div>
            <p className="text-xs text-zinc-500 mt-3">편집 후 저장 (Ctrl+S) 또는 복사 (Ctrl+C)</p>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className="absolute top-3 right-3 z-20 rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur px-3 py-2 text-xs text-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.45)] select-none">
          <p className="font-semibold text-zinc-100 mb-1">단축키</p>
          <ul className="space-y-0.5">
            <li>
              <span className="text-zinc-400">도구:</span> V 선택 | R 사각형 | A 화살표 | N 번호 | T
              텍스트 | B 블러
            </li>
            <li>
              <span className="text-zinc-400">편집:</span> Ctrl+Z 실행취소 | Ctrl+Y 다시실행
            </li>
            <li>
              <span className="text-zinc-400">선택:</span> Ctrl+A 전체 | Ctrl+D 복제 | Delete 삭제
            </li>
            <li>
              <span className="text-zinc-400">이동:</span> 화살표키 (Shift+화살표 10px)
            </li>
            <li>
              <span className="text-zinc-400">작업:</span> Ctrl+V 붙여넣기 | Ctrl+C 복사 | Ctrl+S
              저장
            </li>
            <li>
              <span className="text-zinc-400">기타:</span> Shift+N 번호 초기화 | Ctrl+Shift+R 완전
              초기화 | Esc 복귀
            </li>
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
