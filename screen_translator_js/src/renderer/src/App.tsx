import { HashRouter, Routes, Route } from 'react-router-dom'
import SettingsScreen from './components/SettingsScreen'
import CaptureScreen from './components/CaptureScreen'
import ResultScreen from './components/ResultScreen'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<SettingsScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/result" element={<ResultScreen />} />
      </Routes>
    </HashRouter>
  )
}

export default App
