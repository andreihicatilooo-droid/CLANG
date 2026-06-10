import { HashRouter, Routes, Route } from 'react-router-dom'
import SettingsScreen from './components/SettingsScreen'
import CaptureScreen from './components/CaptureScreen'
import OverlayScreen from './components/OverlayScreen'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<SettingsScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/overlay" element={<OverlayScreen />} />
      </Routes>
    </HashRouter>
  )
}

export default App
