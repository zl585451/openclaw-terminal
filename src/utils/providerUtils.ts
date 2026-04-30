export function inferProviderFromBaseUrl(baseUrl: string): string {
  const u = (baseUrl || '').toLowerCase();
  if (u.includes('coding.dashscope')) return 'bailian-coding';
  if (u.includes('dashscope')) return 'bailian';
  if (u.includes('deepseek')) return 'deepseek';
  if (u.includes('minimaxi')) return 'minimax';
  if (u.includes('siliconflow')) return 'siliconflow';
  if (u.includes('moonshot')) return 'moonshot';
  if (u.includes('newapi') || u.includes('localhost:3000') || u.includes('127.0.0.1:3000')) return 'newapi';
  if (u.includes('groq')) return 'groq';
  if (u.includes('api.openai.com')) return 'openai';
  if (u.includes('localhost:11434')) return 'ollama';
  if (u.includes('generativelanguage.googleapis.com')) return 'google';
  return 'bailian-coding';
}

export type ProviderDetectionConfidence = 'high' | 'medium' | 'low';

export function detectProviderFromKey(raw: string): {
  providerId: string | null;
  confidence: ProviderDetectionConfidence;
  reason: string;
} {
  const k = String(raw || '').trim();
  if (!k) return { providerId: null, confidence: 'low', reason: '空 Key' };

  if (k.startsWith('sk-sp-')) {
    return { providerId: 'bailian-coding', confidence: 'high', reason: '阿里云百炼 Coding Plan 专属前缀' };
  }
  if (k.startsWith('sk-cp-')) {
    return { providerId: 'minimax', confidence: 'high', reason: 'MiniMax Token Plan 前缀' };
  }
  if (k.startsWith('gsk_')) {
    return { providerId: 'groq', confidence: 'high', reason: 'Groq 前缀' };
  }
  if (k.startsWith('AQ.')) {
    return { providerId: 'google', confidence: 'high', reason: 'Google Vertex AI API Key 前缀' };
  }
  if (/^AIza[0-9A-Za-z_-]{10,}$/.test(k)) {
    return { providerId: 'google', confidence: 'high', reason: 'Google Generative Language API Key' };
  }

  if (k.startsWith('sk-or-')) {
    return { providerId: 'custom', confidence: 'medium', reason: '疑似 OpenRouter，用自定义接入' };
  }
  if (k.startsWith('sk-ant-')) {
    return { providerId: 'custom', confidence: 'medium', reason: '疑似 Anthropic，用自定义或代理接入' };
  }

  if (/^sk-[A-Za-z0-9]{20,}$/.test(k)) {
    return {
      providerId: null,
      confidence: 'low',
      reason: '通用 sk- 前缀，可能是 DeepSeek / 硅基 / 百炼 / OpenAI 等，需要用户手动选择',
    };
  }

  return { providerId: null, confidence: 'low', reason: '未识别前缀' };
}

