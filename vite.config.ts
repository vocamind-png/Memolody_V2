import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Load .env file variables — prefix '' means load ALL vars (not just VITE_ prefixed)
  const env = loadEnv(mode, '.', '');

  // Read API key: .env file first, then process.env (for Vercel), then empty fallback
  const GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  // Local mode: set VITE_LOCAL_VOCALIDO=true in .env.local to route all
  // Vocalido traffic to localhost:5001 instead of the Google Cloud VM.
  const LOCAL_VOCALIDO = env.VITE_LOCAL_VOCALIDO === 'true';
  const VOCALIDO_TARGET = LOCAL_VOCALIDO
    ? 'http://localhost:5001'
    : 'http://35.247.141.53:5001';

  if (!GEMINI_KEY) {
    console.warn('⚠️  GEMINI_API_KEY is not set! Create a .env file with: GEMINI_API_KEY=your_key_here');
  } else {
    console.log('✅ GEMINI_API_KEY loaded, length:', GEMINI_KEY.length);
  }
  console.log(`🎤 Vocalido target: ${VOCALIDO_TARGET} (LOCAL_VOCALIDO=${LOCAL_VOCALIDO})`);

  return {
    server: {
      port: 3100,
      host: '0.0.0.0',
      allowedHosts: true,
      watch: {
        // Ignore Python venv and node_modules to prevent spurious reloads
        ignored: ['**/vocalido_server/.venv/**', '**/node_modules/**', '**/.git/**'],
      },
      proxy: {
        '/api/manifest': {
          target: 'https://storage.googleapis.com/memolody-vault/manifest.json',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/manifest/, '')
        },
        // --- VOCALIDO SVS PROXY → Cloud VM or localhost (set VITE_LOCAL_VOCALIDO=true for local) ---
        '/vocalido': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        // --- VOICE STUDIO → Local server ---
        '/studio': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
        },
        // --- ROOT-LEVEL SONG RENDERED FILES → Local server ---
        '/song_': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => `/studio/audio${path}`
        },
        // --- GEMINI API PROXY (bypass CORS/referrer restrictions) ---
        '/gemini-api': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/gemini-api/, ''),
          timeout: 180000,
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
          globIgnores: ['**/verovio-toolkit.js'],
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
      // Use process.env directly so Vercel env vars work at build time
      'process.env.API_KEY': JSON.stringify(GEMINI_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(GEMINI_KEY)
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') }
    },
    build: {
      outDir: process.env.VERCEL ? 'dist' : 'vocalido_server/static',
      emptyOutDir: true,
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
