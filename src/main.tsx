import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/600.css'
import './styles/global.css'
import './styles/prism-oct.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <PermissionsProvider>
        <App />
      </PermissionsProvider>
    </SettingsProvider>
  </React.StrictMode>,
)