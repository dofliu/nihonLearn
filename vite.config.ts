import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Sidecar（5090 工作站上的 FastAPI）位址。開發時代理 /api → sidecar，
// 讓前端不必處理 CORS。正式部署改用 Cloudflare Tunnel / Tailscale 的網址。
const SIDECAR = process.env.SIDECAR_URL || 'http://127.0.0.1:8848'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '日本語の道',
        short_name: '日本語の道',
        description: '個人化日語學習 — 聽說讀三軌',
        theme_color: '#24466B',
        background_color: '#F4F1E8',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // 音檔快取：sidecar 產生的 TTS wav 快取到本機，離線可複習
        runtimeCaching: [
          {
            urlPattern: /\/api\/tts/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-audio',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: SIDECAR,
        changeOrigin: true,
      },
    },
  },
})
