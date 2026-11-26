import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { fetchFlags } from './flags/flags.ts'
import { initMonitoring, monitoringConfig } from './monitoring/monitoring.ts'

// Flags are read and Sentry is started once per page load, before the first
// render, so App gets the flags as a plain prop and render errors reach
// Sentry. Neither promise rejects, and fetchFlags gives up after 3 s.
void Promise.all([
  fetchFlags(),
  initMonitoring(monitoringConfig(import.meta.env, window.location.pathname)),
]).then(([flags, errorHandlers]) => {
  createRoot(document.getElementById('root')!, errorHandlers).render(
    <StrictMode>
      <App flags={flags} />
    </StrictMode>,
  )
})
