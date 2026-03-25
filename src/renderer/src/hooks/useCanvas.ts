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

interface ObjectCorners {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

type AnchorSide =
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'right'
  | 'bottomRight'
  | 'bottom'
  | 'bottomLeft'
  | 'left'

interface ConnectorEntry {
  id: string
  arrow: fabric.Group
  sourceObjectId: string
  targetObjectId: string
  sourceAnchor: AnchorSide
  targetAnchor: AnchorSide
  routing: 'straight' | 'elbow'
}

type ConnectorEndpoint = 'source' | 'target'

const MAX_HISTORY_STEPS = 80
const HISTORY_DEBOUNCE_MS = 100
const MAX_EXPORT_MULTIPLIER = 2

// 화살표 스타일 설정
const ARROW_STROKE_WIDTH = 2
const ARROW_HEAD_SIZE = 15
const ARROW_COLOR = '#FF0000'
const ARROW_SELECTED_COLOR = '#3B82F6'
const CONNECTOR_HANDLE_COLOR = '#2563EB'
const CONNECTOR_HANDLE_RADIUS = 8

const ANCHOR_SIDES: AnchorSide[] = [
  'topLeft',
  'top',
  'topRight',
  'right',
  'bottomRight',
  'bottom',
  'bottomLeft',
  'left'
]

// 꼭지점 스냅 설정
const CORNER_SNAP_RADIUS = 58 // 꼭지점 직접 스냅 범위
const EDGE_SNAP_RADIUS = 34 // 변 중점 직접 스냅 범위
const CORNER_PRIORITY_BIAS = 10 // 코너를 약간 더 우선시하는 보정값
const OBJECT_DETECT_RADIUS = 132 // 객체 인식 범위 (오브젝트 내부 포함)
const ANCHOR_LOCK_RELEASE_RADIUS = 92 // 드래그 중 스냅 고정 해제 반경
const ELBOW_STUB_MIN = 24
const ELBOW_STUB_MAX = 56

const getPixelRatioMultiplier = () => {
  if (typeof window === 'undefined') return 1
  const pixelRatio = window.devicePixelRatio || 1
  return Math.min(MAX_EXPORT_MULTIPLIER, Math.max(1, pixelRatio))
}

export function useCanvas() {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const initialCanvasSizeRef = useRef({ width: 300, height: 150 })
  const isDrawing = useRef(false)
  const startPoint = useRef<Point>({ x: 0, y: 0 })
  const activeRect = useRef<fabric.Rect | null>(null)
  const activeArrow = useRef<fabric.Line | fabric.Polyline | null>(null)
  const activeArrowHead = useRef<fabric.Polygon | null>(null)
  const activeText = useRef<fabric.Textbox | null>(null)
  const activeNumber = useRef<fabric.Group | null>(null)
  const activeBlur = useRef<fabric.Rect | null>(null)
  const activeArrowSource = useRef<fabric.Object | null>(null)
  const activeArrowSourceOpacity = useRef<number>(1)
  const activeArrowRouting = useRef<'straight' | 'elbow'>('straight')
  const objectIdCounter = useRef(1)
  const connectorIdCounter = useRef(1)
  const connectorsRef = useRef<Map<string, ConnectorEntry>>(new Map())
  const anchorIndicatorsRef = useRef<fabric.Circle[]>([])
  const connectorHandlesRef = useRef<fabric.Circle[]>([])
  const connectorEditRef = useRef<{
    connectorId: string
    endpoint: ConnectorEndpoint
    hoverSnap: { obj: fabric.Object; anchor: AnchorSide; point: Point } | null
  } | null>(null)
  const isUpdatingConnectorsRef = useRef(false)
  const numberCounter = useRef(1)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isRestoringHistoryRef = useRef(false)
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderRafRef = useRef<number | null>(null)

  const syncHistoryState = () => {
    useEditorStore.getState().setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1
    })
  }

  const isAnchorSide = (value: unknown): value is AnchorSide => {
    return ANCHOR_SIDES.includes(value as AnchorSide)
  }

  const getObjectData = (obj: fabric.Object): Record<string, unknown> => {
    const value = (obj as fabric.Object & { data?: unknown }).data
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }
    return value as Record<string, unknown>
  }

  const patchObjectData = (obj: fabric.Object, patch: Record<string, unknown>) => {
    const prevData = getObjectData(obj)
    ;(obj as fabric.Object & { data?: Record<string, unknown> }).data = {
      ...prevData,
      ...patch
    }
  }

  const isConnectorPart = (obj: fabric.Object | null | undefined): boolean => {
    if (!obj) return false
    return getObjectData(obj).isConnector === true
  }

  const isFreeArrow = (obj: fabric.Object | null | undefined): boolean => {
    if (!obj) return false
    return getObjectData(obj).isFreeArrow === true
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
    if (isFreeArrow(obj)) return false
    if (isPreviewPart(obj)) return false
    return true
  }

  const getObjectCenter = (obj: fabric.Object): Point => {
    const corners = getObjectCorners(obj)
    return {
      x:
        (corners.topLeft.x + corners.topRight.x + corners.bottomRight.x + corners.bottomLeft.x) / 4,
      y: (corners.topLeft.y + corners.topRight.y + corners.bottomRight.y + corners.bottomLeft.y) / 4
    }
  }

  const getObjectCorners = (obj: fabric.Object): ObjectCorners => {
    const coords = obj.getCoords()

    if (coords.length >= 4) {
      const [topLeft, topRight, bottomRight, bottomLeft] = coords
      return {
        topLeft: { x: topLeft.x, y: topLeft.y },
        topRight: { x: topRight.x, y: topRight.y },
        bottomRight: { x: bottomRight.x, y: bottomRight.y },
        bottomLeft: { x: bottomLeft.x, y: bottomLeft.y }
      }
    }

    const bounds = obj.getBoundingRect()
    const left = bounds.left
    const top = bounds.top
    const right = bounds.left + bounds.width
    const bottom = bounds.top + bounds.height

    return {
      topLeft: { x: left, y: top },
      topRight: { x: right, y: top },
      bottomRight: { x: right, y: bottom },
      bottomLeft: { x: left, y: bottom }
    }
  }

  const getAnchorPoints = (obj: fabric.Object): Record<AnchorSide, Point> => {
    const corners = getObjectCorners(obj)
    const top = {
      x: (corners.topLeft.x + corners.topRight.x) / 2,
      y: (corners.topLeft.y + corners.topRight.y) / 2
    }
    const right = {
      x: (corners.topRight.x + corners.bottomRight.x) / 2,
      y: (corners.topRight.y + corners.bottomRight.y) / 2
    }
    const bottom = {
      x: (corners.bottomLeft.x + corners.bottomRight.x) / 2,
      y: (corners.bottomLeft.y + corners.bottomRight.y) / 2
    }
    const left = {
      x: (corners.topLeft.x + corners.bottomLeft.x) / 2,
      y: (corners.topLeft.y + corners.bottomLeft.y) / 2
    }

    return {
      topLeft: corners.topLeft,
      top,
      topRight: corners.topRight,
      right,
      bottomRight: corners.bottomRight,
      bottom,
      bottomLeft: corners.bottomLeft,
      left
    }
  }

  const getNearestAnchorSide = (obj: fabric.Object, reference: Point): AnchorSide => {
    const anchors = getAnchorPoints(obj)

    let nearestSide: AnchorSide = 'topLeft'
    let minDistance = Number.POSITIVE_INFINITY

    ANCHOR_SIDES.forEach((side) => {
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

  const isCornerAnchor = (side: AnchorSide) => {
    return (
      side === 'topLeft' || side === 'topRight' || side === 'bottomRight' || side === 'bottomLeft'
    )
  }

  // 포인터 근처의 앵커 포인트 찾기
  const getAnchorPointNearPointer = (obj: fabric.Object, pointerPos: Point): AnchorSide | null => {
    const anchors = getAnchorPoints(obj)
    const anchorList = ANCHOR_SIDES.map((side) => [side, anchors[side]] as const)

    let nearestCorner: AnchorSide = 'topLeft'
    let nearestCornerDist = Number.POSITIVE_INFINITY
    let nearestEdge: AnchorSide = 'top'
    let nearestEdgeDist = Number.POSITIVE_INFINITY

    for (const [side, pt] of anchorList) {
      const dist = Math.hypot(pt.x - pointerPos.x, pt.y - pointerPos.y)
      if (isCornerAnchor(side)) {
        if (dist < nearestCornerDist) {
          nearestCornerDist = dist
          nearestCorner = side
        }
      } else if (dist < nearestEdgeDist) {
        nearestEdgeDist = dist
        nearestEdge = side
      }
    }

    if (
      nearestCornerDist <= CORNER_SNAP_RADIUS &&
      (nearestEdgeDist > EDGE_SNAP_RADIUS ||
        nearestCornerDist <= nearestEdgeDist + CORNER_PRIORITY_BIAS)
    ) {
      return nearestCorner
    }

    if (nearestEdgeDist <= EDGE_SNAP_RADIUS) {
      return nearestEdge
    }

    return null
  }

  // 마우스 포인터 근처의 앵커 포인트를 시각적으로 강조
  const drawAnchorIndicators = (
    canvas: fabric.Canvas,
    obj: fabric.Object,
    highlight?: AnchorSide,
    options?: { append?: boolean }
  ) => {
    if (!options?.append) {
      anchorIndicatorsRef.current.forEach((circle) => {
        canvas.remove(circle)
      })
      anchorIndicatorsRef.current = []
    }

    const anchors = getAnchorPoints(obj)
    const visibleAnchors = ANCHOR_SIDES.map((side) => [side, anchors[side]] as const)

    visibleAnchors.forEach(([side, anchor]) => {
      const isHighlighted = side === highlight
      const radius = isHighlighted ? 6 : 4

      const circle = new fabric.Circle({
        radius,
        left: anchor.x - radius,
        top: anchor.y - radius,
        fill: isHighlighted ? '#60A5FA' : 'rgba(255, 255, 255, 0.9)',
        stroke: isHighlighted ? '#1D4ED8' : '#2563EB',
        strokeWidth: isHighlighted ? 2 : 1.5,
        shadow: new fabric.Shadow({
          color: isHighlighted ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.12)',
          blur: isHighlighted ? 10 : 4,
          offsetX: 0,
          offsetY: 0
        }),
        selectable: false,
        evented: false,
        absolutePositioned: true
      })

      patchObjectData(circle, { isAnchorIndicator: true })
      anchorIndicatorsRef.current.push(circle)
      canvas.add(circle)
    })
  }

  const clearAnchorIndicators = (canvas: fabric.Canvas) => {
    anchorIndicatorsRef.current.forEach((circle) => {
      canvas.remove(circle)
    })
    anchorIndicatorsRef.current = []
  }

  const clearConnectorHandles = (canvas: fabric.Canvas) => {
    connectorHandlesRef.current.forEach((handle) => {
      canvas.remove(handle)
    })
    connectorHandlesRef.current = []
    connectorEditRef.current = null
  }

  const setConnectorVisualState = (connector: ConnectorEntry, selected: boolean) => {
    const objs = connector.arrow.getObjects()
    const strokeColor = selected ? ARROW_SELECTED_COLOR : ARROW_COLOR
    const shadow = selected
      ? new fabric.Shadow({
          color: 'rgba(59, 130, 246, 0.45)',
          blur: 14,
          offsetX: 0,
          offsetY: 0
        })
      : undefined

    if (objs[0] instanceof fabric.Polyline) {
      objs[0].set({
        stroke: strokeColor,
        strokeWidth: selected ? 3.5 : ARROW_STROKE_WIDTH,
        shadow
      })
    }
    if (objs[1] instanceof fabric.Polygon) {
      objs[1].set({
        fill: strokeColor,
        stroke: strokeColor,
        shadow
      })
    }
    connector.arrow.set({
      hasBorders: selected,
      borderColor: '#60A5FA',
      padding: selected ? 10 : 0,
      borderScaleFactor: selected ? 2 : 1
    })
    connector.arrow.dirty = true
  }

  const drawConnectorHandles = (canvas: fabric.Canvas, connector: ConnectorEntry) => {
    clearConnectorHandles(canvas)

    const sourceObj = findObjectById(canvas, connector.sourceObjectId)
    const targetObj = findObjectById(canvas, connector.targetObjectId)
    if (!sourceObj || !targetObj) return

    const sourcePoint = getAnchorPoint(sourceObj, connector.sourceAnchor)
    const targetPoint = getAnchorPoint(targetObj, connector.targetAnchor)
    const endpoints: Array<{ endpoint: ConnectorEndpoint; point: Point }> = [
      { endpoint: 'source', point: sourcePoint },
      { endpoint: 'target', point: targetPoint }
    ]

    endpoints.forEach(({ endpoint, point }) => {
      const handle = new fabric.Circle({
        radius: CONNECTOR_HANDLE_RADIUS,
        left: point.x - CONNECTOR_HANDLE_RADIUS,
        top: point.y - CONNECTOR_HANDLE_RADIUS,
        fill: '#FFFFFF',
        stroke: '#FFFFFF',
        strokeWidth: 2,
        shadow: new fabric.Shadow({
          color: 'rgba(37, 99, 235, 0.5)',
          blur: 14,
          offsetX: 0,
          offsetY: 0
        }),
        selectable: false,
        evented: false,
        absolutePositioned: true
      })

      const ring = new fabric.Circle({
        radius: CONNECTOR_HANDLE_RADIUS - 3,
        left: point.x - (CONNECTOR_HANDLE_RADIUS - 3),
        top: point.y - (CONNECTOR_HANDLE_RADIUS - 3),
        fill: CONNECTOR_HANDLE_COLOR,
        selectable: false,
        evented: false,
        absolutePositioned: true
      })

      patchObjectData(handle, {
        isConnectorEndpointHandle: true,
        connectorId: connector.id,
        endpoint
      })
      patchObjectData(ring, {
        isConnectorEndpointHandle: true,
        connectorId: connector.id,
        endpoint
      })

      connectorHandlesRef.current.push(handle)
      connectorHandlesRef.current.push(ring)
      canvas.add(handle)
      canvas.add(ring)
    })
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

  const getAnchorHorizontalDir = (anchor: AnchorSide | null): number => {
    if (!anchor) return 1
    if (anchor === 'topLeft' || anchor === 'left' || anchor === 'bottomLeft') return -1
    if (anchor === 'topRight' || anchor === 'right' || anchor === 'bottomRight') return 1
    return 0
  }

  const getAnchorVerticalDir = (anchor: AnchorSide | null): number => {
    if (!anchor) return 1
    if (anchor === 'topLeft' || anchor === 'top' || anchor === 'topRight') return -1
    if (anchor === 'bottomLeft' || anchor === 'bottom' || anchor === 'bottomRight') return 1
    return 0
  }

  const prefersHorizontalElbow = (
    sourceAnchor: AnchorSide | null,
    targetAnchor: AnchorSide | null,
    dx: number,
    dy: number
  ) => {
    const horizontalAnchors = ['left', 'right']
    const verticalAnchors = ['top', 'bottom']

    if (
      sourceAnchor &&
      targetAnchor &&
      horizontalAnchors.includes(sourceAnchor) &&
      horizontalAnchors.includes(targetAnchor)
    ) {
      return true
    }

    if (
      sourceAnchor &&
      targetAnchor &&
      verticalAnchors.includes(sourceAnchor) &&
      verticalAnchors.includes(targetAnchor)
    ) {
      return false
    }

    return Math.abs(dx) >= Math.abs(dy) * 0.9
  }

  const compactPathPoints = (points: Point[]): fabric.XY[] => {
    const deduped: Point[] = []

    points.forEach((point) => {
      const prev = deduped[deduped.length - 1]
      if (!prev || prev.x !== point.x || prev.y !== point.y) {
        deduped.push(point)
      }
    })

    const compacted: Point[] = []
    deduped.forEach((point) => {
      const prev = compacted[compacted.length - 1]
      const prevPrev = compacted[compacted.length - 2]

      if (!prev || !prevPrev) {
        compacted.push(point)
        return
      }

      const sameX = prevPrev.x === prev.x && prev.x === point.x
      const sameY = prevPrev.y === prev.y && prev.y === point.y

      if (sameX || sameY) {
        compacted[compacted.length - 1] = point
        return
      }

      compacted.push(point)
    })

    return compacted
  }

  const buildElbowPoints = (
    sourcePoint: Point,
    targetPoint: Point,
    sourceAnchor: AnchorSide | null = null,
    targetAnchor: AnchorSide | null = null
  ): fabric.XY[] => {
    const dx = targetPoint.x - sourcePoint.x
    const dy = targetPoint.y - sourcePoint.y
    const sourceHorizontalDir = getAnchorHorizontalDir(sourceAnchor) || (dx >= 0 ? 1 : -1)
    const targetHorizontalDir = getAnchorHorizontalDir(targetAnchor) || (dx >= 0 ? -1 : 1)
    const sourceVerticalDir = getAnchorVerticalDir(sourceAnchor) || (dy >= 0 ? 1 : -1)
    const targetVerticalDir = getAnchorVerticalDir(targetAnchor) || (dy >= 0 ? -1 : 1)

    const horizontalFirst = prefersHorizontalElbow(sourceAnchor, targetAnchor, dx, dy)
    const baseStub = Math.max(
      ELBOW_STUB_MIN,
      Math.min(ELBOW_STUB_MAX, Math.min(Math.abs(dx), Math.abs(dy)) * 0.35 || ELBOW_STUB_MIN)
    )

    if (horizontalFirst) {
      const sourceStubX = sourcePoint.x + sourceHorizontalDir * baseStub
      const targetStubX = targetPoint.x + targetHorizontalDir * baseStub
      const middleX =
        sourceHorizontalDir === targetHorizontalDir
          ? sourceHorizontalDir > 0
            ? Math.max(sourceStubX, targetStubX) + baseStub
            : Math.min(sourceStubX, targetStubX) - baseStub
          : (sourceStubX + targetStubX) / 2

      return compactPathPoints([
        sourcePoint,
        { x: sourceStubX, y: sourcePoint.y },
        { x: middleX, y: sourcePoint.y },
        { x: middleX, y: targetPoint.y },
        { x: targetStubX, y: targetPoint.y },
        targetPoint
      ])
    }

    const sourceStubY = sourcePoint.y + sourceVerticalDir * baseStub
    const targetStubY = targetPoint.y + targetVerticalDir * baseStub
    const middleY =
      sourceVerticalDir === targetVerticalDir
        ? sourceVerticalDir > 0
          ? Math.max(sourceStubY, targetStubY) + baseStub
          : Math.min(sourceStubY, targetStubY) - baseStub
        : (sourceStubY + targetStubY) / 2

    return compactPathPoints([
      sourcePoint,
      { x: sourcePoint.x, y: sourceStubY },
      { x: sourcePoint.x, y: middleY },
      { x: targetPoint.x, y: middleY },
      { x: targetPoint.x, y: targetStubY },
      targetPoint
    ])
  }

  const getArrowHeadDirectionPoints = (points: fabric.XY[]): { from: Point; to: Point } => {
    if (points.length < 2) {
      const origin = points[0] ?? { x: 0, y: 0 }
      return { from: origin, to: origin }
    }

    const to = points[points.length - 1]
    let from = points[points.length - 2]

    for (let i = points.length - 2; i >= 0; i--) {
      const candidate = points[i]
      if (candidate.x !== to.x || candidate.y !== to.y) {
        from = candidate
        break
      }
    }

    return {
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y }
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

    isUpdatingConnectorsRef.current = true
    try {
      const wasActive = canvas.getActiveObject() === connector.arrow
      canvas.remove(connector.arrow)

      const newGroup = buildArrowGroup(
        sourcePoint,
        targetPoint,
        connector.routing,
        connector.sourceAnchor,
        connector.targetAnchor
      )

      patchObjectData(newGroup, {
        isConnector: true,
        connectorId: connector.id,
        sourceObjectId: connector.sourceObjectId,
        targetObjectId: connector.targetObjectId,
        sourceAnchor: connector.sourceAnchor,
        targetAnchor: connector.targetAnchor,
        routing: connector.routing
      })

      newGroup.set({
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true
      })

      canvas.add(newGroup)
      connector.arrow = newGroup

      if (wasActive) {
        canvas.setActiveObject(newGroup)
      }
    } finally {
      isUpdatingConnectorsRef.current = false
    }
    return true
  }

  const removeConnectorById = (canvas: fabric.Canvas, connectorId: string) => {
    const connector = connectorsRef.current.get(connectorId)
    if (!connector) return

    connectorsRef.current.delete(connectorId)

    const objects = canvas.getObjects()
    if (objects.includes(connector.arrow)) {
      canvas.remove(connector.arrow)
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

  const updateConnectorsForObject = (canvas: fabric.Canvas, target: fabric.Object) => {
    const objectId = getObjectData(target).objectId
    if (typeof objectId !== 'string') {
      updateAllConnectors(canvas)
      return
    }

    const invalidIds: string[] = []
    connectorsRef.current.forEach((connector, connectorId) => {
      if (connector.sourceObjectId !== objectId && connector.targetObjectId !== objectId) return
      const updated = updateConnector(canvas, connector)
      if (!updated) {
        invalidIds.push(connectorId)
      }
    })

    invalidIds.forEach((connectorId) => {
      removeConnectorById(canvas, connectorId)
    })
  }

  const scheduleCanvasRender = (canvas: fabric.Canvas) => {
    if (renderRafRef.current !== null) return

    renderRafRef.current = window.requestAnimationFrame(() => {
      renderRafRef.current = null
      canvas.renderAll()
    })
  }

  const drawArrowPreview = (
    canvas: fabric.Canvas,
    start: Point,
    end: Point,
    options?: {
      routing?: 'straight' | 'elbow'
      sourceAnchor?: AnchorSide
      targetAnchor?: AnchorSide
    }
  ) => {
    const routing = options?.routing ?? activeArrowRouting.current
    const points =
      routing === 'elbow'
        ? buildElbowPoints(start, end, options?.sourceAnchor ?? null, options?.targetAnchor ?? null)
        : [start, end]

    if (!activeArrow.current) {
      const previewLine = new fabric.Polyline(points, {
        stroke: ARROW_COLOR,
        strokeWidth: ARROW_STROKE_WIDTH + 1,
        fill: 'transparent',
        selectable: false,
        evented: false,
        strokeDashArray: [6, 4],
        opacity: 0.95,
        objectCaching: false
      })
      patchObjectData(previewLine, { isArrowPreview: true })
      activeArrow.current = previewLine
      canvas.add(previewLine)
    } else {
      if (activeArrow.current instanceof fabric.Polyline) {
        activeArrow.current.set({ points })
      } else {
        activeArrow.current.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y })
      }
      activeArrow.current.setCoords()
    }

    const headDirection = getArrowHeadDirectionPoints(points)

    if (!activeArrowHead.current) {
      const previewHead = new fabric.Polygon(
        calculateArrowHeadPoints(
          headDirection.from.x,
          headDirection.from.y,
          headDirection.to.x,
          headDirection.to.y,
          ARROW_HEAD_SIZE
        ),
        {
          fill: ARROW_COLOR,
          stroke: ARROW_COLOR,
          strokeWidth: 0,
          selectable: false,
          evented: false,
          opacity: 0.95,
          objectCaching: false
        }
      )
      patchObjectData(previewHead, { isArrowPreview: true })
      activeArrowHead.current = previewHead
      canvas.add(previewHead)
    } else {
      activeArrowHead.current.set({
        points: calculateArrowHeadPoints(
          headDirection.from.x,
          headDirection.from.y,
          headDirection.to.x,
          headDirection.to.y,
          ARROW_HEAD_SIZE
        )
      })
      activeArrowHead.current.setCoords()
    }

    if (activeArrow.current) {
      canvas.remove(activeArrow.current)
      canvas.add(activeArrow.current)
    }
    if (activeArrowHead.current) {
      canvas.remove(activeArrowHead.current)
      canvas.add(activeArrowHead.current)
    }
    anchorIndicatorsRef.current.forEach((circle) => {
      canvas.remove(circle)
      canvas.add(circle)
    })
  }

  const createFreeArrow = (
    canvas: fabric.Canvas,
    start: Point,
    end: Point,
    routing: 'straight' | 'elbow'
  ) => {
    const points = routing === 'elbow' ? buildElbowPoints(start, end, null, null) : [start, end]

    const line = new fabric.Polyline(points, {
      stroke: ARROW_COLOR,
      strokeWidth: ARROW_STROKE_WIDTH,
      fill: 'transparent',
      selectable: false,
      evented: false
    })

    const headDirection = getArrowHeadDirectionPoints(points)
    const head = new fabric.Polygon(
      calculateArrowHeadPoints(
        headDirection.from.x,
        headDirection.from.y,
        headDirection.to.x,
        headDirection.to.y,
        ARROW_HEAD_SIZE
      ),
      {
        fill: ARROW_COLOR,
        stroke: ARROW_COLOR,
        strokeWidth: 0,
        selectable: false,
        evented: false
      }
    )

    const group = new fabric.Group([line, head], {
      selectable: true,
      evented: true
    })

    ensureObjectId(group)
    patchObjectData(group, { isFreeArrow: true })
    canvas.add(group)
    canvas.setActiveObject(group)
  }

  const createConnector = (
    canvas: fabric.Canvas,
    sourceObj: fabric.Object,
    targetObj: fabric.Object,
    sourceAnchorForce?: AnchorSide,
    targetAnchorForce?: AnchorSide,
    routingForce?: 'straight' | 'elbow'
  ) => {
    const sourceObjectId = ensureObjectId(sourceObj)
    const targetObjectId = ensureObjectId(targetObj)
    const connectorId = `connector-${connectorIdCounter.current++}`

    const sourceAnchor =
      sourceAnchorForce || getNearestAnchorSide(sourceObj, getObjectCenter(targetObj))
    const sourcePoint = getAnchorPoint(sourceObj, sourceAnchor)
    const targetAnchor = targetAnchorForce || getNearestAnchorSide(targetObj, sourcePoint)
    const targetPoint = getAnchorPoint(targetObj, targetAnchor)
    const routing = routingForce ?? useEditorStore.getState().arrowRouting

    const arrowGroup = buildArrowGroup(
      sourcePoint,
      targetPoint,
      routing,
      sourceAnchor,
      targetAnchor
    )

    patchObjectData(arrowGroup, {
      isConnector: true,
      connectorId,
      sourceObjectId,
      targetObjectId,
      sourceAnchor,
      targetAnchor,
      routing
    })

    arrowGroup.set({
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true
    })

    const connector: ConnectorEntry = {
      id: connectorId,
      arrow: arrowGroup,
      sourceObjectId,
      targetObjectId,
      sourceAnchor,
      targetAnchor,
      routing
    }

    connectorsRef.current.set(connectorId, connector)
    canvas.add(arrowGroup)
    canvas.setActiveObject(arrowGroup)
  }

  const removeObjectWithDependencies = (canvas: fabric.Canvas, obj: fabric.Object) => {
    const data = getObjectData(obj)

    if (data.isConnector === true) {
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

      if (data.isConnector !== true) return
      if (!(obj instanceof fabric.Group)) return

      const connectorId = data.connectorId
      if (typeof connectorId !== 'string') return

      const match = /^connector-(\d+)$/.exec(connectorId)
      if (match) {
        maxConnectorCounter = Math.max(maxConnectorCounter, Number(match[1]))
      }

      const sourceObjectId = data.sourceObjectId
      const targetObjectId = data.targetObjectId
      const sourceAnchor = data.sourceAnchor
      const targetAnchor = data.targetAnchor
      const routing = data.routing

      if (typeof sourceObjectId !== 'string' || typeof targetObjectId !== 'string') return
      if (!isAnchorSide(sourceAnchor) || !isAnchorSide(targetAnchor)) return

      // 잠금 속성 복원 (직렬화 후 복원 시 필요)
      obj.set({
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true
      })

      connectorsRef.current.set(connectorId, {
        id: connectorId,
        arrow: obj as fabric.Group,
        sourceObjectId,
        targetObjectId,
        sourceAnchor,
        targetAnchor,
        routing: routing === 'elbow' ? 'elbow' : 'straight'
      })
    })

    objectIdCounter.current = Math.max(1, maxObjectCounter + 1)
    connectorIdCounter.current = Math.max(1, maxConnectorCounter + 1)
  }

  const captureHistorySnapshot = (canvas: fabric.Canvas) => {
    if (isRestoringHistoryRef.current) return
    let snapshot = ''
    try {
      snapshot = JSON.stringify(canvas.toJSON())
    } catch (error) {
      console.error('히스토리 스냅샷 생성 실패:', error)
      useEditorStore
        .getState()
        .showToast('히스토리 저장에 실패했습니다. 작업을 다시 시도해 주세요.', 'error')
      return
    }
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
    }, HISTORY_DEBOUNCE_MS)
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
    } catch (error) {
      console.error('히스토리 복원 실패:', error)
      useEditorStore
        .getState()
        .showToast('실행 취소/다시 실행에 실패했습니다. 다시 시도해 주세요.', 'error')
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

  /** 단일 Group 오브젝트로 화살표 생성 (Polyline + Polygon) */
  const buildArrowGroup = (
    sourcePoint: Point,
    targetPoint: Point,
    routing: 'straight' | 'elbow',
    sourceAnchor: AnchorSide | null = null,
    targetAnchor: AnchorSide | null = null
  ): fabric.Group => {
    const points =
      routing === 'elbow'
        ? buildElbowPoints(sourcePoint, targetPoint, sourceAnchor, targetAnchor)
        : [sourcePoint, targetPoint]

    const headDir = getArrowHeadDirectionPoints(points)
    const headPts = calculateArrowHeadPoints(
      headDir.from.x,
      headDir.from.y,
      headDir.to.x,
      headDir.to.y,
      ARROW_HEAD_SIZE
    )

    const polyline = new fabric.Polyline(points as fabric.XY[], {
      stroke: ARROW_COLOR,
      strokeWidth: ARROW_STROKE_WIDTH,
      fill: 'transparent',
      selectable: false,
      evented: false,
      strokeLineCap: 'round',
      strokeLineJoin: 'round'
    })

    const polygon = new fabric.Polygon(headPts, {
      fill: ARROW_COLOR,
      stroke: ARROW_COLOR,
      strokeWidth: 0,
      selectable: false,
      evented: false
    })

    const group = new fabric.Group([polyline, polygon], {
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false
    })

    return group
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
      preserveObjectStacking: true,
      imageSmoothingEnabled: true,
      enableRetinaScaling: true
    })

    initialCanvasSizeRef.current = {
      width: canvas.getWidth(),
      height: canvas.getHeight()
    }

    canvas.on('object:moving', () => {
      const active = canvas.getActiveObject()
      if (active) {
        updateConnectorsForObject(canvas, active as fabric.Object)
      } else {
        updateAllConnectors(canvas)
      }
      scheduleCanvasRender(canvas)
    })

    canvas.on('object:added', (event) => {
      if (isUpdatingConnectorsRef.current) return
      queueHistorySnapshot(canvas, event.target as fabric.Object | undefined)
    })

    canvas.on('object:modified', (event) => {
      const target = event.target as fabric.Object | undefined
      if (target) {
        updateConnectorsForObject(canvas, target)
      } else {
        updateAllConnectors(canvas)
      }
      queueHistorySnapshot(canvas, target)
      scheduleCanvasRender(canvas)
    })

    canvas.on('object:removed', (event) => {
      const target = event.target as fabric.Object | undefined
      if (!target) return

      const data = getObjectData(target)

      if (data.isArrowPreview === true) {
        return
      }

      // 커넥터 업데이트 중이면 히스토리/정리 건너뜀
      if (isUpdatingConnectorsRef.current) return

      if (data.isConnector === true) {
        const connectorId = data.connectorId
        if (typeof connectorId === 'string') {
          connectorsRef.current.delete(connectorId)
        }
        queueHistorySnapshot(canvas, target)
        return
      }

      const objectId = data.objectId
      if (typeof objectId === 'string') {
        const stillExists = canvas
          .getObjects()
          .some((obj) => obj !== target && getObjectData(obj).objectId === objectId)

        if (!stillExists) {
          removeConnectorsForObjectId(canvas, objectId)
        }
      }

      if (activeArrowSource.current === target) {
        clearArrowSource()
        clearArrowPreview(canvas)
      }

      queueHistorySnapshot(canvas, target)
    })

    rebuildConnectorsFromCanvas(canvas)
    canvasRef.current = canvas

    // 커넥터 선택 시 핸들 표시
    canvas.on('selection:created', (e) => {
      connectorsRef.current.forEach((c) => setConnectorVisualState(c, false))
      const selected = e.selected?.[0]
      if (selected && getObjectData(selected).isConnector === true) {
        const connectorId = getObjectData(selected).connectorId as string
        const connector = connectorsRef.current.get(connectorId)
        if (connector) {
          drawConnectorHandles(canvas, connector)
          setConnectorVisualState(connector, true)
          canvas.renderAll()
        }
      }
    })

    canvas.on('selection:updated', (e) => {
      clearConnectorHandles(canvas)
      connectorsRef.current.forEach((c) => setConnectorVisualState(c, false))
      const selected = e.selected?.[0]
      if (selected && getObjectData(selected).isConnector === true) {
        const connectorId = getObjectData(selected).connectorId as string
        const connector = connectorsRef.current.get(connectorId)
        if (connector) {
          drawConnectorHandles(canvas, connector)
          setConnectorVisualState(connector, true)
        }
      } else {
        connectorsRef.current.forEach((c) => setConnectorVisualState(c, false))
      }
      canvas.renderAll()
    })

    canvas.on('selection:cleared', () => {
      clearConnectorHandles(canvas)
      connectorsRef.current.forEach((c) => setConnectorVisualState(c, false))
      canvas.renderAll()
    })
    captureHistorySnapshot(canvas)
    syncHistoryState()
  }, [])

  /** dataURL 이미지를 캔버스 배경으로 불러오기 */
  const loadBackground = useCallback(async (dataUrl: string) => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const img = await fabric.FabricImage.fromURL(dataUrl)
      const { width, height } = img

      canvas.setWidth(width)
      canvas.setHeight(height)

      img.set({
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        selectable: false,
        evented: false,
        objectCaching: false,
        noScaleCache: false
      })
      canvas.backgroundImage = img
      canvas.renderAll()
      captureHistorySnapshot(canvas)
    } catch (error) {
      console.error('배경 이미지 로드 실패:', error)
      useEditorStore.getState().showToast('이미지를 불러올 수 없습니다.', 'error')
    }
  }, [])

  /** 사각형 드로잉 모드 활성화 */
  const enableRectMode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    useEditorStore.getState().showToast('영역을 드래그하세요', 'info', 1500)

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
      scheduleCanvasRender(canvas)
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

    useEditorStore.getState().showToast('드래그해서 화살표를 그리세요', 'info', 1500)
    activeArrowRouting.current = useEditorStore.getState().arrowRouting

    // 이전 이벤트 핸들러 모두 제거
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')

    canvas.isDrawingMode = false
    canvas.selection = false
    canvas.defaultCursor = 'crosshair'
    clearArrowPreview(canvas)
    clearArrowSource()
    clearConnectorHandles(canvas)
    canvas.forEachObject((obj) => {
      obj.selectable = false
      obj.evented = false
    })

    let isArrowDrawing = false
    let arrowStartPoint: Point | null = null
    let arrowSnapSource: { obj: fabric.Object; anchor: AnchorSide } | null = null
    let arrowSnapTarget: { obj: fabric.Object; anchor: AnchorSide } | null = null

    const getEndpointHandleAtPointer = (
      pointer: Point
    ): { connectorId: string; endpoint: ConnectorEndpoint } | null => {
      const fabricPoint = new fabric.Point(pointer.x, pointer.y)
      for (let i = connectorHandlesRef.current.length - 1; i >= 0; i--) {
        const handle = connectorHandlesRef.current[i]
        if (!handle.containsPoint(fabricPoint)) continue
        const data = getObjectData(handle)
        if (typeof data.connectorId !== 'string') continue
        if (data.endpoint !== 'source' && data.endpoint !== 'target') continue
        return { connectorId: data.connectorId, endpoint: data.endpoint }
      }
      return null
    }

    const getSnapFromPointer = (
      pointer: Point,
      excludeObject?: fabric.Object
    ): { obj: fabric.Object; anchor: AnchorSide; point: Point } | null => {
      const objects = canvas.getObjects()
      let bestMatch: {
        obj: fabric.Object
        anchor: AnchorSide
        point: Point
        score: number
      } | null = null

      for (let i = objects.length - 1; i >= 0; i--) {
        const candidate = objects[i]
        if (!isConnectableObject(canvas, candidate)) continue
        if (excludeObject && candidate === excludeObject) continue

        const bounds = candidate.getBoundingRect()
        const dx =
          pointer.x < bounds.left
            ? bounds.left - pointer.x
            : pointer.x > bounds.left + bounds.width
              ? pointer.x - (bounds.left + bounds.width)
              : 0
        const dy =
          pointer.y < bounds.top
            ? bounds.top - pointer.y
            : pointer.y > bounds.top + bounds.height
              ? pointer.y - (bounds.top + bounds.height)
              : 0
        const distanceToBounds = Math.hypot(dx, dy)
        const containsPointer = candidate.containsPoint(new fabric.Point(pointer.x, pointer.y))
        if (!containsPointer && distanceToBounds > OBJECT_DETECT_RADIUS) continue

        const anchor = getAnchorPointNearPointer(candidate, pointer)
        if (!anchor) continue

        const anchorPoint = getAnchorPoint(candidate, anchor)
        const anchorDistance = Math.hypot(anchorPoint.x - pointer.x, anchorPoint.y - pointer.y)
        const zOrderPenalty = (objects.length - 1 - i) * 0.1
        const anchorBias = isCornerAnchor(anchor) ? -CORNER_PRIORITY_BIAS : 0
        const score = anchorDistance + anchorBias + distanceToBounds * 0.35 + zOrderPenalty

        if (!bestMatch || score < bestMatch.score) {
          bestMatch = {
            obj: candidate,
            anchor,
            point: anchorPoint,
            score
          }
        }
      }

      if (!bestMatch) return null

      return {
        obj: bestMatch.obj,
        anchor: bestMatch.anchor,
        point: bestMatch.point
      }
    }

    const resetArrowDrawingState = () => {
      isArrowDrawing = false
      arrowStartPoint = null
      arrowSnapSource = null
      arrowSnapTarget = null
    }

    const onMouseDown = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      const endpointHandle = getEndpointHandleAtPointer(pointer)
      if (endpointHandle) {
        const connector = connectorsRef.current.get(endpointHandle.connectorId)
        if (!connector) return
        connectorEditRef.current = {
          connectorId: endpointHandle.connectorId,
          endpoint: endpointHandle.endpoint,
          hoverSnap: null
        }
        drawConnectorHandles(canvas, connector)
        useEditorStore
          .getState()
          .showToast('끝점을 드래그해 다른 객체 연결점에 붙이세요', 'info', 1400)
        return
      }

      const hitObject = findTopObjectAtPointer(canvas, pointer, {
        includeConnectors: true,
        includePreview: false
      })

      if (hitObject && isConnectorPart(hitObject)) {
        clearArrowPreview(canvas)
        clearArrowSource()
        resetArrowDrawingState()
        connectorsRef.current.forEach((connector) => setConnectorVisualState(connector, false))

        const connectorId = getObjectData(hitObject).connectorId
        if (typeof connectorId === 'string') {
          const connector = connectorsRef.current.get(connectorId)
          if (connector) {
            setConnectorVisualState(connector, true)
            canvas.setActiveObject(connector.arrow)
            drawConnectorHandles(canvas, connector)
            useEditorStore
              .getState()
              .showToast('끝점 핸들을 드래그해 재연결하거나 Delete로 삭제하세요', 'info', 1800)
          }
        }
        canvas.renderAll()
        return
      }

      if (hitObject && isFreeArrow(hitObject)) {
        clearArrowPreview(canvas)
        clearArrowSource()
        clearConnectorHandles(canvas)
        resetArrowDrawingState()
        hitObject.set({ selectable: true, evented: true })
        canvas.setActiveObject(hitObject)
        canvas.renderAll()
        return
      }

      isArrowDrawing = true
      const start = { x: pointer.x, y: pointer.y }
      const sourceSnap = getSnapFromPointer(start)

      arrowSnapSource = sourceSnap ? { obj: sourceSnap.obj, anchor: sourceSnap.anchor } : null
      arrowSnapTarget = null
      arrowStartPoint = sourceSnap ? sourceSnap.point : start
      activeArrowRouting.current = useEditorStore.getState().arrowRouting

      clearArrowSource()
      clearConnectorHandles(canvas)
      canvas.discardActiveObject()

      if (sourceSnap) {
        drawAnchorIndicators(canvas, sourceSnap.obj, sourceSnap.anchor)
      } else {
        clearAnchorIndicators(canvas)
      }

      drawArrowPreview(canvas, arrowStartPoint, arrowStartPoint, {
        routing: activeArrowRouting.current,
        sourceAnchor: arrowSnapSource?.anchor,
        targetAnchor: undefined
      })
      scheduleCanvasRender(canvas)
    }

    const onMouseMove = (opt: fabric.TPointerEventInfo) => {
      const pointer = canvas.getScenePoint(opt.e)

      if (connectorEditRef.current) {
        const editState = connectorEditRef.current
        const connector = connectorsRef.current.get(editState.connectorId)
        if (!connector) {
          clearConnectorHandles(canvas)
          clearArrowPreview(canvas)
          return
        }

        const sourceObj = findObjectById(canvas, connector.sourceObjectId)
        const targetObj = findObjectById(canvas, connector.targetObjectId)
        if (!sourceObj || !targetObj) {
          clearConnectorHandles(canvas)
          clearArrowPreview(canvas)
          return
        }

        const hoverSnap = getSnapFromPointer(pointer)
        editState.hoverSnap = hoverSnap

        const sourcePoint =
          editState.endpoint === 'source'
            ? (hoverSnap?.point ?? { x: pointer.x, y: pointer.y })
            : getAnchorPoint(sourceObj, connector.sourceAnchor)

        const targetPoint =
          editState.endpoint === 'target'
            ? (hoverSnap?.point ?? { x: pointer.x, y: pointer.y })
            : getAnchorPoint(targetObj, connector.targetAnchor)

        drawArrowPreview(canvas, sourcePoint, targetPoint, {
          routing: connector.routing,
          sourceAnchor:
            editState.endpoint === 'source'
              ? (hoverSnap?.anchor ?? connector.sourceAnchor)
              : connector.sourceAnchor,
          targetAnchor:
            editState.endpoint === 'target'
              ? (hoverSnap?.anchor ?? connector.targetAnchor)
              : connector.targetAnchor
        })
        scheduleCanvasRender(canvas)
        return
      }

      if (!isArrowDrawing || !arrowStartPoint) {
        scheduleCanvasRender(canvas)
        return
      }

      const nextTargetSnap = getSnapFromPointer(pointer, arrowSnapSource?.obj)
      let targetSnap: { obj: fabric.Object; anchor: AnchorSide; point: Point } | null = null

      if (arrowSnapTarget) {
        const lockedPoint = getAnchorPoint(arrowSnapTarget.obj, arrowSnapTarget.anchor)
        const lockDistance = Math.hypot(pointer.x - lockedPoint.x, pointer.y - lockedPoint.y)

        if (lockDistance <= ANCHOR_LOCK_RELEASE_RADIUS) {
          targetSnap = {
            obj: arrowSnapTarget.obj,
            anchor: arrowSnapTarget.anchor,
            point: lockedPoint
          }
        } else {
          arrowSnapTarget = null
        }
      }

      if (!targetSnap && nextTargetSnap) {
        arrowSnapTarget = { obj: nextTargetSnap.obj, anchor: nextTargetSnap.anchor }
        targetSnap = nextTargetSnap
      }

      const endPoint = targetSnap ? targetSnap.point : { x: pointer.x, y: pointer.y }

      if (arrowSnapSource) {
        drawAnchorIndicators(canvas, arrowSnapSource.obj, arrowSnapSource.anchor)
        if (targetSnap && targetSnap.obj !== arrowSnapSource.obj) {
          drawAnchorIndicators(canvas, targetSnap.obj, targetSnap.anchor, { append: true })
        }
      } else {
        clearAnchorIndicators(canvas)
      }

      drawArrowPreview(canvas, arrowStartPoint, endPoint, {
        routing: activeArrowRouting.current,
        sourceAnchor: arrowSnapSource?.anchor,
        targetAnchor: targetSnap?.anchor
      })
      scheduleCanvasRender(canvas)
    }

    const onMouseUp = (opt: fabric.TPointerEventInfo) => {
      if (connectorEditRef.current) {
        const editState = connectorEditRef.current
        const connector = connectorsRef.current.get(editState.connectorId)
        if (connector && editState.hoverSnap) {
          const objectId = ensureObjectId(editState.hoverSnap.obj)

          if (editState.endpoint === 'source') {
            connector.sourceObjectId = objectId
            connector.sourceAnchor = editState.hoverSnap.anchor
          } else {
            connector.targetObjectId = objectId
            connector.targetAnchor = editState.hoverSnap.anchor
          }

          updateConnector(canvas, connector)
          drawConnectorHandles(canvas, connector)
          queueHistorySnapshot(canvas, connector.arrow)
        }

        clearArrowPreview(canvas)
        clearAnchorIndicators(canvas)
        connectorEditRef.current = null
        canvas.renderAll()
        return
      }

      if (!isArrowDrawing || !arrowStartPoint) return

      const pointer = canvas.getScenePoint(opt.e)
      const sourceSnap = arrowSnapSource
      const targetSnap = arrowSnapTarget
        ? {
            obj: arrowSnapTarget.obj,
            anchor: arrowSnapTarget.anchor,
            point: getAnchorPoint(arrowSnapTarget.obj, arrowSnapTarget.anchor)
          }
        : getSnapFromPointer(pointer, sourceSnap?.obj)
      const endPoint = targetSnap ? targetSnap.point : { x: pointer.x, y: pointer.y }
      const distance = Math.hypot(endPoint.x - arrowStartPoint.x, endPoint.y - arrowStartPoint.y)

      if (distance >= 10) {
        if (sourceSnap && targetSnap) {
          createConnector(
            canvas,
            sourceSnap.obj,
            targetSnap.obj,
            sourceSnap.anchor,
            targetSnap.anchor,
            activeArrowRouting.current
          )
        } else {
          createFreeArrow(canvas, arrowStartPoint, endPoint, activeArrowRouting.current)
        }

        onArrowComplete?.()
      }

      clearAnchorIndicators(canvas)
      clearArrowPreview(canvas)
      clearArrowSource()
      clearConnectorHandles(canvas)
      resetArrowDrawingState()
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
      clearArrowPreview(canvas)
      clearAnchorIndicators(canvas)
      clearConnectorHandles(canvas)
      clearArrowSource()
      resetArrowDrawingState()

      // 모든 화살표의 색상을 원래대로 복원
      connectorsRef.current.forEach((connector) => {
        setConnectorVisualState(connector, false)
      })

      canvas.renderAll()
    }
  }, [])

  /** 텍스트 입력 모드 활성화 */
  const enableTextMode = useCallback((onComplete?: () => void) => {
    const canvas = canvasRef.current
    if (!canvas) return

    useEditorStore.getState().showToast('텍스트를 입력할 위치를 클릭하세요', 'info', 1500)

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
      // 현재 편집 중인 텍스트박스가 있으면 무시 (editing:exited가 뒤따라 발생함)
      const activeObject = canvas.getActiveObject()
      if (activeObject && (activeObject as fabric.Textbox).isEditing) {
        return
      }

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

      // 편집 완료 시 select 모드로 전환
      const onEditingExited = () => {
        textbox.off('editing:exited', onEditingExited)
        onComplete?.()
      }
      textbox.on('editing:exited', onEditingExited)

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

    useEditorStore.getState().showToast('숫자를 추가할 위치를 클릭하세요', 'info', 1500)

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

    useEditorStore.getState().showToast('블러할 영역을 드래그하세요', 'info', 1500)

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
      scheduleCanvasRender(canvas)
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
          const multiplier = getPixelRatioMultiplier()
          const patchDataUrl = canvas.toDataURL({
            format: 'png',
            left,
            top,
            width,
            height,
            multiplier
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
          useEditorStore.getState().showToast('블러 효과 적용에 실패했습니다.', 'error')
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
    clearAnchorIndicators(canvas)
    clearConnectorHandles(canvas)

    canvas.defaultCursor = 'default'
    canvas.selection = true
    canvas.forEachObject((obj) => {
      obj.selectable = true
      obj.evented = true
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

  /** 전체 선택 */
  const selectAll = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const selectableObjects = canvas
      .getObjects()
      .filter((obj) => obj !== canvas.backgroundImage && !isPreviewPart(obj))

    if (selectableObjects.length === 0) {
      canvas.discardActiveObject()
      canvas.renderAll()
      return false
    }

    if (selectableObjects.length === 1) {
      canvas.setActiveObject(selectableObjects[0])
    } else {
      const selection = new fabric.ActiveSelection(selectableObjects, { canvas })
      canvas.setActiveObject(selection)
    }

    canvas.renderAll()
    return true
  }, [])

  /** 선택된 객체 이동 */
  const moveSelectedBy = useCallback((dx: number, dy: number) => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const activeObject = canvas.getActiveObject()
    if (!activeObject) return false

    activeObject.set({
      left: (activeObject.left ?? 0) + dx,
      top: (activeObject.top ?? 0) + dy
    })

    activeObject.setCoords()

    if (activeObject instanceof fabric.ActiveSelection) {
      activeObject.getObjects().forEach((obj) => {
        obj.setCoords()
        updateConnectorsForObject(canvas, obj)
      })
    } else {
      updateConnectorsForObject(canvas, activeObject as fabric.Object)
    }

    queueHistorySnapshot(canvas)
    scheduleCanvasRender(canvas)
    return true
  }, [])

  /** 선택된 객체 복제 */
  const duplicateSelected = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return false

    const activeObject = canvas.getActiveObject()
    if (!activeObject) return false

    const offset = 20
    const clones: fabric.Object[] = []

    if (activeObject instanceof fabric.ActiveSelection) {
      const selectedObjects = [...activeObject.getObjects()]
      canvas.discardActiveObject()

      for (const obj of selectedObjects) {
        if (isConnectorPart(obj) || isPreviewPart(obj)) continue
        const cloned = await obj.clone()
        ensureObjectId(cloned)
        cloned.set({
          left: (obj.left ?? 0) + offset,
          top: (obj.top ?? 0) + offset,
          selectable: true,
          evented: true
        })
        if (isConnectorPart(cloned)) {
          patchObjectData(cloned, { connectorId: undefined, isConnector: false })
        }
        canvas.add(cloned)
        clones.push(cloned)
      }
    } else {
      if (isConnectorPart(activeObject) || isPreviewPart(activeObject)) return false

      const cloned = await activeObject.clone()
      ensureObjectId(cloned)
      cloned.set({
        left: (activeObject.left ?? 0) + offset,
        top: (activeObject.top ?? 0) + offset,
        selectable: true,
        evented: true
      })
      canvas.discardActiveObject()
      canvas.add(cloned)
      clones.push(cloned)
    }

    if (clones.length === 0) {
      canvas.renderAll()
      return false
    }

    if (clones.length === 1) {
      canvas.setActiveObject(clones[0])
    } else {
      const selection = new fabric.ActiveSelection(clones, { canvas })
      canvas.setActiveObject(selection)
    }

    queueHistorySnapshot(canvas)
    canvas.renderAll()
    return true
  }, [])

  /** dataURL 이미지를 오브젝트로 삽입 */
  const insertImageObject = useCallback(async (dataUrl: string) => {
    const canvas = canvasRef.current
    if (!canvas) return false

    try {
      const image = await fabric.FabricImage.fromURL(dataUrl)
      const maxDisplayWidth = Math.max(160, Math.floor(canvas.getWidth() * 0.7))
      const maxDisplayHeight = Math.max(120, Math.floor(canvas.getHeight() * 0.7))
      const scale = Math.min(1, maxDisplayWidth / image.width, maxDisplayHeight / image.height)

      image.set({
        left: Math.max(0, (canvas.getWidth() - image.width * scale) / 2),
        top: Math.max(0, (canvas.getHeight() - image.height * scale) / 2),
        scaleX: scale,
        scaleY: scale,
        selectable: true,
        evented: true,
        objectCaching: false,
        noScaleCache: false
      })

      ensureObjectId(image)
      canvas.add(image)
      canvas.setActiveObject(image)
      queueHistorySnapshot(canvas, image)
      canvas.renderAll()
      return true
    } catch (error) {
      console.error('오브젝트 이미지 삽입 실패:', error)
      useEditorStore.getState().showToast('이미지를 삽입할 수 없습니다.', 'error')
      return false
    }
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
    const multiplier = getPixelRatioMultiplier()
    return canvasRef.current?.toDataURL({ format: 'png', multiplier }) ?? null
  }, [])

  const resetNumberCounter = useCallback(() => {
    numberCounter.current = 1
  }, [])

  const resetToInitialState = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    if (renderRafRef.current !== null) {
      window.cancelAnimationFrame(renderRafRef.current)
      renderRafRef.current = null
    }

    isRestoringHistoryRef.current = true

    clearArrowPreview(canvas)
    clearArrowSource()
    canvas.discardActiveObject()
    canvas.off('mouse:down')
    canvas.off('mouse:move')
    canvas.off('mouse:up')
    canvas.clear()
    canvas.setWidth(initialCanvasSizeRef.current.width)
    canvas.setHeight(initialCanvasSizeRef.current.height)
    canvas.selection = true
    canvas.defaultCursor = 'default'

    connectorsRef.current.clear()
    anchorIndicatorsRef.current = []
    connectorHandlesRef.current = []
    connectorEditRef.current = null
    objectIdCounter.current = 1
    connectorIdCounter.current = 1
    numberCounter.current = 1
    isDrawing.current = false
    activeRect.current = null
    activeArrow.current = null
    activeArrowHead.current = null
    activeText.current = null
    activeNumber.current = null
    activeBlur.current = null

    historyRef.current = []
    historyIndexRef.current = -1
    syncHistoryState()
    canvas.renderAll()

    isRestoringHistoryRef.current = false
    captureHistorySnapshot(canvas)
  }, [])

  /** 캔버스 인스턴스 반환 */
  const getCanvas = useCallback(() => {
    return canvasRef.current
  }, [])

  const cleanup = useCallback(() => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    if (renderRafRef.current !== null) {
      window.cancelAnimationFrame(renderRafRef.current)
      renderRafRef.current = null
    }
    if (canvasRef.current) {
      canvasRef.current.dispose()
      canvasRef.current = null
    }
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
    resetNumberCounter,
    resetToInitialState,
    disableAllDrawingModes,
    disableRectMode,
    exportAsDataURL,
    deleteSelected,
    selectAll,
    moveSelectedBy,
    duplicateSelected,
    insertImageObject,
    undo,
    redo,
    cleanup
  }
}
