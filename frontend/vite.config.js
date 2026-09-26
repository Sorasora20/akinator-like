import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/akinator/',
  plugins: [react()],
  server: {
    port: 8081,
    proxy: {
      '/akinator/chat': {
        target: 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/akinator\/chat/, '/chat')
      }
    }
  }
})
