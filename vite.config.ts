/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const EXERCISE_VIEWER_MODULE =
  /[\\/]node_modules[\\/](three|three-stdlib|@react-three)[\\/]|[\\/]features[\\/]exercise-viewer[\\/]ExerciseViewer\.tsx$/;

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Port 3000 matches Supabase's default Site URL, so auth redirects work locally.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // The 3D viewer (three.js + R3F/Drei) is only reachable through a dynamic import, so
        // automatic code splitting already keeps it out of the initial bundle. Name every chunk
        // holding it `exercise-viewer-*` so the PWA globIgnores below skip precaching it.
        // (A codeSplitting group was tried: without recursive deps it created a chunk import
        // cycle, and with them it dragged React/Mantine into the group and onto the main path.)
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => EXERCISE_VIEWER_MODULE.test(id))
            ? 'assets/exercise-viewer-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Custom service worker: needed for Web Push handlers (Phase 5).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Never auto-reload: an update must not interrupt an active workout.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'FitTrack',
        short_name: 'FitTrack',
        description: 'Private workouts, meal reminders, water and progress tracking.',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The lazy 3D viewer chunk is fetched on demand, not precached.
        globIgnores: ['**/exercise-viewer-*.js', '**/models/**', '**/*.glb'],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test/setup.ts'],
          css: false,
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_000000',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
