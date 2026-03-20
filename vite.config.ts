import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/manifest': {
          target: 'https://storage.googleapis.com/memolody-vault/manifest.json',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/manifest/, '')
        }
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', '*.png', '*.svg'],
        manifest: {
          name: 'Memolody V2',
          short_name: 'Memolody',
          description: 'AI Music Practice App',
          theme_color: '#0A0A0B',
          background_color: '#0A0A0B',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        },
        workbox: {
          // Cache all JS/CSS/HTML assets aggressively
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Runtime cache for API calls
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/storage\.googleapis\.com\/memolody-vault\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'vault-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 } }
            },
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly', // Never cache Gemini API calls
            }
          ],
          // Skip waiting — activate SW immediately
          skipWaiting: true,
          clientsClaim: true,
        }
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') }
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core — tiny, loads immediately
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Tone.js — HEAVY, only load when player opens
            if (id.includes('node_modules/tone') || id.includes('node_modules/@tonejs')) {
              return 'vendor-tone';
            }
            // Icons — medium, tree-shaken by Vite
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // Heavy document libs — only needed for export features
            if (id.includes('node_modules/jszip') || id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
              return 'vendor-docs';
            }
            // Supabase — only load when auth needed
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
          }
        }
      }
    }
  };
});
