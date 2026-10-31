import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Хөгжүүлэлтэд /api хүсэлтийг локал API руу дамжуулна. Production-д CloudFront
// /api/* замыг ALB руу чиглүүлдэг тул frontend ба API нэг origin-оос ажиллана
// (CORS шаардлагагүй, refresh cookie SameSite=Strict хэвээр ажиллана).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.BMMS_API_URL || 'http://localhost:8080', changeOrigin: false } },
  },
  build: { sourcemap: false, target: 'es2022' },
});
