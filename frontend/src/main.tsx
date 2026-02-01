import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initSentry } from './sentry.config'
import { getTenantId, getTenantConfig } from './utils/tenant'
import { ABCModelProvider } from './services/abcModelService'

// Inicializar Sentry antes de renderizar la aplicación
initSentry()

// Detectar tenant y configurar según corresponda
const tenantId = getTenantId()
const tenantConfig = getTenantConfig(tenantId)

// Log tenant detection (solo en desarrollo)
if (import.meta.env.DEV) {
  console.log('🏢 Tenant detected:', tenantId || 'default (granja)')
  console.log('🎨 Tenant config:', tenantConfig)
}

// Aplicar branding básico al documento
if (tenantConfig) {
  document.title = tenantConfig.name
  // Aquí podrías aplicar CSS variables para theming:
  // document.documentElement.style.setProperty('--primary-color', tenantConfig.primaryColor)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ABCModelProvider>
      <App />
    </ABCModelProvider>
  </React.StrictMode>,
)