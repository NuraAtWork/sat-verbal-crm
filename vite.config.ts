import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Относительные пути: сайт работает и на <user>.github.io/sat-verbal-crm/, и на своём домене.
  // Роутинг через HashRouter, поэтому 404.html для GitHub Pages не нужен.
  base: './',
})
