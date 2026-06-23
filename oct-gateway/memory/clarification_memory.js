/**
 * clarification_memory.js — 追问偏好学习闭环
 *
 * 功能：
 * 1. 检测用户是否在回答追问（通过 pill 选项点击）
 * 2. 提炼偏好并写入 Memory v2
 * 3. 启动时加载偏好，注入 system prompt
 *
 * 位置：oct-gateway/clarification_memory.js
 * 依赖：memory.js, ai.js (streamChat)
 *
 * 接入点：在 index.js 的 onDone 回调中，与 extractAndSaveMemory 并行调用
 */

const memory = require('./memory');
const memoryGovernor = require('./memory_governor');
const { createLogger } = require('../logger');
const log = createLogger('clarification');

// ── 追问检测 ────────────────────────────────────────────────

/**
 * 判断本轮对话是否是"追问→选择"模式。
 *
 * 检测逻辑：
 * - AMY 上一条回复包含 [pills] 或 [question] 标签
 * - 用户本条消息内容较短（<50 字）且与某个选项文本匹配
 *
 * @param {string} prevAssistantReply - AMY 上一条回复
 * @param {string} userMsg - 用户当前消息
 * @returns {{ isClarificationChoice: boolean, topic: string|null, choice: string|null }}
 */
function detectClarificationChoice(prevAssistantReply, userMsg) {
  if (!prevAssistantReply || !userMsg) {
    return { isClarificationChoice: false, topic: null, choice: null };
  }

  const msg = userMsg.trim();

  // 用户消息太长，不太可能是点击 pill 产生的
  if (msg.length > 60) {
    return { isClarificationChoice: false, topic: null, choice: null };
  }

  // 检测 AMY 上条回复是否包含 [pills] 或 [question] 标签
  const hasPills = /\[pills\][\s\S]*?\[\/pills\]/i.test(prevAssistantReply);
  const hasQuestion = /\[question\][\s\S]*?\[\/question\]/i.test(prevAssistantReply);

  if (!hasPills && !hasQuestion) {
    return { isClarificationChoice: false, topic: null, choice: null };
  }

  // 提取 pills 中的选项
  if (hasPills) {
    const pillMatch = prevAssistantReply.match(/\[pills\]([\s\S]*?)\[\/pills\]/i);
    if (pillMatch) {
      const options = pillMatch[1]
        .split('\n')
        .map(line => line.replace(/^[\s]*[■●◆○◉▪▸•·]\s*/, '').trim())
        .filter(Boolean);

      // 检查用户消息是否匹配某个选项（完全匹配或包含）
      const matched = options.find(opt =>
        msg === opt || msg.includes(opt) || opt.includes(msg)
      );

      if (matched) {
        // 提取追问的主题（[pills] 前面的最后一个问句）
        const beforePills = prevAssistantReply.split(/\[pills\]/i)[0];
        const topic = extractLastQuestion(beforePills);

        return {
          isClarificationChoice: true,
          topic: topic || '未知追问',
          choice: matched,
        };
      }
    }
  }

  return { isClarificationChoice: false, topic: null, choice: null };
}

/**
 * 从文本中提取最后一个问句（以？结尾的句子）
 */
function extractLastQuestion(text) {
  if (!text) return null;
  const sentences = text.split(/[。！\n]/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (s.endsWith('？') || s.endsWith('?')) {
      return s.replace(/^[用户，]*/, '').trim();
    }
  }
  return null;
}

// ── 偏好写入 ────────────────────────────────────────────────

/**
 * 偏好分类映射：根据追问主题和选择内容，判断应写入哪个偏好节点
 */
const PREFERENCE_PATTERNS = [
  {
    keywords: ['效率', '成本', '钱', '价格', '预算', '花费'],
    path: 'cost_vs_efficiency',
    label: '成本与效率偏好',
  },
  {
    keywords: ['方向', '功能', '先做', '优先', '推进', '重心'],
    path: 'project_direction',
    label: '项目方向偏好',
  },
  {
    keywords: ['技术', '框架', '语言', '选型', '工具', '库'],
    path: 'tech_choices',
    label: '技术选型偏好',
  },
  {
    keywords: ['稳定', '新功能', '推广', '发布', '迭代'],
    path: 'release_strategy',
    label: '发布策略偏好',
  },
  {
    keywords: ['简洁', '详细', '风格', '回复', '长度'],
    path: 'communication_style',
    label: '沟通风格偏好',
  },
];

function classifyPreference(topic, choice) {
  const combined = `${topic} ${choice}`.toLowerCase();
  for (const pattern of PREFERENCE_PATTERNS) {
    if (pattern.keywords.some(kw => combined.includes(kw))) {
      return pattern;
    }
  }
  return { path: 'general', label: '一般偏好' };
}

