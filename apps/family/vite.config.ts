import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Dev: the proxy adds the family bearer token server-side, so the browser never holds it.
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, '../../', ''), ...process.env };
  const target = env.MCP_SERVER_URL ? new URL(env.MCP_SERVER_URL).origin : 'http://localhost:8787';
  const headers = env.FAMILY_TOKEN ? { authorization: `Bearer ${env.FAMILY_TOKEN}` } : {};
  return {
    // Built for /family/ on the web service; dev serves it at the root.
    base: command === 'build' ? '/family/' : '/',
    plugins: [react()],
    server: {
      host: '127.0.0.1', // IPv4: some browsers resolve localhost to 127.0.0.1 only
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true, headers },
        '/report': { target, changeOrigin: true, headers },
      },
    },
  };
});
