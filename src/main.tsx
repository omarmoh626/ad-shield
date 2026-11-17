import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// @ts-expect-error Vite bundles CSS imports at runtime.
import './ui/theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
