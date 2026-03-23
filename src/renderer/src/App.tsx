import FabricCanvas from '@renderer/components/FabricCanvas/FabricCanvas'
import ToastHost from '@renderer/components/Toast/ToastHost'
import Toolbar from '@renderer/components/Toolbar/Toolbar'

function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#1E1E1E] flex flex-col items-center justify-center overflow-hidden pb-24">
      <ToastHost />
      <FabricCanvas />
      <Toolbar />
    </div>
  )
}

export default App
