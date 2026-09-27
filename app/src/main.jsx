import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadContext } from './local/bridge.js'

const context = await loadContext()
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App {...context} />
  </StrictMode>,
)
