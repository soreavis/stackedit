import { defineConfig } from 'vitest/config';
import vue2 from '@vitejs/plugin-vue2';
import path from 'path';

export default defineConfig({
  plugins: [vue2()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      vue: 'vue/dist/vue.runtime.esm.js',
      'markdown-it-imsize': path.resolve(__dirname, 'src/shims/markdown-it-imsize.js'),
    },
  },
  define: {
    VERSION: JSON.stringify('0.0.0-test'),
    NODE_ENV: JSON.stringify('test'),
    GOOGLE_CLIENT_ID: JSON.stringify(''),
    GITHUB_CLIENT_ID: JSON.stringify(''),
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableComputedStyleRendering: true,
          disableErrorCapturing: true,
        },
      },
    },
    dangerouslyIgnoreUnhandledErrors: true,
    globals: true,
    include: ['test/unit/**/*.spec.js'],
    setupFiles: ['test/unit/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/libs/**/*.js', 'api/**/*.js', 'dev-server/**/*.js', 'src/services/networkSvc.js'],
      reporter: ['text', 'html'],
    },
  },
});
