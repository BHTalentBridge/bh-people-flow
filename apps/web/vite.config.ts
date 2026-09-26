import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Dev and preview both proxy /api, so a production build can be exercised
// locally (`npm run build && npx vite preview`) against the same API without
// tripping CORS — dev-mode timings are not representative of the real thing.
const proxy = { '/api': { target: 'http://localhost:4000', changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5173, proxy },
  preview: { port: 4174, proxy },
});
