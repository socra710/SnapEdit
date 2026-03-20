import { useEditorStore, type Tool } from '@renderer/store/editorStore'

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
    ),
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
    ),
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
    ),
  },
  {
    id: 'number',
    label: '번호',
    title: '스텝 번호 (N)',
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
    ),
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
    ),
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
    ),
  },
]

export default function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/8 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              title={tool.title}
              onClick={() => setActiveTool(tool.id)}
              className={[
                'flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 whitespace-nowrap',
                isActive
                  ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/8',
              ].join(' ')}
            >
              {tool.icon}
              <span className="leading-none">{tool.label}</span>
            </button>
          )
        })}

        {/* 구분선 */}
        <div className="w-px h-8 bg-white/10 mx-1" />

        {/* Ctrl+C 복사 버튼 */}
        <button
          title="클립보드에 복사 (Ctrl+C)"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
          }}
          className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/8 transition-all duration-150"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
          <span className="leading-none">복사</span>
        </button>
      </div>
    </div>
  )
}
