import './App.css'
import { AuthProvider } from './context/AuthContext'
import { PanelUIProvider } from './context/PanelUIContext'
import ImpersonationBanner from './components/ImpersonationBanner'
import AppRoutes from './routes/AppRoutes'

function App() {
  return (
    <AuthProvider>
      <PanelUIProvider>
        <AppRoutes />
        <ImpersonationBanner />
      </PanelUIProvider>
    </AuthProvider>
  )
}

export default App
