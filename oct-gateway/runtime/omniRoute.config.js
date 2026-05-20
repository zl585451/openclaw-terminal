'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

let _configCache = null;

/**
 * 结构校验与规范化过滤器，确保绝对不污染路由链
 * @param {object} raw - 原始反序列化的配置数据
 * @returns {object} 校验并清洗后的安全配置结构
 */
function normalizeAndValidate(raw) {
  const result = {
    routes: {},
    credentials: {}
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }

  // 1. 校验并过滤 routes
  if (raw.routes && typeof raw.routes === 'object' && !Array.isArray(raw.routes)) {
    for (const [capability, capObj] of Object.entries(raw.routes)) {
      if (capObj && typeof capObj === 'object' && !Array.isArray(capObj)) {
        if (Array.isArray(capObj.candidates)) {
          const validCandidates = [];
          for (const cand of capObj.candidates) {
            if (cand && typeof cand === 'object' && !Array.isArray(cand)) {
              const provider = cand.provider;
              const model = cand.model;
              if (typeof provider === 'string' && provider.trim() &&
                  typeof model === 'string' && model.trim()) {
                validCandidates.push({
                  provider: provider.trim(),
                  model: model.trim()
                });
              }
            }
          }
          // 仅保留有效候选列表非空的路由，若为空，则由 getRouteCandidates 判定其回落默认
          if (validCandidates.length > 0) {
            result.routes[capability] = {
              candidates: validCandidates
            };
          }
        }
      }
    }
  }

  // 2. 校验并过滤 credentials
  if (raw.credentials && typeof raw.credentials === 'object' && !Array.isArray(raw.credentials)) {
    for (const [providerId, credObj] of Object.entries(raw.credentials)) {
      if (credObj && typeof credObj === 'object' && !Array.isArray(credObj)) {
        const apiKey = credObj.apiKey;
        const baseUrl = credObj.baseUrl;

        const validCred = {};
        if (typeof apiKey === 'string') {
          validCred.apiKey = apiKey.trim();
        } else {
          validCred.apiKey = '';
        }

        if (typeof baseUrl === 'string') {
          validCred.baseUrl = baseUrl.trim();
        } else {
          validCred.baseUrl = '';
        }

        result.credentials[providerId] = validCred;
      }
    }
  }

  return result;
}

/**
 * 获取 omniRoute.config.json 的物理路径
 * 优先级：
 * 1. 环境变量 OMNIROUTE_CONFIG_FILE
 * 2. 同主配置 config.json 所在目录
 * 3. 备用用户主目录 .openclaw 目录
 */
function getConfigPath() {
  if (process.env.OMNIROUTE_CONFIG_FILE) {
    return process.env.OMNIROUTE_CONFIG_FILE;
  }
  const baseDir = config._configPath ? path.dirname(config._configPath) : path.join(os.homedir(), '.openclaw');
  return path.join(baseDir, 'omniRoute.config.json');
}

/**
 * 加载配置对象并进行校验与缓存，任何错误均不抛出影响主流程
 */
function loadConfig() {
  if (_configCache) {
    return _configCache;
  }

  const p = getConfigPath();
  if (fs.existsSync(p)) {
    try {
      const data = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(data);
      _configCache = normalizeAndValidate(parsed);
      return _configCache;
    } catch (err) {
      console.warn(`[OmniRoute Config] Failed to parse omniRoute.config.json at ${p}:`, err.message);
    }
  }

  // 默认初始空结构
  _configCache = {
    routes: {},
    credentials: {}
  };
  return _configCache;
}

/**
 * 持久化安全规范化后写入配置
 */
function saveConfig(cfg) {
  const validated = normalizeAndValidate(cfg);
  const p = getConfigPath();
  const dir = path.dirname(p);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(validated, null, 2), 'utf-8');
    _configCache = validated;
    return true;
  } catch (err) {
    console.error(`[OmniRoute Config] Failed to save config to ${p}:`, err.message);
    return false;
  }
}

/**
 * 获取特定能力的定制候选物理通道列表
 */
function getRouteCandidates(capability) {
  const cfg = loadConfig();
  if (cfg.routes && cfg.routes[capability] && Array.isArray(cfg.routes[capability].candidates)) {
    return cfg.routes[capability].candidates;
  }
  return null;
}

/**
 * 获取特定提供商的凭证配置
 */
function getCredential(providerId) {
  const cfg = loadConfig();
  if (cfg.credentials && cfg.credentials[providerId]) {
    return cfg.credentials[providerId];
  }
  return null;
}

/**
 * 更新能力的候选物理通道列表并保存
 */
function updateRouteCandidates(capability, candidates) {
  if (typeof capability !== 'string' || !capability.trim()) return false;
  if (!Array.isArray(candidates)) return false;

  const cfg = loadConfig();
  if (!cfg.routes) cfg.routes = {};
  cfg.routes[capability] = {
    candidates: candidates
  };
  return saveConfig(cfg);
}

/**
 * 更新提供商凭证并保存
 */
function updateCredential(providerId, { apiKey, baseUrl } = {}) {
  if (typeof providerId !== 'string' || !providerId.trim()) return false;

  const cfg = loadConfig();
  if (!cfg.credentials) cfg.credentials = {};
  cfg.credentials[providerId] = {
    apiKey: typeof apiKey === 'string' ? apiKey : '',
    baseUrl: typeof baseUrl === 'string' ? baseUrl : ''
  };
  return saveConfig(cfg);
}

/**
 * 清除内存缓存强制重新加载
 */
function clearCache() {
  _configCache = null;
}

module.exports = {
  normalizeAndValidate,
  getConfigPath,
  loadConfig,
  saveConfig,
  getRouteCandidates,
  getCredential,
  updateRouteCandidates,
  updateCredential,
  clearCache,
};