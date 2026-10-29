import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/-ai-reversal-test/', // 修正 GitHub Pages 二級目錄路徑問題
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
