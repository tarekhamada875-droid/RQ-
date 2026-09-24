import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server-v2/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000
  }
});
