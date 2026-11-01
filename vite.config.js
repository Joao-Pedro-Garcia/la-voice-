import { defineConfig } from 'vite';

const SERVER = process.env.LAVOICE_SERVER || 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    testTimeout: 20000,
  },
});
