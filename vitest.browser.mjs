import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({
  test: {
    include: ['test/unit/hardening/htmlSanitizer.spec.js'],
    browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
  },
});
