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
        // Update handoff is now user-controlled (owner complaint 2026-11-18:
        // "start entering data or deleting or checking in/out a car suddenly I
        // get a refresh"). With skipWaiting:true the freshly installed worker
        // took over the LIVE page mid-session and cleanupOutdatedCaches
        // deleted the old precache while the old shell was still running —
        // the next lazy import (CheckInModal/CheckOutModal/DeleteVehicle… are
        // dynamic import() chunks) 404'd and lazyWithRetry/vite:preloadError
        // reloaded the page right under the user's fingers. With
        // skipWaiting:false the new worker WAITS: the running session keeps
        // its intact precache (nothing is deleted, no chunk can 404) and the
        // new version activates on the next full reopen — or immediately when
        // the user taps the non-blocking "new version ready" toast added to
        // the inline registration script in index.html (it posts SKIP_WAITING;
        // the #772 controllerchange listener then performs the reload).
        registerType: 'prompt',
        manifest: false, // We already have our own manifest.json in public/
        injectRegister: false, // Performance: don't inject registerSW.js as render-blocking script. We handle SW registration ourselves via the inline script in index.html (which runs after First Paint via window.addEventListener('load')).
        workbox: {
          skipWaiting: false,
          // clientsClaim stays true for the explicit update path: when the
          // user taps the toast, SKIP_WAITING activates the waiting worker
          // and clientsClaim takes over the live page, firing
          // controllerchange -> the guarded one-shot reload in index.html.
          // Auto-activation (all tabs closed) claims nothing, so it is a
          // no-op for the reopen path.
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Precache ALL build chunks, including the lazy modals and admin
          // tab views (reverts PR-G's globIgnores). Reason: a chunk that is
          // NOT precached must come from the network, and Cloudflare Pages
          // stops serving the previous deployment's hashed files after a
          // deploy — so a session running the previous shell could not load
          // a lazily-opened modal and was forced to reload mid-action. With
          // everything precached, an older-but-still-live session serves
          // every chunk from its own precache and never breaks; the extra
          // install traffic (~240 KB) is a one-time background download per
          // deploy.
          // PERF (2026-11-20): added woff2 + json so self-hosted fonts and
          // manifest.json are precached by the service worker.
          // - woff2: without this, the first cold boot after a deploy hits
          //   the network for fonts (defeating the self-hosting perf win);
          //   on 2G that adds 1-2s even though the files are local.
          // - json: manifest.json is referenced via <link rel="manifest">
          //   in index.html. The browser requests it on every page load.
          //   Without precaching, each load costs ~300-452ms of network RTT
          //   for a 385-byte file. With precaching, it comes from the SW
          //   cache instantly (0ms after first boot).
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
          // F-11 (cleanliness audit 2026-11-26, owner pick: option B): the
          // Amiri pair (~120 KB) serves two rarely-seen views only. Precaching
          // forced every device to download and store both files on every
          // deploy whether or not those views ever opened. Excluded here, the
          // browser fetches them lazily — a standard @font-face request fires
          // only when rendered text actually uses the family — and the
          // /fonts/* 7-day _headers cache covers repeat visits. Inter/Outfit
          // stay precached: they paint the whole UI and first paint needs
          // them. If Amiri is ever updated, bump its filename (see
          // public/_headers) so devices refetch it.
          globIgnores: ['**/fonts/amiri-*.woff2'],
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
      // F-20 (cleanliness audit 2026-11-26): es2015 → es2020. esbuild lowers
      // async/await to generator+helper code for anything below es2017, so
      // the old target paid a transformation tax on EVERY async function in
      // the app (and this app is async end to end: listeners, auth, submit
      // handlers). The audience is a 2026 PWA on Android Chrome / iOS
      // Safari (the CSS already requires dvh units and safe-area env()),
      // and firebase v12 itself ships ES2017 — nothing in the dependency
      // chain supports ES2015-era browsers anyway, so the downleveling
      // bought zero compatibility and cost bytes in every chunk.
      target: 'es2020',
      cssTarget: 'chrome60',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      // F-20: 2000 → 600. The old limit sat above every real chunk, so a
      // bundle regression (a fat dependency sneaking into the boot graph,
      // a module losing its tree-shaking) surfaced nowhere. The largest
      // legitimate chunk (firebase-firestore, ~400 KB) stays under 600;
      // anything past that is now a loud warning in CI logs instead of
      // silent rot.
      chunkSizeWarningLimit: 600,
      // Performance: don't inject CSS as a render-blocking <link> in <head>.
      // Instead, load it via a non-blocking pattern. The critical CSS
      // (background colors, dark mode) is already inlined in <style> in
      // index.html, so the first paint doesn't need the full 237KB stylesheet.
      cssCodeSplit: false,
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
              // F-20: re2js (~157 KB — firestore's internal regex engine,
              // pulled in by @firebase/firestore) used to fall through to
              // a generic catch-all chunk, i.e. its own always-fetched boot
              // file nobody could name. It is firestore's private
              // dependency and ships whenever firestore does — group it
              // with its only consumer so the boot graph stays honest.
              if (id.includes('re2js')) return 'firebase-firestore';
              if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) return 'firebase-firestore';
              if (id.includes('firebase/app') || id.includes('@firebase/app') || id.includes('@firebase/util') || id.includes('firebase/app-check')) return 'firebase-core';
              if (id.includes('firebase')) return 'firebase-other';
              if (id.includes('react') || id.includes('lucide-react')) return 'vendor';
              // F-20: the old `return 'deps'` catch-all is gone. It forced
              // EVERY transitive node_module into one static chunk that the
              // entry imports — meaning a future async-only library would
              // silently become a boot-graph cost (re2js was exactly that,
              // hiding there at 157 KB). Framework groupings above are the
              // only intentional ones; anything else falls to Rollup's
              // default splitting, which puts boot-only modules in the
              // entry chain and lazy-only modules in their async chunks
              // automatically.
              return undefined;
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
