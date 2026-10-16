import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/**/*.test.{ts,tsx}', 'vitest.setup.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**'],
  },
});
