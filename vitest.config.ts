/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts',
      'oct-gateway/test/basicQCChecker.test.js',
      'oct-gateway/test/lineProtocolParser.test.js',
      'oct-gateway/test/textRewriterE2E.test.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
