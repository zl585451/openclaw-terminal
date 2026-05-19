/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type JsonRecord = Record<string, unknown>;

const corpusPath = resolve(process.cwd(), 'docs/test-results/render-v3-real-model/corpus.json');
const corpusText = readFileSync(corpusPath, 'utf8');
const parsedCorpus: unknown = JSON.parse(corpusText);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(record: JsonRecord, names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function getArrayField(record: JsonRecord, names: string[]): unknown[] | undefined {
  for (const name of names) {
    const value = record[name];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function collectCaseIds(value: unknown): Set<string> {
  const caseIds = new Set<string>();

  if (!isRecord(value)) {
    return caseIds;
  }

  const cases = getArrayField(value, ['cases']);
  if (!cases) {
    return caseIds;
  }

  for (const item of cases) {
    if (!isRecord(item)) {
      continue;
    }

    const caseId = getStringField(item, ['id', 'caseId']);
    if (caseId) {
      caseIds.add(caseId);
    }
  }

  return caseIds;
}

function collectRuns(value: unknown): JsonRecord[] {
  if (!isRecord(value)) {
    return [];
  }

  return (getArrayField(value, ['runs']) ?? []).filter(isRecord);
}

function expectValidBlockArray(value: unknown, fieldName: string) {
  expect(Array.isArray(value), `${fieldName} must be an array`).toBe(true);

  for (const item of value as unknown[]) {
    expect(typeof item, `${fieldName} entries must be block type strings`).toBe('string');
    expect((item as string).length, `${fieldName} entries must not be empty`).toBeGreaterThan(0);
  }
}

const caseIds = collectCaseIds(parsedCorpus);
const runs = collectRuns(parsedCorpus);

describe('Render Protocol v3 real-model raw output corpus', () => {
  it('corpus.json is valid JSON', () => {
    expect(parsedCorpus).toBeDefined();
    expect(isRecord(parsedCorpus), 'corpus root must be a JSON object').toBe(true);
  });

  it('each run matches a caseId from the corpus', () => {
    expect(caseIds.size, 'caseId set must not be empty').toBeGreaterThan(0);
    expect(runs.length, 'run list must not be empty').toBeGreaterThan(0);

    for (const run of runs) {
      const caseId = getStringField(run, ['caseId']);

      expect(caseId, `run must declare caseId: ${JSON.stringify(run)}`).toBeTypeOf('string');
      expect(caseIds.has(caseId as string), `run caseId must match a corpus case: ${caseId}`).toBe(true);
    }
  });

  describe('block audit fields', () => {
    for (const [index, run] of runs.entries()) {
      const runId = getStringField(run, ['id']) ?? `run-${index}`;

      it(`${runId}: expected/missing/unexpected block fields are structurally valid`, () => {
        const caseId = getStringField(run, ['caseId']);
        const relatedCase = isRecord(parsedCorpus)
          ? getArrayField(parsedCorpus, ['cases'])?.find(
              (item): item is JsonRecord => isRecord(item) && getStringField(item, ['id', 'caseId']) === caseId,
            )
          : undefined;

        expect(relatedCase, `${runId} must reference a known case`).toBeDefined();
        expectValidBlockArray(relatedCase?.expectedBlocks, 'expectedBlocks');
        expectValidBlockArray(run.missingBlocks, 'missingBlocks');
        expectValidBlockArray(run.unexpectedBlocks, 'unexpectedBlocks');
      });

      it(`${runId}: rawOutputPath points to an existing placeholder file`, () => {
        const rawOutputPath = getStringField(run, ['rawOutputPath']);

        expect(rawOutputPath, `${runId} must declare rawOutputPath`).toBeTypeOf('string');
        expect(existsSync(resolve(process.cwd(), rawOutputPath as string)), `${runId} rawOutputPath must exist`).toBe(
          true,
        );
      });
    }
  });

  describe('raw output dependent checks', () => {
    for (const [index, run] of runs.entries()) {
      const runId = getStringField(run, ['id']) ?? `run-${index}`;
      const rawOutputStatus = getStringField(run, ['rawOutputStatus']);

      if (rawOutputStatus === 'missing') {
        it.skip(`${runId}: raw output is missing, corpus assertion is pending`, () => {});
        continue;
      }

      it(`${runId}: raw output is available for future corpus assertions`, () => {
        const rawOutputPath = getStringField(run, ['rawOutputPath']);
        const rawOutput = rawOutputPath
          ? readFileSync(resolve(process.cwd(), rawOutputPath), 'utf8')
          : getStringField(run, ['rawOutput', 'rawOutputText', 'output']);

        expect(rawOutput, `${runId} must include raw output content when rawOutputStatus is not missing`).toBeTypeOf(
          'string',
        );
        expect(rawOutput.length, `${runId} raw output content must not be empty`).toBeGreaterThan(0);
      });
    }
  });
});
