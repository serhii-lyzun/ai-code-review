import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs, so one build works from any folder: deploy.yml
  // publishes the same dist/ to /dev/, /stg/ and /prd/ on GitHub Pages.
  base: './',
  plugins: [react()],
})
