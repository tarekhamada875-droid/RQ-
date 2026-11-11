/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import postcssCascadeLayers from '@csstools/postcss-cascade-layers';
import postcssOklabFunction from '@csstools/postcss-oklab-function';
import postcssColorMixFunction from '@csstools/postcss-color-mix-function';
import autoprefixer from 'autoprefixer';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false, // We already have our own manifest.json in public/
        injectRegister: false, // Performance: don't inject registerSW.js as render-blocking script. We handle SW registration ourselves via the inline script in index.html (which runs after First Paint via window.addEventListener('load')).
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // PR-G: exclude lazy-loaded chunks from the SW precache. These
          // chunks are fetched on demand via dynamic import() — precaching
          // them would download ~238 KB of code the user may never need
          // (e.g. admin tab views for non-admin users, motion for routes
          // that don't use it). The SW caches them at runtime when first
          // requested via the default runtime caching behavior.
          globIgnores: [
            '**/Admin*View-*.js',   // 8 lazy admin tab chunks
            '**/*Modal-*.js',       // 5 lazy modal chunks
            '**/motion-*.js',       // motion chunk (lazy via code-split)
          ],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // Keep CI memory use predictable on GitHub-hosted runners.
      maxWorkers: 2,
    },
    css: {
      postcss: {
        plugins: [
          postcssCascadeLayers(),
          postcssOklabFunction({ preserve: false, subFeatures: { displayP3: false } }),
          postcssColorMixFunction({ preserve: false }),
          autoprefixer(),
        ],
      },
    },
    build: {
      target: 'es2015',
      cssTarget: 'chrome60',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 2000,
      // LCP win 2: disable ALL modulepreload links. Vite adds <link
      // rel="modulepreload"> for every chunk the app imports — including
      // the 623KB firebase chunk — forcing the browser to download
      // everything BEFORE first paint. Disabling preloading means the
      // browser only downloads chunks when they're actually imported
      // at runtime. The app's loading screen renders immediately with
      // just the index chunk (~126KB), then firebase loads after.
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // LCP win: split Firebase into auth + firestore chunks.
              // Auth is needed for login (small, ~100KB). Firestore is
              // needed for data (larger, ~500KB). The app loads auth
              // first (fast login screen), then firestore loads after.
              if (id.includes('firebase/auth') || id.includes('@firebase/auth')) return 'firebase-auth';
              if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) return 'firebase-firestore';
              if (id.includes('firebase/app') || id.includes('@firebase/app') || id.includes('@firebase/util') || id.includes('firebase/app-check')) return 'firebase-core';
              if (id.includes('firebase')) return 'firebase-other';
              if (id.includes('motion')) return 'motion';
              if (id.includes('react') || id.includes('lucide-react')) return 'vendor';
              return 'deps';
            }
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
