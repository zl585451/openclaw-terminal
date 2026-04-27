import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { ProjectProvider } from './contexts/ProjectContext'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/600.css'
import 'katex/dist/katex.min.css'
import './styles/global.css'
import './styles/prism-oct.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <PermissionsProvider>
        <ProjectProvider>
          <App />
        </ProjectProvider>
      </PermissionsProvider>
    </SettingsProvider>
  </React.StrictMode>,
)
