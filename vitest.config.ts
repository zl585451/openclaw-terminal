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
      'oct-gateway/test/classificationParser.test.js',
      'oct-gateway/test/classifiedMerger.test.js',
      'oct-gateway/test/quoteSpanExtractor.test.js',
      'oct-gateway/test/speakerCandidateExtractor.test.js',
      'oct-gateway/test/quoteAttributionParser.test.js',
      'oct-gateway/test/spanScriptComposer.test.js',
      'oct-gateway/test/textRewriterE2E.test.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
