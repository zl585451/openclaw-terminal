'use strict';

/**
 * OmniRoute 运行时观测、耗时、状态码与使用量记录模块 (Phase 8)
 *
 * 职责：
 * - 在内存中安全、脱敏、无任何 Prompt/响应泄露地记录能力请求详情
 * - 记录延迟 (Latency)、状态码 (Status Code)、错误类型、Token Usage
 * - 暴露本地状态读取接口，支持与 status 诊断 endpoint 融合输出
 * - 预留简单每分钟请求速率 (RPM) 限流自律检测接口
 */

let _metricsData = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  capabilities: {}, // capability -> { totalRequests, successRequests, totalLatencyMs, avgLatencyMs, errorCount, errorTypes: {} }
  providers: {},    // providerId -> { totalRequests, successRequests, totalLatencyMs, avgLatencyMs, errorCount, errorTypes: {}, promptTokens, completionTokens, totalTokens }
  models: {},       // model -> { totalRequests, successRequests, totalLatencyMs, avgLatencyMs, errorCount, promptTokens, completionTokens, totalTokens }
  recentRequests: [] // Rolling desensitized requests log (max 100)
};

const MAX_RECENT_REQUESTS = 100;

/**
 * 记录一次 AI 请求的观测数据 (无任何 Prompt / 内容泄露)
 * @param {object} param
 * @param {string} param.capability - 逻辑能力别名 (如 'oct-chat', 'oct-plan', 'oct-tool-safe')
 * @param {string} param.providerId - 实际选中的物理提供商
 * @param {string} param.model - 实际请求物理模型
 * @param {number} param.latencyMs - 请求耗时 (毫秒)
 * @param {number} param.status - 响应 HTTP 状态码 (200, 429, 503 等)
 * @param {string|null} param.errorType - 错误分类 (如 'LlmClientHttpError', 'LlmClientTimeoutError' 等)
 * @param {object|null} param.usage - token 消耗量 `{ prompt_tokens, completion_tokens, total_tokens }`
 */
function recordRequest({ capability, providerId, model, latencyMs, status, errorType, usage }) {
  _metricsData.totalRequests++;
  const isSuccess = !errorType && (status === 200 || !status);
  if (isSuccess) {
    _metricsData.successfulRequests++;
  } else {
    _metricsData.failedRequests++;
  }

  const capName = capability || 'unknown_capability';
  const provId = providerId || 'unknown_provider';
  const modelName = model || 'unknown_model';

  // 1. 累加能力维度观测
  if (!_metricsData.capabilities[capName]) {
    _metricsData.capabilities[capName] = {
      totalRequests: 0,
      successRequests: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      errorTypes: {}
    };
  }
  const capMetrics = _metricsData.capabilities[capName];
  capMetrics.totalRequests++;
  if (isSuccess) {
    capMetrics.successRequests++;
  } else {
    capMetrics.errorCount++;
    const errName = errorType || 'unknown_error';
    capMetrics.errorTypes[errName] = (capMetrics.errorTypes[errName] || 0) + 1;
  }
  capMetrics.totalLatencyMs += latencyMs || 0;
  capMetrics.avgLatencyMs = Math.round(capMetrics.totalLatencyMs / capMetrics.totalRequests);

  // 2. 累加提供商维度观测
  if (!_metricsData.providers[provId]) {
    _metricsData.providers[provId] = {
      totalRequests: 0,
      successRequests: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      errorTypes: {},
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
  }
  const provMetrics = _metricsData.providers[provId];
  provMetrics.totalRequests++;
  if (isSuccess) {
    provMetrics.successRequests++;
  } else {
    provMetrics.errorCount++;
    const errName = errorType || 'unknown_error';
    provMetrics.errorTypes[errName] = (provMetrics.errorTypes[errName] || 0) + 1;
  }
  provMetrics.totalLatencyMs += latencyMs || 0;
  provMetrics.avgLatencyMs = Math.round(provMetrics.totalLatencyMs / provMetrics.totalRequests);
  if (usage) {
    provMetrics.promptTokens += (usage.prompt_tokens || usage.input_tokens || 0);
    provMetrics.completionTokens += (usage.completion_tokens || usage.output_tokens || 0);
    provMetrics.totalTokens += (usage.total_tokens || 0);
  }

  // 3. 累加模型维度观测
  if (!_metricsData.models[modelName]) {
    _metricsData.models[modelName] = {
      totalRequests: 0,
      successRequests: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
  }
  const modelMetrics = _metricsData.models[modelName];
  modelMetrics.totalRequests++;
  if (isSuccess) {
    modelMetrics.successRequests++;
  } else {
    modelMetrics.errorCount++;
  }
  modelMetrics.totalLatencyMs += latencyMs || 0;
  modelMetrics.avgLatencyMs = Math.round(modelMetrics.totalLatencyMs / modelMetrics.totalRequests);
  if (usage) {
    modelMetrics.promptTokens += (usage.prompt_tokens || usage.input_tokens || 0);
    modelMetrics.completionTokens += (usage.completion_tokens || usage.output_tokens || 0);
    modelMetrics.totalTokens += (usage.total_tokens || 0);
  }

  // 4. 追加到滚动诊断列表
  const recentEntry = {
    timestamp: Date.now(),
    capability: capName,
    providerId: provId,
    model: modelName,
    latencyMs: latencyMs || 0,
    status: status || null,
    errorType: errorType || null,
    tokens: usage ? (usage.total_tokens || 0) : 0
  };
  _metricsData.recentRequests.push(recentEntry);
  if (_metricsData.recentRequests.length > MAX_RECENT_REQUESTS) {
    _metricsData.recentRequests.shift();
  }
}

/**
 * 获取全量观测聚合状态，保证无任何 Prompt 泄漏
 * @returns {object}
 */
function getMetrics() {
  return { ..._metricsData };
}

/**
 * 重置观测状态
 */
function resetMetrics() {
  _metricsData = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    capabilities: {},
    providers: {},
    models: {},
    recentRequests: []
  };
}

// ── 预留简单限流整形机制 ───────────────────────────────────────
const _rateLimitStore = {}; // providerId -> Array of timestamps

/**
 * 简单限流自律检测预留接口
 * @param {string} providerId - 实际物理提供商 id
 * @param {object} [opts] - `{ maxRpm: number }` 最大每分钟允许请求数，默认 60
 * @returns {boolean} 是否应被限流阻断
 */
function isRateLimited(providerId, opts = {}) {
  const maxRpm = opts.maxRpm || 60;
  const now = Date.now();
  if (!_rateLimitStore[providerId]) {
    _rateLimitStore[providerId] = [];
  }

  // 剔除超过 1 分钟的历史时间戳
  _rateLimitStore[providerId] = _rateLimitStore[providerId].filter(t => now - t < 60000);

  if (_rateLimitStore[providerId].length >= maxRpm) {
    return true; // 应予以阻断
  }

  _rateLimitStore[providerId].push(now);
  return false;
}

module.exports = {
  recordRequest,
  getMetrics,
  resetMetrics,
  isRateLimited,
};
