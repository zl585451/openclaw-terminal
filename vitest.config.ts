/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/**/*.test.ts',
      'electron/**/*.test.ts',
      'oct-gateway/test/cotSanitize.test.js',
      'oct-gateway/test/pseudoToolAnalysis.test.js',
      'oct-gateway/test/basicQCChecker.test.js',
      'oct-gateway/test/lineProtocolParser.test.js',
      'oct-gateway/test/classificationParser.test.js',
      'oct-gateway/test/classifiedMerger.test.js',
      'oct-gateway/test/quoteSpanExtractor.test.js',
      'oct-gateway/test/speakerCandidateExtractor.test.js',
      'oct-gateway/test/quoteAttributionParser.test.js',
      'oct-gateway/test/spanScriptComposer.test.js',
      'oct-gateway/test/innerVoiceSpanExtractor.test.js',
      'oct-gateway/test/textRewriterE2E.test.js',
      'oct-gateway/test/llmClient.test.js',
      'oct-gateway/test/chatEngine.test.js',
      'oct-gateway/test/finalAnswerGuard.test.js',
      'oct-gateway/test/orchestratorRouting.test.js',
      'oct-gateway/test/omniRoute.test.js',
      'oct-gateway/test/externalOmniRoute.test.js',
      'oct-gateway/test/toolAdapter.test.js',
      'oct-gateway/test/omniRoute.metrics.test.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
