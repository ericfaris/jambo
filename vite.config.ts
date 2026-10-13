import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
// The game server the dev proxy talks to (JAMBO_API_PORT when 3001 is taken)
const apiPort = process.env.JAMBO_API_PORT || '3001'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        receiver: resolve(import.meta.dirname, 'receiver/react/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
      },
      '/ws': {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
})