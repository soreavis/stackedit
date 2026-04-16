import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.vue', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      vue: 'vue/dist/vue.esm.js',
    },
  },
  define: {
    VERSION: JSON.stringify(pkg.version),
    NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'production'),
    GOOGLE_CLIENT_ID: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
    GITHUB_CLIENT_ID: JSON.stringify(process.env.GITHUB_CLIENT_ID || ''),
  },
  plugins: [
    vue2(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'StackEdit',
        short_name: 'StackEdit',
        description: 'Full-featured, open-source Markdown editor',
        display: 'standalone',
        orientation: 'any',
        start_url: '/app',
        background_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/app',
        navigateFallbackDenylist: [/^\/api/, /^\/oauth2/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 8080,
    host: true,
  },
  publicDir: 'static',
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
  optimizeDeps: {
    exclude: ['indexeddbshim'],
  },
});
