import { useRef, useCallback } from 'react'
import * as fabric from 'fabric'
import { useEditorStore } from '@renderer/store/editorStore'

const fabricCustomProperties = (fabric.FabricObject as any).customProperties ?? []
if (!fabricCustomProperties.includes('data')) {
  ;(fabric.FabricObject as any).customProperties = [...fabricCustomProperties, 'data']
}

interface Point {
  x: number
  y: number
}

type AnchorSide = 'top' | 'right' | 'bottom' | 'left'

interface ConnectorEntry {
  id: string
  line: fabric.Line
  head: fabric.Polygon
  sourceObjectId: string
  targetObjectId: string
  sourceAnchor: AnchorSide
  targetAnchor: AnchorSide
}

const MAX_HISTORY_STEPS = 80

export function useCanvas() {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const isDrawing = useRef(false)
  const startPoint = useRef<Point>({ x: 0, y: 0 })
  const activeRect = useRef<fabric.Rect | null>(null)
  const activeArrow = useRef<fabric.Line | null>(null)
  const activeArrowHead = useRef<fabric.Polygon | null>(null)
  const activeText = useRef<fabric.Textbox | null>(null)
  const activeNumber = useRef<fabric.Group | null>(null)
  const activeBlur = useRef<fabric.Rect | null>(null)
  const activeArrowSource = useRef<fabric.Object | null>(null)
  const activeArrowSourceOpacity = useRef<number>(1)
  const objectIdCounter = useRef(1)
  const connectorIdCounter = useRef(1)
  const connectorsRef = useRef<Map<string, ConnectorEntry>>(new Map())
  const numberCounter = useRef(1)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isRestoringHistoryRef = useRef(false)
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncHistoryState = () => {
    useEditorStore.getState().setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1
    })
  }

  const isAnchorSide = (value: unknown): value is AnchorSide => {
    return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
  }

  const getObjectData = (obj: fabric.Object): Record<string, unknown> => {
    return ((obj as any).data ?? {}) as Record<string, unknown>
  }

  const patchObjectData = (obj: fabric.Object, patch: Record<string, unknown>) => {
    const prevData = getObjectData(obj)
    ;(obj as any).data = {
      ...prevData,
      ...patch
    }
  }

  const isConnectorPart = (obj: fabric.Object | null | undefined): boolean => {
    if (!obj) return false
    return getObjectData(obj).isConnectorPart === true
  }

  const isPreviewPart = (obj: fabric.Object | null | undefined): boolean => {
    if (!obj) return false
    return getObjectData(obj).isArrowPreview === true
  }

  const ensureObjectId = (obj: fabric.Object): string => {
    const data = getObjectData(obj)
    const existing = data.objectId
    if (typeof existing === 'string' && existing.length > 0) {
      return existing
    }
    const objectId = `obj-${objectIdCounter.current++}`
    patchObjectData(obj, { objectId })
    return objectId
  }

  const findObjectById = (canvas: fabric.Canvas, objectId: string): fabric.Object | null => {
    const found = canvas.getObjects().find((obj) => {
      const data = getObjectData(obj)
      return data.objectId === objectId
    })
    return found ?? null
  }

  const findTopObjectAtPointer = (
    canvas: fabric.Canvas,
    pointer: fabric.Point,
    options?: { includeConnectors?: boolean; includePreview?: boolean }
  ): fabric.Object | null => {
    const includeConnectors = options?.includeConnectors ?? true
    const includePreview = options?.includePreview ?? false
    const objects = canvas.getObjects()

    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]
      if (obj === canvas.backgroundImage) continue
      if (!includeConnectors && isConnectorPart(obj)) continue
      if (!includePreview && isPreviewPart(obj)) continue
      if (obj.containsPoint(pointer)) {
        return obj
      }
    }

    return null
  }

  const isConnectableObject = (
    canvas: fabric.Canvas,
    obj: fabric.Object | null
  ): obj is fabric.Object => {
    if (!obj) return false
    if (obj === canvas.backgroundImage) return false
    if (isConnectorPart(obj)) return false
    if (isPreviewPart(obj)) return false
    return true
  }

  const getObjectCenter = (obj: fabric.Object): Point => {
    const bounds = obj.getBoundingRect()
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    }
  }

  const getAnchorPoints = (obj: fabric.Object): Record<AnchorSide, Point> => {
    const bounds = obj.getBoundingRect()
    const left = bounds.left
    const top = bounds.top
    const right = bounds.left + bounds.width
    const bottom = bounds.top + bounds.height
    const centerX = left + bounds.width / 2
    const centerY = top + bounds.height / 2

    return {
      top: { x: centerX, y: top },
      right: { x: right, y: centerY },
      bottom: { x: centerX, y: bottom },
      left: { x: left, y: centerY }
    }
  }

  const getNearestAnchorSide = (obj: fabric.Object, reference: Point): AnchorSide => {
    const anchors = getAnchorPoints(obj)
    const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left']

    let nearestSide: AnchorSide = 'top'
    let minDistance = Number.POSITIVE_INFINITY

    sides.forEach((side) => {
      const anchor = anchors[side]
      const distance = Math.hypot(anchor.x - reference.x, anchor.y - reference.y)
      if (distance < minDistance) {
        minDistance = distance
        nearestSide = side
      }
    })

    return nearestSide
  }

  const getAnchorPoint = (obj: fabric.Object, side: AnchorSide): Point => {
    return getAnchorPoints(obj)[side]
  }

  const clearArrowPreview = (canvas: fabric.Canvas) => {
    if (activeArrow.current) {
      canvas.remove(activeArrow.current)
      activeArrow.current = null
    }
    if (activeArrowHead.current) {
      canvas.remove(activeArrowHead.current)
      activeArrowHead.current = null
    }
  }

  const clearArrowSource = () => {
    if (activeArrowSource.current) {
      activeArrowSource.current.set({
        opacity: activeArrowSourceOpacity.current,
        selectable: false,
        evented: false
      })
      activeArrowSource.current = null
    }
  }

  const updateConnector = (canvas: fabric.Canvas, connector: ConnectorEntry): boolean => {
    const sourceObj = findObjectById(canvas, connector.sourceObjectId)
    const targetObj = findObjectById(canvas, connector.targetObjectId)

    if (!sourceObj || !targetObj) {
      return false
    }

    const sourcePoint = getAnchorPoint(sourceObj, connector.sourceAnchor)
    const targetPoint = getAnchorPoint(targetObj, connector.targetAnchor)

    connector.line.set({
      x1: sourcePoint.x,
      y1: sourcePoint.y,
      x2: targetPoint.x,
      y2: targetPoint.y
    })
    connector.line.setCoords()

    const headPoints = calculateArrowHeadPoints(
      sourcePoint.x,
      sourcePoint.y,
      targetPoint.x,
      targetPoint.y
    )
    connector.head.set({ points: headPoints })
    connector.head.setCoords()
    return true
  }

  const removeConnectorById = (canvas: fabric.Canvas, connectorId: string) => {
    const connector = connectorsRef.current.get(connectorId)
    if (!connector) return

    connectorsRef.current.delete(connectorId)

    const objects = canvas.getObjects()
    if (objects.includes(connector.line)) {
      canvas.remove(connector.line)
    }
    if (objects.includes(connector.head)) {
      canvas.remove(connector.head)
    }
  }

  const removeConnectorsForObjectId = (canvas: fabric.Canvas, objectId: string) => {
    const connectorIds = Array.from(connectorsRef.current.entries())
      .filter(
        ([, connector]) =>
          connector.sourceObjectId === objectId || connector.targetObjectId === objectId
      )
      .map(([id]) => id)

    connectorIds.forEach((connectorId) => {
      removeConnectorById(canvas, connectorId)
    })
  }

  const updateAllConnectors = (canvas: fabric.Canvas) => {
    const invalidIds: string[] = []
    connectorsRef.current.forEach((connector, connectorId) => {
      const updated = updateConnector(canvas, connector)
      if (!updated) {
        invalidIds.push(connectorId)
      }
    })

    invalidIds.forEach((connectorId) => {
      removeConnectorById(canvas, connectorId)
    })
  }

  const drawArrowPreview = (
    canvas: fabric.Canvas,
    sourceObj: fabric.Object,
    pointer: Point,
    hoveredTarget: fabric.Object | null
  ) => {
    const sourceReference = hoveredTarget ? getObjectCenter(hoveredTarget) : pointer
    const sourceAnchor = getNearestAnchorSide(sourceObj, sourceReference)
    const sourcePoint = getAnchorPoint(sourceObj, sourceAnchor)

    const endPoint = hoveredTarget
      ? getAnchorPoint(hoveredTarget, getNearestAnchorSide(hoveredTarget, sourcePoint))
      : pointer

    if (!activeArrow.current) {
      const previewLine = new fabric.Line([sourcePoint.x, sourcePoint.y, endPoint.x, endPoint.y], {
        stroke: '#FF0000',
        strokeWidth: 2,
        fill: 'transparent',
        selectable: false,
        evented: false,
        strokeDashArray: [6, 4],
        opacity: 0.75
      })
      patchObjectData(previewLine, { isArrowPreview: true })
      activeArrow.current = previewLine
      canvas.add(previewLine)
    } else {
      activeArrow.current.set({
        x1: sourcePoint.x,
        y1: sourcePoint.y,
        x2: endPoint.x,
        y2: endPoint.y
      })
      activeArrow.current.setCoords()
    }

    if (!activeArrowHead.current) {
      const previewHead = new fabric.Polygon(
        calculateArrowHeadPoints(sourcePoint.x, sourcePoint.y, endPoint.x, endPoint.y),
        {
          fill: '#FF0000',
          stroke: '#FF0000',
          strokeWidth: 0,
          selectable: false,
          evented: false,
          opacity: 0.75
        }
      )
      patchObjectData(previewHead, { isArrowPreview: true })
      activeArrowHead.current = previewHead
      canvas.add(previewHead)
    } else {
      activeArrowHead.current.set({
        points: calculateArrowHeadPoints(sourcePoint.x, sourcePoint.y, endPoint.x, endPoint.y)
      })
      activeArrowHead.current.setCoords()
    }
  }

  const createConnector = (
    canvas: fabric.Canvas,
    sourceObj: fabric.Object,
    targetObj: fabric.Object
  ) => {
    const sourceObjectId = ensureObjectId(sourceObj)
    const targetObjectId = ensureObjectId(targetObj)
    const connectorId = `connector-${connectorIdCounter.current++}`

    const sourceAnchor = getNearestAnchorSide(sourceObj, getObjectCenter(targetObj))
    const sourcePoint = getAnchorPoint(sourceObj, sourceAnchor)
    const targetAnchor = getNearestAnchorSide(targetObj, sourcePoint)
    const targetPoint = getAnchorPoint(targetObj, targetAnchor)

    const line = new fabric.Line([sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y], {
      stroke: '#FF0000',
      strokeWidth: 2,
      fill: 'transparent',
      selectable: true,
      evented: true
    })

    const head = new fabric.Polygon(
      calculateArrowHeadPoints(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y),
      {
        fill: '#FF0000',
        stroke: '#FF0000',
        strokeWidth: 0,
        selectable: false,
        evented: false
      }
    )

    patchObjectData(line, {
      isConnectorPart: true,
      connectorPart: 'line',
      connectorId,
      sourceObjectId,
      targetObjectId,
      sourceAnchor,
      targetAnchor
    })

    patchObjectData(head, {
      isConnectorPart: true,
      connectorPart: 'head',
      connectorId
    })

    const connector: ConnectorEntry = {
      id: connectorId,
      line,
      head,
      sourceObjectId,
      targetObjectId,
      sourceAnchor,
      targetAnchor
    }

    connectorsRef.current.set(connectorId, connector)
    canvas.add(line)
    canvas.add(head)
    canvas.setActiveObject(line)
  }

  const removeObjectWithDependencies = (canvas: fabric.Canvas, obj: fabric.Object) => {
    const data = getObjectData(obj)

    if (data.isConnectorPart === true) {
      const connectorId = data.connectorId
      if (typeof connectorId === 'string') {
        removeConnectorById(canvas, connectorId)
      }
      return
    }

    const objectId = data.objectId
    if (typeof objectId === 'string') {
      removeConnectorsForObjectId(canvas, objectId)
    }

    canvas.remove(obj)
  }

  const rebuildConnectorsFromCanvas = (canvas: fabric.Canvas) => {
    connectorsRef.current.clear()

    const connectorParts = new Map<
      string,
      {
        line?: fabric.Line
        head?: fabric.Polygon
        sourceObjectId?: string
        targetObjectId?: string
        sourceAnchor?: AnchorSide
        targetAnchor?: AnchorSide
      }
    >()

    let maxObjectCounter = 0
    let maxConnectorCounter = 0

    canvas.getObjects().forEach((obj) => {
      const data = getObjectData(obj)

      if (typeof data.objectId === 'string') {
        const match = /^obj-(\d+)$/.exec(data.objectId)
        if (match) {
          maxObjectCounter = Math.max(maxObjectCounter, Number(match[1]))
        }
      }

      if (!isConnectorPart(obj)) return

      const connectorId = data.connectorId
      if (typeof connectorId !== 'string') return

      const match = /^connector-(\d+)$/.exec(connectorId)
      if (match) {
        maxConnectorCounter = Math.max(maxConnectorCounter, Number(match[1]))
      }

      const entry = connectorParts.get(connectorId) ?? {}
      const part = data.connectorPart

      if (part === 'line' && obj instanceof fabric.Line) {
        entry.line = obj
        if (typeof data.sourceObjectId === 'string') {
          entry.sourceObjectId = data.sourceObjectId
        }
        if (typeof data.targetObjectId === 'string') {
          entry.targetObjectId = data.targetObjectId
        }
        if (isAnchorSide(data.sourceAnchor)) {
          entry.sourceAnchor = data.sourceAnchor
        }
        if (isAnchorSide(data.targetAnchor)) {
          entry.targetAnchor = data.targetAnchor
        }
      }

      if (part === 'head' && obj instanceof fabric.Polygon) {
        entry.head = obj
      }

      connectorParts.set(connectorId, entry)
    })

    connectorParts.forEach((entry, connectorId) => {
      if (
        entry.line &&
        entry.head &&
        entry.sourceObjectId &&
        entry.targetObjectId &&
        entry.sourceAnchor &&
        entry.targetAnchor
      ) {
        connectorsRef.current.set(connectorId, {
          id: connectorId,
          line: entry.line,
          head: entry.head,
          sourceObjectId: entry.sourceObjectId,
          targetObjectId: entry.targetObjectId,
          sourceAnchor: entry.sourceAnchor,
          targetAnchor: entry.targetAnchor
        })
      }
    })

    objectIdCounter.current = Math.max(1, maxObjectCounter + 1)
    connectorIdCounter.current = Math.max(1, maxConnectorCounter + 1)
  }

  const captureHistorySnapshot = (canvas: fabric.Canvas) => {
    if (isRestoringHistoryRef.current) return

    const snapshot = JSON.stringify(canvas.toJSON())
    const currentSnapshot = historyRef.current[historyIndexRef.current]

    if (snapshot === currentSnapshot) return

    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    }

    historyRef.current.push(snapshot)

    if (historyRef.current.length > MAX_HISTORY_STEPS) {
      const overflow = historyRef.current.length - MAX_HISTORY_STEPS
      historyRef.current.splice(0, overflow)
    }

    historyIndexRef.current = historyRef.current.length - 1
    syncHistoryState()
  }

  const queueHistorySnapshot = (canvas: fabric.Canvas, target?: fabric.Object) => {
    if (isRestoringHistoryRef.current) return
    if (target && isPreviewPart(target)) return

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current)
    }

    historyTimerRef.current = setTimeout(() => {
      historyTimerRef.current = null
      captureHistorySnapshot(canvas)
    }, 0)
  }

  const restoreHistoryAt = async (canvas: fabric.Canvas, index: number) => {
    if (index < 0 || index >= historyRef.current.length) return

    const snapshot = historyRef.current[index]
    isRestoringHistoryRef.current = true

    clearArrowPreview(canvas)
    clearArrowSource()
    canvas.discardActiveObject()

    try {
      await canvas.loadFromJSON(snapshot)
      rebuildConnectorsFromCanvas(canvas)
      updateAllConnectors(canvas)
      canvas.renderAll()
      historyIndexRef.current = index
      syncHistoryState()
    } finally {
      isRestoringHistoryRef.current = false
    }
  }

  /** 화살표 머리 포인트 계산 */
  const calculateArrowHeadPoints = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    headsize: number = 15
  ): fabric.XY[] => {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const points: fabric.XY[] = [
      { x: x2, y: y2 },
      {
        x: x2 - headsize * Math.cos(angle - Math.PI / 6),
        y: y2 - headsize * Math.sin(angle - Math.PI / 6)
      },
      {
        x: x2 - headsize * Math.cos(angle + Math.PI / 6),
        y: y2 - headsize * Math.sin(angle + Math.PI / 6)
      }
    ]
    return points
  }

  /** canvas 엘리먼트를 받아 Fabric.Canvas 인스턴스 초기화 */
  const initCanvas = useCallback((el: HTMLCanvasElement) => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }

    historyRef.current = []
    historyIndexRef.current = -1
    isRestoringHistoryRef.current = false
    connectorsRef.current.clear()
    syncHistoryState()

    if (canvasRef.current) {
      canvasRef.current.dispose()
    }

    const canvas = new fabric.Canvas(el, {
      selection: true,
      preserveObjectStacking: true
    })

    canvas.on('object:moving', () => {
      updateAllConnectors(canvas)
      canvas.renderAll()
    })

    canvas.on('object:added', (event) => {
      queueHistorySnapshot(canvas, event.target as fabric.Object | undefined)
    })

    canvas.on('object:modified', (event) => {
      updateAllConnectors(canvas)
      queueHistorySnapshot(canvas, event.target as fabric.Object | undefined)
      canvas.renderAll()
    })

    canvas.on('object:removed', (event) => {
      const target = event.target as fabric.Object | undefined
      if (!target) return

      const data = getObjectData(target)

      if (data.isArrowPreview === true) {
        return
      }

      if (data.isConnectorPart === true) {
        const connectorId = data.connectorId
        if (typeof connectorId === 'string') {
          const connector = connectorsRef.current.get(connectorId)
          if (connector) {
            connectorsRef.current.delete(connectorId)
            const pair = target === connector.line ? connector.head : connector.line
            if (canvas.getObjects().includes(pair)) {
              canvas.remove(pair)
            }
          }
        }
        return
      }

      const objectId = data.objectId
      if (typeof objectId === 'string') {
        removeConnectorsForObjectId(canvas, objectId)
      }

      if (activeArrowSource.current === target) {
        clearArrowSource()
        clearArrowPreview(canvas)
      }

      queueHistorySnapshot(canvas, target)
    })

    rebuildConnectorsFromCanvas(canvas)
    canvasRef.current = canvas
    captureHistorySnapshot(canvas)
    syncHistoryState()
  }, [])

  /** dataURL 이미지를 캔버스 배경으로 불러오기 */
  const loadBackground = useCallback(async (dataUrl: string) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const img = await fabric.FabricImage.fromURL(dataUrl)
    const { width, height } = img

    // 화면 크기에 맞게 축소 (최대 1200x800)
    const maxW = 1200
    const maxH = 800
    const scale = Math.min(1, maxW / width, maxH / height)
    const displayW = Math.round(width * scale)
    const displayH = Math.round(height * scale)

    canvas.setWidth(displayW)
    canvas.setHeight(displayH)

    img.scaleX = scale
    img.scaleY = scale
    canvas.backgroundImage = img
    canvas.renderAll()
    captureHistorySnapshot(canvas)
  }, [])

  /** 사각형 드로잉 모드 활성화 */
  const enableRectMode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'crosshair'
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      // 먼저 클릭한 기존 객체가 있는지 확인
      const target = canvas.findTarget(opt.e as PointerEvent)
      if (target && target !== canvas.backgroundImage) {
        // 기존 객체를 클릭했으면 선택 후 반환 (새 rect 생성하지 않음)
        target.set({ selectable: true, evented: true })
        canvas.setActiveObject(target)
        canvas.renderAll()
        return
      }

      // 빈 캔버스 영역을 클릭했으면 새로운 사각형 그리기
      isDrawing.current = true
      startPoint.current = { x: pointer.x, y: pointer.y }

      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: '#FF0000',
        strokeWidth: 2,
        rx: 6,
        ry: 6,
        shadow: new fabric.Shadow({
          color: 'rgba(255, 0, 0, 0.35)',
          blur: 10,
          offsetX: 0,
          offsetY: 2
        }),
        selectable: false,
        evented: false
      })

      activeRect.current = rect
      canvas.add(rect)
    }

    const onMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawing.current || !activeRect.current) return
      const pointer = canvas.getScenePoint(opt.e)
      const { x: startX, y: startY } = startPoint.current

      const left = Math.min(pointer.x, startX)
      const top = Math.min(pointer.y, startY)
      const width = Math.abs(pointer.x - startX)
      const height = Math.abs(pointer.y - startY)

      activeRect.current.set({ left, top, width, height })
      canvas.renderAll()
    }

    const onMouseUp = () => {
      if (!isDrawing.current) return
      isDrawing.current = false

      if (activeRect.current) {
        const w = activeRect.current.width ?? 0
        const h = activeRect.current.height ?? 0
        // 너무 작으면 삭제
        if (w < 5 || h < 5) {
          canvas.remove(activeRect.current)
        } else {
          // 완성된 사각형은 선택/조작 가능하게 전환
          ensureObjectId(activeRect.current)
          activeRect.current.set({ selectable: true, evented: true })
          canvas.setActiveObject(activeRect.current)
        }
      }
      activeRect.current = null
      canvas.renderAll()
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)

    // 이벤트 제거 함수를 반환 (disableRectMode 내부에서 사용)
    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
    }
  }, [])

  /** 화살표 드로잉 모드 활성화 */
  const enableArrowMode = useCallback((onArrowComplete?: () => void) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'crosshair'
    clearArrowPreview(canvas)
    clearArrowSource()
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      const hitObject = findTopObjectAtPointer(canvas, pointer, {
        includeConnectors: true,
        includePreview: false
      })

      if (!hitObject) {
        clearArrowPreview(canvas)
        clearArrowSource()
        canvas.discardActiveObject()
        canvas.renderAll()
        return
      }

      if (isConnectorPart(hitObject)) {
        clearArrowPreview(canvas)
        clearArrowSource()

        const connectorId = getObjectData(hitObject).connectorId
        if (typeof connectorId === 'string') {
          const connector = connectorsRef.current.get(connectorId)
          if (connector) {
            connector.line.set({ selectable: true, evented: true })
            canvas.setActiveObject(connector.line)
          }
        }
        canvas.renderAll()
        return
      }

      if (!isConnectableObject(canvas, hitObject)) return

      if (!activeArrowSource.current) {
        activeArrowSource.current = hitObject
        activeArrowSourceOpacity.current = hitObject.opacity ?? 1
        hitObject.set({ opacity: 0.7, selectable: true, evented: true })
        canvas.setActiveObject(hitObject)
        drawArrowPreview(canvas, hitObject, pointer, null)
        canvas.renderAll()
        return
      }

      const sourceObject = activeArrowSource.current

      if (hitObject === sourceObject) {
        clearArrowPreview(canvas)
        clearArrowSource()
        canvas.discardActiveObject()
        canvas.renderAll()
        return
      }

      createConnector(canvas, sourceObject, hitObject)
      clearArrowPreview(canvas)
      clearArrowSource()
      canvas.renderAll()
      onArrowComplete?.()
    }

    const onMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!activeArrowSource.current) return

      const pointer = canvas.getScenePoint(opt.e)

      const hoveredObject = findTopObjectAtPointer(canvas, pointer, {
        includeConnectors: false,
        includePreview: false
      })

      const targetObject =
        hoveredObject &&
        hoveredObject !== activeArrowSource.current &&
        isConnectableObject(canvas, hoveredObject)
          ? hoveredObject
          : null

      drawArrowPreview(canvas, activeArrowSource.current, pointer, targetObject)
      canvas.renderAll()
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)

    // cleanup 함수 반환
    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      clearArrowPreview(canvas)
      clearArrowSource()
      canvas.renderAll()
    }
  }, [])

  /** 텍스트 입력 모드 활성화 */
  const enableTextMode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'text'
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      // 마우스 좌표 기반으로 객체 찾기 (evented: false인 객체도 감지)
      const objects = canvas.getObjects()
      let target: fabric.Object | null = null
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i]
        if (obj !== canvas.backgroundImage && obj.containsPoint(pointer)) {
          target = obj
          break
        }
      }

      if (target) {
        // 기존 객체를 클릭했으면 선택 후 반환 (새 텍스트 생성하지 않음)
        target.set({ selectable: true, evented: true })
        canvas.setActiveObject(target)
        canvas.renderAll()
        return
      }

      const textbox = new fabric.Textbox('텍스트 입력...', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#000000',
        width: 200,
        selectable: false,
        evented: false
      })

      activeText.current = textbox
      ensureObjectId(textbox)
      canvas.add(textbox)

      // 편집 모드 진입
      setTimeout(() => {
        textbox.enterEditing()
        canvas.setActiveObject(textbox)
        canvas.renderAll()
      }, 0)
    }

    canvas.on('mouse:down', onMouseDown)

    // cleanup 함수 반환
    return () => {
      canvas.off('mouse:down', onMouseDown)
    }
  }, [])

  /** 번호 입력 모드 활성화 */
  const enableNumberMode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'text'
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      // 먼저 클릭한 기존 객체가 있는지 확인
      const target = canvas.findTarget(opt.e as PointerEvent)
      if (target && target !== canvas.backgroundImage) {
        // 기존 객체를 클릭했으면 선택 후 반환 (새 번호 생성하지 않음)
        target.set({ selectable: true, evented: true })
        canvas.setActiveObject(target)
        canvas.renderAll()
        return
      }

      const currentNumber = numberCounter.current.toString()
      numberCounter.current += 1

      const badgeRadius = 18
      const circle = new fabric.Circle({
        radius: badgeRadius,
        fill: '#FF0000',
        originX: 'center',
        originY: 'center'
      })

      const label = new fabric.Text(currentNumber, {
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: 'Arial',
        fill: '#FFFFFF',
        originX: 'center',
        originY: 'center'
      })

      const badge = new fabric.Group([circle, label], {
        left: pointer.x,
        top: pointer.y,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false
      })

      activeNumber.current = badge
      ensureObjectId(badge)
      canvas.add(badge)
      badge.set({ selectable: true, evented: true })
      canvas.setActiveObject(badge)
      canvas.renderAll()
    }

    canvas.on('mouse:down', onMouseDown)

    // cleanup 함수 반환
    return () => {
      canvas.off('mouse:down', onMouseDown)
    }
  }, [])

  /** 블러 모드 활성화 */
  const enableBlurMode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'crosshair'
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      // 먼저 클릭한 기존 객체가 있는지 확인
      const target = canvas.findTarget(opt.e as PointerEvent)
      if (target && target !== canvas.backgroundImage) {
        // 기존 객체를 클릭했으면 선택 후 반환 (새 blur 생성하지 않음)
        target.set({ selectable: true, evented: true })
        canvas.setActiveObject(target)
        canvas.renderAll()
        return
      }

      // 빈 캔버스 영역을 클릭했으면 새로운 블러 박스 그리기
      isDrawing.current = true
      startPoint.current = { x: pointer.x, y: pointer.y }

      const blur = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'rgba(0, 0, 0, 0.15)',
        stroke: 'rgba(0, 0, 0, 0.35)',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false
      })

      activeBlur.current = blur
      canvas.add(blur)
    }

    const onMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawing.current || !activeBlur.current) return
      const pointer = canvas.getScenePoint(opt.e)
      const { x: startX, y: startY } = startPoint.current

      const left = Math.min(pointer.x, startX)
      const top = Math.min(pointer.y, startY)
      const width = Math.abs(pointer.x - startX)
      const height = Math.abs(pointer.y - startY)

      activeBlur.current.set({ left, top, width, height })
      canvas.renderAll()
    }

    const onMouseUp = async () => {
      if (!isDrawing.current) return
      isDrawing.current = false

      if (activeBlur.current) {
        const left = activeBlur.current.left ?? 0
        const top = activeBlur.current.top ?? 0
        const width = activeBlur.current.getScaledWidth()
        const height = activeBlur.current.getScaledHeight()

        canvas.remove(activeBlur.current)
        activeBlur.current = null
        canvas.renderAll()

        if (width < 5 || height < 5) {
          canvas.renderAll()
          return
        }

        try {
          const patchDataUrl = canvas.toDataURL({
            format: 'png',
            left,
            top,
            width,
            height,
            multiplier: 1
          })

          const blurredPatch = await fabric.FabricImage.fromURL(patchDataUrl)
          blurredPatch.filters = [new fabric.filters.Blur({ blur: 0.45 })]
          blurredPatch.applyFilters()
          blurredPatch.set({
            left,
            top,
            selectable: true,
            evented: true
          })

          ensureObjectId(blurredPatch)
          canvas.add(blurredPatch)
          canvas.setActiveObject(blurredPatch)
        } catch (error) {
          console.error('블러 패치 생성 실패:', error)
        }
      }

      canvas.renderAll()
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)

    // cleanup 함수 반환
    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
    }
  }, [])

  /** 모든 드로잉 모드 비활성화 및 선택 모드 활성화 */
  const disableAllDrawingModes = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    clearArrowPreview(canvas)
    clearArrowSource()

    canvas.defaultCursor = 'default'
    canvas.selection = true
    canvas.forEachObject((obj) => {
      if (isConnectorPart(obj) && getObjectData(obj).connectorPart === 'head') {
        obj.selectable = false
        obj.evented = false
      } else {
        obj.selectable = true
        obj.evented = true
      }
    })

    // 모든 mouse 이벤트 핸들러 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    // 상태 초기화
    isDrawing.current = false
    activeRect.current = null
    activeArrow.current = null
    activeArrowHead.current = null
    activeText.current = null
    activeNumber.current = null
    activeBlur.current = null
  }, [])

  /** 사각형 드로잉 모드 비활성화 - 호환성 유지 */
  const disableRectMode = useCallback(() => {
    disableAllDrawingModes()
  }, [disableAllDrawingModes])

  /** 선택된 객체 삭제 */
  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const active = canvas.getActiveObject()
    if (!active) return

    if (active instanceof fabric.ActiveSelection) {
      const selectedObjects = active.getObjects()
      canvas.discardActiveObject()
      selectedObjects.forEach((obj) => {
        removeObjectWithDependencies(canvas, obj)
      })
    } else {
      removeObjectWithDependencies(canvas, active as fabric.Object)
      canvas.discardActiveObject()
    }

    canvas.renderAll()
  }, [])

  /** 되돌리기 (향후 구현) */
  const undo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const nextIndex = historyIndexRef.current - 1
    if (nextIndex < 0) return

    void restoreHistoryAt(canvas, nextIndex)
  }, [])

  /** 다시 실행 (향후 구현) */
  const redo = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const nextIndex = historyIndexRef.current + 1
    if (nextIndex >= historyRef.current.length) return

    void restoreHistoryAt(canvas, nextIndex)
  }, [])

  /** 현재 캔버스를 dataURL로 내보내기 */
  const exportAsDataURL = useCallback((): string | null => {
    return canvasRef.current?.toDataURL({ format: 'png', multiplier: 1 }) ?? null
  }, [])

  /** 캔버스 인스턴스 반환 */
  const getCanvas = useCallback(() => {
    return canvasRef.current
  }, [])

  return {
    canvasRef,
    getCanvas,
    initCanvas,
    loadBackground,
    enableRectMode,
    enableArrowMode,
    enableTextMode,
    enableNumberMode,
    enableBlurMode,
    disableAllDrawingModes,
    disableRectMode,
    exportAsDataURL,
    deleteSelected,
    undo,
    redo
  }
}
