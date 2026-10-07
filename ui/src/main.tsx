import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './design/tokens.css'

document.documentElement.dataset.direction = 'filament'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
