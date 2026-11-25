import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { fetchFlags } from './flags/flags.ts'

// Flags are read once per page load, before the first render, so App gets
// them as a plain prop. fetchFlags never rejects and gives up after 3 s.
void fetchFlags().then((flags) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App flags={flags} />
    </StrictMode>,
  )
})
