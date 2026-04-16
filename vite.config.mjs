import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import pkg from './package.json' with { type: 'json' };
import devApiPlugin from './dev-server/index.js';

// Fail the prod build if the bake-at-build-time env vars are missing. Matches
// the pattern used by Vercel build env: these must be set before `vite build`.
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('build');
if (isProd && !process.env.SKIP_ENV_CHECK) {
  const required = ['GOOGLE_CLIENT_ID', 'GITHUB_CLIENT_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    // Do not hard-fail on empty OAuth IDs — they're legitimately absent for a
    // public fork that hasn't registered OAuth apps yet. Warn so it's visible
    // in Vercel build logs but don't block.
    // eslint-disable-next-line no-console
    console.warn(`[vite] WARNING: missing build-time env vars: ${missing.join(', ')}. OAuth flows for these providers will be disabled in the bundle.`);
  }
}

export default defineConfig({
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.vue', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      vue: 'vue/dist/vue.runtime.esm.js',
    },
  },
  define: {
    VERSION: JSON.stringify(pkg.version),
    NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'production'),
    GOOGLE_CLIENT_ID: JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
    GITHUB_CLIENT_ID: JSON.stringify(process.env.GITHUB_CLIENT_ID || ''),
  },
  plugins: [
    devApiPlugin(),
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
    process.env.ANALYZE && visualizer({
      filename: 'dist/bundle-analysis.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  server: {
    port: 8080,
    host: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  publicDir: 'static',
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('mermaid')) return 'mermaid';
          if (id.includes('abcjs')) return 'abcjs';
          if (id.includes('katex')) return 'katex';
          if (id.includes('turndown')) return 'turndown';
          if (id.includes('handlebars')) return 'handlebars';
          if (id.includes('prismjs')) return 'prismjs';
          if (id.includes('markdown-it')) return 'markdown-it';
          if (id.includes('dompurify')) return 'dompurify';
          if (id.includes('/vue/') || id.includes('/vuex/')) return 'vue';
          return undefined;
        },
      },
    },
  },
});
