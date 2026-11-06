import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      // Forward requests beginning with /api to Express.
      //
      // Example:
      // Frontend: /api/health
      // Backend:  http://localhost:5000/api/health
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,

        // Do not remove /api.
        // Ruvindra's backend routes now include this prefix.
      },
    },
  },
})