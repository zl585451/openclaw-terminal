'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VALID_TYPES = new Set(['narration', 'dialogue', 'inner_monologue']);
const RUN_LIVE = /^(1|true|yes|on)$/i.test(String(process.env.RUN_LIVE_TEXT_REWRITER_E2E || ''));

function resolveDashScopeApiKey() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const candidates = [];
  const configFiles = [
    process.env.OCT_CONFIG_FILE,
    path.join(os.homedir(), 'AppData', 'Roaming', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), 'Library', 'Application Support', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), '.config', 'openclaw-terminal', 'config.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'OpenClaw Terminal', 'config.json'),
    path.join(repoRoot, 'oct-gateway', 'config.json'),
  ].filter(Boolean);

  for (const file of configFiles) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed?.DASHSCOPE_API_KEY) candidates.push(parsed.DASHSCOPE_API_KEY);
      const providers = parsed?.models?.providers || {};
      for (const providerName of ['bailian', 'dashscope', 'qwen']) {
        if (providers[providerName]?.apiKey) candidates.push(providers[providerName].apiKey);
      }
    } catch (_) {}
  }

  if (process.env.DASHSCOPE_API_KEY) candidates.push(process.env.DASHSCOPE_API_KEY);
  return candidates
    .map((item) => String(item || '').trim())
    .find((item) => item && !item.toLowerCase().startsWith('sk-sp-') && !item.toLowerCase().startsWith('sk-cp-'));
}

function loadTextRewriterAgentForDashScope() {
  const apiKey = resolveDashScopeApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY not found for live text rewriter E2E');
  }

  process.env.SCRIPT_ADAPTER_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  process.env.SCRIPT_ADAPTER_API_KEY = apiKey;
  process.env.SCRIPT_ADAPTER_MODEL = 'qwen-plus';

  const agentPath = require.resolve('../script_adapter/agents/textRewriterAgent');
  const configPath = require.resolve('../config');
  const llmClientPath = require.resolve('../services/llmClient');
  delete require.cache[agentPath];
  delete require.cache[llmClientPath];
  delete require.cache[configPath];
  return require(agentPath);
}

function expectContinuousSegmentIds(segments) {
  for (let index = 0; index < segments.length; index += 1) {
    expect(segments[index].segmentId).toBe(`seg-${String(index + 1).padStart(3, '0')}`);
  }
}

describe('textRewriterAgent live E2E', () => {
  const maybeIt = RUN_LIVE ? it : it.skip;

  maybeIt('rewrites one fixture through qwen-plus and returns AdaptedScriptPayload', async () => {
    const { runTextRewriterAgent } = loadTextRewriterAgentForDashScope();
    const fixturePath = 'E:\\windows-window\\内容做做平台MVP计划\\test-fixtures\\ch-test-02-dialogue-heavy.txt';
    const sourceText = fs.readFileSync(fixturePath, 'utf8');
    const startedAt = Date.now();

    const result = await runTextRewriterAgent({ sourceText });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(120000);
    expect(result.model).toBe('qwen-plus');
    expect(result.payload).toBeTruthy();
    expect(result.payload.chapterTitle).toBeTruthy();
    expect(result.payload.totalCharCount).toBeGreaterThan(0);
    expect(Array.isArray(result.payload.segments)).toBe(true);
    expect(result.payload.segments.length).toBeGreaterThan(0);
    expectContinuousSegmentIds(result.payload.segments);

    for (const segment of result.payload.segments) {
      expect(VALID_TYPES.has(segment.type)).toBe(true);
      expect(String(segment.text || '').trim().length).toBeGreaterThan(0);
      if (segment.type === 'dialogue' || segment.type === 'inner_monologue') {
        expect(String(segment.speaker || '').trim().length).toBeGreaterThan(0);
      }
    }
  }, 130000);
});
