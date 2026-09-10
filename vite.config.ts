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
