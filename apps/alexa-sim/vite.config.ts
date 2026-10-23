import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // IPv4: some browsers resolve localhost to 127.0.0.1 only
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${process.env.SIM_PORT ?? 8788}`, changeOrigin: true } },
  },
});
