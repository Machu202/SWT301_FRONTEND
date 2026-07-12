import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets allow the production build to work under a GitHub Pages repository path.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
