import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <PermissionsProvider>
        <App />
      </PermissionsProvider>
    </SettingsProvider>
  </React.StrictMode>,
)