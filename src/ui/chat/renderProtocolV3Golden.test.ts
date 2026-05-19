import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseOptionBox } from '../../utils/optionBoxParser';
import { renderBlocksToParsedContent } from './renderBlocksAdapter';
import type { RenderBlock } from './chatTypes';
import { renderProtocolV3GoldenCases } from './__fixtures__/renderProtocolV3GoldenFixtures';

const require = createRequire(import.meta.url);

const {
  normalizeRenderBlocks,
}: {
  normalizeRenderBlocks: (input: string) => {
    version: string;
    source: 'render_blocks' | 'legacy' | 'markdown';
    blocks: RenderBlock[];
    errors: string[];
  };
} = require('../../../oct-gateway/services/renderBlocksNormalizer');

type GoldenReport = {
  id: string;
  title: string;
  prompt: string;
  rawModelOutput: string;
  gatewayNormalizedOutput: {
    source: string;
    errors: string[];
  };
  renderBlocks: RenderBlock[];
  frontendParsedResult: {
    segmentTypes: string[];
    optionLabels: string[];
  };
  verdict: 'pass' | 'fail';
  failureLayer?: 'model_output' | 'gateway_normalizer' | 'frontend_renderer';
};

function buildGoldenReport(testCase: (typeof renderProtocolV3GoldenCases)[number]): GoldenReport {
  const normalized = normalizeRenderBlocks(testCase.rawModelOutput);
  const parsed = renderBlocksToParsedContent(normalized.blocks);
  const segmentTypes = parsed.segments?.map((segment) => segment.type) || [];
  const optionLabels = (parsed.segments || []).flatMap((segment) => segment.options.map((option) => option.label));

  let failureLayer: GoldenReport['failureLayer'];
  if (!testCase.rawModelOutput.includes('```render_blocks')) {
    failureLayer = 'model_output';
  } else if (normalized.errors.length > 0 || !sameList(normalized.blocks.map((block) => block.type), testCase.expectedBlockTypes)) {
    failureLayer = 'gateway_normalizer';
  } else if (!sameList(segmentTypes, testCase.expectedSegmentTypes)) {
    failureLayer = 'frontend_renderer';
  }

  return {
    id: testCase.id,
    title: testCase.title,
    prompt: testCase.prompt,
    rawModelOutput: testCase.rawModelOutput,
    gatewayNormalizedOutput: {
      source: normalized.source,
      errors: normalized.errors,
    },
    renderBlocks: normalized.blocks,
    frontendParsedResult: {
      segmentTypes,
      optionLabels,
    },
    verdict: failureLayer ? 'fail' : 'pass',
    ...(failureLayer ? { failureLayer } : {}),
  };
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

describe('Render Protocol v3 golden stability cases', () => {
  for (const testCase of renderProtocolV3GoldenCases) {
    it(`${testCase.id}: ${testCase.title}`, () => {
      const report = buildGoldenReport(testCase);
      const reportJson = JSON.stringify(report, null, 2);

      expect(report.gatewayNormalizedOutput.errors, reportJson).toEqual([]);
      expect(report.renderBlocks.map((block) => block.type), reportJson).toEqual(testCase.expectedBlockTypes);
      expect(report.frontendParsedResult.segmentTypes, reportJson).toEqual(testCase.expectedSegmentTypes);
      expect(report.verdict, reportJson).toBe('pass');
    });
  }

  it('keeps symbol-defense markdown from falling back into legacy pills detection', () => {
    const testCase = renderProtocolV3GoldenCases.find((item) => item.id === 'symbol-defense');
    expect(testCase).toBeDefined();
    const normalized = normalizeRenderBlocks(testCase!.rawModelOutput);
    const markdown = normalized.blocks
      .filter((block): block is Extract<RenderBlock, { type: 'markdown' }> => block.type === 'markdown')
      .map((block) => block.content)
      .join('\n\n');

    const legacyParsed = parseOptionBox(markdown);

    expect(legacyParsed.segments?.some((segment) => segment.type === 'pills')).not.toBe(true);
    expect(legacyParsed.options).toEqual([]);
  });

  it('keeps clarify_card as a validated spec without leaking raw JSON into chat text', () => {
    const testCase = renderProtocolV3GoldenCases.find((item) => item.id === 'clarify-card');
    expect(testCase).toBeDefined();
    const normalized = normalizeRenderBlocks(testCase!.rawModelOutput);
    const clarify = normalized.blocks.find((block): block is Extract<RenderBlock, { type: 'clarify_card' }> => {
      return block.type === 'clarify_card';
    });
    const parsed = renderBlocksToParsedContent(normalized.blocks);

    expect(clarify).toBeDefined();
    expect(clarify!.fields).toHaveLength(4);
    expect(clarify!.fields.every((field) => {
      return typeof field === 'object'
        && field !== null
        && 'label' in field
        && typeof field.label === 'string'
        && field.label.endsWith('？');
    })).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain('"fields"');
  });
});
