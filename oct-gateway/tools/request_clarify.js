const TOOL_NAME = 'request_clarify';

function clampText(value, max = 120) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function ensureQuestionLabel(label) {
  const text = clampText(label, 80);
  if (!text) return '';
  if (/[?？]$/.test(text)) return text;
  return `${text}？`;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  const dedup = [];
  for (const raw of options) {
    const item = clampText(raw, 40);
    if (!item) continue;
    if (!dedup.includes(item)) dedup.push(item);
    if (dedup.length >= 8) break;
  }
  return dedup;
}

function normalizeField(field, index) {
  const raw = field || {};
  const idRaw = clampText(raw.id, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const id = idRaw || `field_${index + 1}`;
  const type = ['single', 'multi', 'text', 'confirm'].includes(raw.type) ? raw.type : 'single';
  const label = ensureQuestionLabel(raw.label);
  if (!label) return { ok: false, error: `fields[${index}].label 不能为空` };

  const normalized = { id, label, type };
  if (type === 'text') {
    const placeholder = clampText(raw.placeholder, 80);
    if (placeholder) normalized.placeholder = placeholder;
    return { ok: true, field: normalized };
  }

  const options = normalizeOptions(raw.options);
  if (options.length < 2) {
    return { ok: false, error: `fields[${index}].options 至少需要 2 个选项` };
  }
  normalized.options = options;

  const canUseCustom = type === 'single' || type === 'confirm';
  if (canUseCustom && normalizeBool(raw.allow_custom)) {
    normalized.allow_custom = true;
    const customLabel = clampText(raw.custom_label || '自己说', 20);
    if (customLabel) normalized.custom_label = customLabel;
    const customPlaceholder = clampText(raw.custom_placeholder, 80);
    if (customPlaceholder) normalized.custom_placeholder = customPlaceholder;
  }

  return { ok: true, field: normalized };
}

function normalizeSpec(args) {
  const input = args || {};
  const fieldsRaw = Array.isArray(input.fields) ? input.fields.slice(0, 4) : [];
  if (fieldsRaw.length === 0) {
    return { ok: false, error: 'fields 不能为空，且至少需要 1 个字段' };
  }

  const fields = [];
  for (let i = 0; i < fieldsRaw.length; i++) {
    const parsed = normalizeField(fieldsRaw[i], i);
    if (!parsed.ok) return parsed;
    fields.push(parsed.field);
  }

  const variant = input.variant === 'confirm' ? 'confirm' : 'normal';
  const spec = {
    fields,
    variant,
  };

  const title = clampText(input.title, 60);
  if (title) spec.title = title;

  const submitLabel = clampText(input.submit_label, 20);
  if (submitLabel) spec.submit_label = submitLabel;

  const skipLabel = clampText(input.skip_label, 20);
  if (skipLabel) spec.skip_label = skipLabel;

  return { ok: true, spec };
}

module.exports = {
  name: TOOL_NAME,
  displayName: '打开澄清询问器',
  category: 'system',
  riskLevel: 'safe',
  timeoutMs: 5000,
  definition: {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        '当你需要一次性收集用户多个结构化维度的信息，或需要用户在歧义意图间明确选择时，调用此工具打开澄清询问器。调用后会立即返回 waiting_user_reply；等待用户下一轮 [澄清回执]，再继续执行任务。一次对话只调用一次，不要连续追问。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '可选：任务名。省略时以前端字段问句作为每页标题。' },
          variant: { type: 'string', enum: ['normal', 'confirm'], description: '卡片类型：normal/confirm。' },
          submit_label: { type: 'string', description: '可选：提交按钮文案。' },
          skip_label: { type: 'string', description: '可选：跳过按钮文案。' },
          fields: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            description: '字段列表，最多 4 个。应把最关键字段放在第一位。',
            items: {
              type: 'object',
              required: ['id', 'label', 'type'],
              properties: {
                id: { type: 'string', description: '英文蛇形字段 ID（如 style / length / topic）' },
                label: { type: 'string', description: '完整问句（如“想写什么风格？”）' },
                type: { type: 'string', enum: ['single', 'multi', 'text', 'confirm'] },
                options: { type: 'array', items: { type: 'string' } },
                allow_custom: { type: 'boolean' },
                custom_label: { type: 'string' },
                custom_placeholder: { type: 'string' },
                placeholder: { type: 'string' },
              },
            },
          },
        },
        required: ['fields'],
      },
    },
  },
  async execute(args, context) {
    const { onToolEvent } = context || {};
    const { ok, error, spec } = normalizeSpec(args || {});
    if (!ok) {
      return {
        status: 'invalid_spec',
        error,
        hint: '请检查字段格式；如果字段不好组织，可直接用自然语言追问。',
      };
    }

    if (typeof onToolEvent === 'function') {
      onToolEvent({
        type: 'clarify_open',
        payload: { spec },
      });
    }

    return {
      status: 'waiting_user_reply',
      message:
        '澄清询问器已展示给用户。请停止继续生成，等待下一轮用户消息（通常以 [澄清回执] 开头）后再继续。',
    };
  },
};
