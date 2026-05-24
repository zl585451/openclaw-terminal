import { describe, expect, it } from 'vitest';
import {
  applyApiKeyUpdates,
  buildApiKeysData,
  didApiConfigChange,
  didConnectionConfigChange,
  parseEnvContent,
  parseBooleanConfigValue,
} from './apiKeys';

const defaults = {
  OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
  TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
};

describe('electron api key config helpers', () => {
  it('normalizes booleans without leaking UI types into config file', () => {
    expect(parseBooleanConfigValue(true)).toBe(true);
    expect(parseBooleanConfigValue('yes')).toBe(true);
    expect(parseBooleanConfigValue('off')).toBe(false);
    expect(parseBooleanConfigValue(undefined)).toBe(false);
  });

  it('applies save-api-keys payload while preserving unrelated existing config', () => {
    const { cfg, previousCfg } = applyApiKeyUpdates({
      KEEP_ME: 'unchanged',
      OPENCLAW_WS_URL: 'ws://old-host:18789',
      OMNIROUTE_CHAT_MODEL: 'legacy-chat',
    }, {
      OCT_PROVIDER: 'custom',
      OCT_MODEL: 'combo/free',
      IMAGE_PROVIDER: 'google',
      IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: true,
      OMNIROUTE_MODEL: 'omni/chat',
      OCT_USE_EXTERNAL_OMNIROUTE: 'on',
      BRAVE_SEARCH_API_KEY: 'brave-key',
    }, defaults);

    expect(previousCfg.OMNIROUTE_CHAT_MODEL).toBe('legacy-chat');
    expect(cfg.KEEP_ME).toBe('unchanged');
    expect(cfg.OCT_PROVIDER).toBe('custom');
    expect(cfg.OCT_MODEL).toBe('combo/free');
    expect(cfg.IMAGE_PROVIDER).toBe('google');
    expect(cfg.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY).toBe('true');
    expect(cfg.OMNIROUTE_MODEL).toBe('omni/chat');
    expect(cfg.OMNIROUTE_CHAT_MODEL).toBe('');
    expect(cfg.OMNIROUTE_PLAN_MODEL).toBe('');
    expect(cfg.OMNIROUTE_TOOL_MODEL).toBe('');
    expect(cfg.OCT_USE_EXTERNAL_OMNIROUTE).toBe('true');
    expect(cfg.BRAVE_SEARCH_API_KEY).toBe('brave-key');
  });

  it('fills minimum connection defaults for new config files', () => {
    const { cfg } = applyApiKeyUpdates({}, {}, defaults);
    expect(cfg.OPENCLAW_WS_URL).toBe(defaults.OPENCLAW_WS_URL);
    expect(cfg.OPENCLAW_TOKEN).toBe('');
  });

  it('detects gateway restart and reconnect boundaries', () => {
    const previousCfg = {
      OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
      OCT_MODEL: 'old-model',
    };
    const modelChanged = {
      OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
      OCT_MODEL: 'new-model',
    };
    const connectionOnlyChanged = {
      OPENCLAW_WS_URL: 'ws://127.0.0.1:18790',
      OCT_MODEL: 'old-model',
    };

    expect(didApiConfigChange(previousCfg, modelChanged)).toBe(true);
    expect(didConnectionConfigChange(previousCfg, modelChanged)).toBe(true);
    expect(didApiConfigChange(previousCfg, connectionOnlyChanged)).toBe(false);
    expect(didConnectionConfigChange(previousCfg, connectionOnlyChanged)).toBe(true);
  });

  it('parses env content and lets config values override env fallback', () => {
    const envObj = parseEnvContent(`
      # comment
      DASHSCOPE_API_KEY=env-dashscope
      GOOGLE_AI_BASE_URL=https://env-google
    `);
    const data = buildApiKeysData({
      DASHSCOPE_API_KEY: 'cfg-dashscope',
      IMAGE_PROVIDER: 'google',
      IMAGE_GOOGLE_API_KEY: 'cfg-image-google',
      IMAGE_GOOGLE_MODEL: 'gemini-image',
      OCT_USE_EXTERNAL_OMNIROUTE: 'yes',
    }, envObj, defaults);

    expect(data.DASHSCOPE_API_KEY).toBe('cfg-dashscope');
    expect(data.GOOGLE_AI_BASE_URL).toBe('https://env-google');
    expect(data.IMAGE_PROVIDER).toBe('google');
    expect(data.IMAGE_API_KEY).toBe('cfg-image-google');
    expect(data.IMAGE_MODEL).toBe('gemini-image');
    expect(data.OCT_USE_EXTERNAL_OMNIROUTE).toBe(true);
  });

  it('falls back from legacy OmniRoute chat model when unified model is absent', () => {
    const data = buildApiKeysData({
      OMNIROUTE_CHAT_MODEL: 'legacy-chat',
    }, {}, defaults);

    expect(data.OMNIROUTE_MODEL).toBe('legacy-chat');
  });
});
