/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Where the app is served from (PLAN.md M12).
 *
 * One constant, because it appears in eight places that must agree: the
 * asset base, the service worker's navigation fallback, and five manifest
 * fields. A disagreement between any two of them is a 404 on a cold load
 * or a shortcut that silently opens the home screen — neither of which
 * shows up in a dev server, which serves from `/` whatever this says.
 *
 * `/` because a GitHub Pages **custom domain** serves the site at the
 * domain root, not at `/<repo>/` the way a bare `*.github.io` project
 * site does. The `public/CNAME` file is what makes that true; the two are
 * a pair and moving one without the other breaks every asset URL.
 *
 * Hash routing keeps deep links working without a 404 fallback.
 */
const BASE = '/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Prompt, not autoUpdate. `autoUpdate` hands over to the new version
      // and reloads the moment one is precached — which, mid-session, restarts
      // a running hangboard protocol from set one and empties a half-typed
      // climb row. The app asks instead, and never asks during a session.
      // See PLAN.md M19 and `engine/offline.ts`.
      registerType: 'prompt',
      // Fully-offline app: precache the entire shell. (The old app's
      // "no precache" rule was an AI Studio constraint — see PLAN.md §2.)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: `${BASE}index.html`,
      },
      manifest: {
        id: BASE,
        name: 'Project Ascent',
        short_name: 'Ascent',
        description:
          'Climbing training programs, session logging, progress tracking, and a climber that grows with your real climbing.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        categories: ['fitness', 'health', 'sports'],
        theme_color: '#f6f8fa',
        background_color: '#f6f8fa',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the icon (PLAN.md M111). Three, not the four proposed:
        // there is no timer route to point a fourth at — the timer is a
        // sheet inside a session, and it needs a subject to time.
        shortcuts: [
          {
            name: "Log today's session",
            short_name: 'Log today',
            url: `${BASE}#/today`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Gym mode',
            short_name: 'Gym mode',
            url: `${BASE}#/gym`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'The Ascent',
            short_name: 'The Ascent',
            url: `${BASE}#/ascent`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // A backup or a shared program, opened from a file manager. Both of
        // the app's own files are `.json`, so which screen it lands on is
        // decided by reading it — see `engine/openWith.ts`.
        file_handlers: [
          {
            action: BASE,
            accept: {
              'application/json': ['.json'],
              'application/zip': ['.zip'],
            },
          },
        ],
        // One instance. Opening a file while the app is already running
        // brings that window forward rather than starting a second copy
        // over the same database.
        launch_handler: { client_mode: 'focus-existing' },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
