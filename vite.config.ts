/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Deployed as a GitHub Pages project site at /Project-Ascent/. Hash routing
// keeps deep links working without a 404 fallback.
export default defineConfig({
  base: '/Project-Ascent/',
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
        navigateFallback: '/Project-Ascent/index.html',
      },
      manifest: {
        id: '/Project-Ascent/',
        name: 'Project Ascent',
        short_name: 'Ascent',
        description:
          'Climbing training programs, session logging, progress tracking, and a climber that grows with your real climbing.',
        start_url: '/Project-Ascent/',
        scope: '/Project-Ascent/',
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
            url: '/Project-Ascent/#/today',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Gym mode',
            short_name: 'Gym mode',
            url: '/Project-Ascent/#/gym',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'The Ascent',
            short_name: 'The Ascent',
            url: '/Project-Ascent/#/ascent',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // A backup or a shared program, opened from a file manager. Both of
        // the app's own files are `.json`, so which screen it lands on is
        // decided by reading it — see `engine/openWith.ts`.
        file_handlers: [
          {
            action: '/Project-Ascent/',
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