/**
 * 保存追问偏好到 Memory v2
 *
 * @param {string} topic - 追问的主题
 * @param {string} choice - 用户的选择
 */
async function saveClarificationPreference(topic, choice) {
  const pref = classifyPreference(topic, choice);
  try {
    const alive = await memory.isAlive();
    if (!alive) return;

    const uri = `core://my_user/preferences/${pref.path}`;

    // 读取现有偏好（如果存在则追加历史），404 静默返回空
    let existing = null;
    try {
      const r = await memory.readMemory(uri, { treat404AsDebug: true });
      if (r.ok && r.data) {
        const node = r.data?.node || r.data;
        const raw = node?.content || '';
        existing = JSON.parse(raw);
      }
    } catch {}

    const now = new Date();
    const entry = {
      topic,
      choice,
      time: now.toISOString(),
    };

    let content;
    if (existing && existing.history) {
      // 追加到历史，保留最近 10 条
      existing.history.push(entry);
      if (existing.history.length > 10) {
        existing.history = existing.history.slice(-10);
      }
      existing.latest = entry;
      existing.count = (existing.count || 0) + 1;
      content = existing;
    } else {
      content = {
        label: pref.label,
        latest: entry,
        history: [entry],
        count: 1,
      };
    }

    const disclosure = `当用户遇到${pref.label}相关问题时参考`;
    const routed = memoryGovernor.routeRecord({
      source: 'clarification_preference',
      uri,
      content: JSON.stringify(content),
      priority: 2,
      disclosure,
      userMsg: `${topic} -> ${choice}`,
    });

    if (routed.decision === 'reject') {
      log.debug('clarification preference rejected by governor', { path: pref.path, reason: routed.reason });
      return;
    }
    log.info('clarification governor decision', {
      path: pref.path,
      originalUri: uri,
      targetUri: routed.uri,
      decision: routed.decision,
      layer: routed.layer,
      reason: routed.reason,
    });

    const result = await memory.writeMemory(
      routed.uri,
      routed.content,
      routed.priority ?? 2,
      routed.disclosure ?? disclosure
    );
    if (result.ok) {
      log.info('saved', { path: pref.path, choice, layer: routed.layer, decision: routed.decision, uri: routed.uri });
      return;
    }
    log.warn('preference write failed', { path: pref.path, error: result?.error || 'writeMemory failed' });
  } catch (error) {
    log.warn('save clarification preference failed', { path: pref?.path, error: error?.message || String(error) });
  }
}

// ── 偏好加载（Boot 注入）────────────────────────────────────

/**
 * 启动时加载偏好摘要，注入到 system prompt
 *
 * @returns {string} 偏好摘要文本（空字符串表示无偏好）
 */
async function loadPreferencesForBoot() {
  try {
    const alive = await memory.isAlive();
    if (!alive) return '';

    const lines = [];
    for (const pattern of PREFERENCE_PATTERNS) {
      try {
        const result = await memory.readMemory(`core://my_user/preferences/${pattern.path}`, { treat404AsDebug: true });
        if (!result.ok || !result.data) continue;
        const raw = result.data?.node?.content || result.data?.content || '';
        const parsed = JSON.parse(raw);

        if (parsed.latest) {
          lines.push(
            `- ${parsed.label || pattern.label}：倾向「${parsed.latest.choice}」（共 ${parsed.count || 1} 次选择）`
          );
        }
      } catch {}
    }

    if (lines.length === 0) return '';

    return `\n\n## 📌 用户的已知偏好（追问学习积累）\n\n${lines.join('\n')}\n\n> 遇到相关场景时，可以直接参考这些偏好，减少追问。\n`;
  } catch (e) {
    log.warn('preferences load failed', { error: e?.message || String(e) });
    return '';
  }
}

// ── 主入口（在 index.js onDone 中调用）──────────────────────

/**
 * 检测并保存追问偏好（异步，不阻塞对话）
 *
 * @param {string} userMsg - 用户当前消息
 * @param {string} assistantReply - AMY 当前回复
 * @param {string} prevAssistantReply - AMY 上一条回复（用于检测追问上下文）
 */
async function detectAndSaveClarification(userMsg, assistantReply, prevAssistantReply) {
  try {
    const { isClarificationChoice, topic, choice } = detectClarificationChoice(
      prevAssistantReply,
      userMsg
    );

    if (isClarificationChoice && topic && choice) {
      await saveClarificationPreference(topic, choice);
    }
  } catch (e) {
    // 静默失败，不影响主流程
    log.warn('detect failed', { error: e?.message || String(e) });
  }
}

module.exports = {
  detectClarificationChoice,
  saveClarificationPreference,
  loadPreferencesForBoot,
  detectAndSaveClarification,
};
