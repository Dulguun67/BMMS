// Зөвхөн E2E тестэд: jsdom ES module ажиллуулдаггүй тул нэг IIFE файл болгон бүтээнэ
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  
  plugins: [react()],
  build: { outDir: 'e2e/.build', emptyOutDir: true, modulePreload: false, minify: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } },
});
