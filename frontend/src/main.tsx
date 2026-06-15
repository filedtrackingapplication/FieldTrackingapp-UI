import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import networkManager from './services/networkManager'

// ─── Service Worker registration ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err))
  })
}

// ─── Initialise IndexedDB + network manager ───────────────────────────────────
networkManager.init().catch(console.error)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

