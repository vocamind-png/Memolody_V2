import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Load .env file variables — prefix '' means load ALL vars (not just VITE_ prefixed)
  const env = loadEnv(mode, '.', '');

  // Read API key: .env file first, then process.env (for Vercel), then empty fallback
  const GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  // Local mode: set VITE_LOCAL_VOCALIDO=true in .env.local to route all
  const LOCAL_VOCALIDO = env.VITE_LOCAL_VOCALIDO === 'true';
  const OMR_TARGET = env.VITE_OMR_URL || 'http://127.0.0.1:3003';

  if (!GEMINI_KEY) {
    console.warn('⚠️  GEMINI_API_KEY is not set! Create a .env file with: GEMINI_API_KEY=your_key_here');
  } else {
    console.log('✅ GEMINI_API_KEY loaded, length:', GEMINI_KEY.length);
  }

  // --- VOCALIDO SVS PROXY ROUTING ---
  // AI tasks (Demucs) require GPU so they go to Cloud/Runpod if configured.
  // Other tasks (YouTube download, standard rendering) stay local to avoid IP bans.
  const LOCAL_SERVER = 'http://127.0.0.1:5001';
  const CLOUD_TARGET = env.VITE_VOCALIDO_URL || 'https://z6i0v69lze2w4o-8888.proxy.runpod.net';
  const AI_TARGET = LOCAL_VOCALIDO ? LOCAL_SERVER : CLOUD_TARGET;
  const VOCALIDO_TARGET = LOCAL_VOCALIDO ? LOCAL_SERVER : CLOUD_TARGET;

  console.log(`🎤 Vocalido AI Target: ${AI_TARGET}`);
  console.log(`🎤 Vocalido Local Target: ${LOCAL_SERVER}`);

  // We have to modify the proxy config below
  // ... but wait, I can just replace the whole proxy object up to the next proxy
  
  return {
    worker: {
      format: 'es'
    },
    server: {
      port: 3100,
      host: '0.0.0.0',
      allowedHosts: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      },
      watch: {
        ignored: ['**/vocalido_server/**', '**/node_modules/**', '**/.git/**', '**/renders/**', '**/cache/**'],
      },
      proxy: {
        '/api/manifest': {
          target: 'https://storage.googleapis.com/memolody-vault/manifest.json',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/manifest/, '')
        },
        // --- AI & Cloud Targets (Runpod) ---
        '/vocalido/api/ai': {
          target: AI_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        '/vocalido/api/upload-audio': {
          target: AI_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        '/vocalido/audio/stems': {
          target: AI_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        // --- Everything Else (including YouTube download) → Local or Cloud depending on config ---
        '/vocalido': {
          target: LOCAL_VOCALIDO ? LOCAL_SERVER : CLOUD_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        // Proxy OMR server (port 3003)
        '/api': {
          target: OMR_TARGET,
          changeOrigin: true,
          secure: false,
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
        },
        // --- RUNPOD SERVERLESS PROXY (bypass CORS restrictions in local dev) ---
        '/api/runpod': {
          target: 'https://api.runpod.ai/v2',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/runpod/, '')
        }
      }
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api/manifest': {
          target: 'https://storage.googleapis.com/memolody-vault/manifest.json',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/manifest/, '')
        },
        '/vocalido': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/vocalido/, '')
        },
        '/studio': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
        },
        '/song_': {
          target: VOCALIDO_TARGET,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => `/studio/audio${path}`
        },
        '/gemini-api': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/gemini-api/, ''),
          timeout: 180000,
        },
        '/api/runpod': {
          target: 'https://api.runpod.ai/v2',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/runpod/, '')
        }
      }
    },
    plugins: [
      react()
    ],
    define: {
      // Use process.env directly so Vercel env vars work at build time
      'process.env.API_KEY': JSON.stringify(GEMINI_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(GEMINI_KEY),
      '__GEMINI_API_KEY__': JSON.stringify(GEMINI_KEY)
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
