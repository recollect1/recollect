import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${process.env.SIM_PORT ?? 8788}`, changeOrigin: true } },
  },
});
