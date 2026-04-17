'use strict';

/**
 * oct-gateway/agents/base_agent.js
 *
 * 所有专职 Agent 的抽象基类。
 * 子类必须实现（或覆盖）以下属性：
 *   - name          {string}   Agent 唯一名称，用于日志 / 事件标识
 *   - description   {string}   用途说明（可选，供路由/调度层读取）
 *   - model         {string|null} 使用的模型 ID；null 时 runner 自动用 config.OCT_MODEL
 *   - systemPrompt  {string}   系统提示词
 *   - allowedTools  {string[]} 允许调用的工具名列表；空数组 = 禁止所有工具
 *
 * 可选覆盖的方法：
 *   - buildExtraContext(task)   异步，返回附加到 systemPrompt 末尾的字符串
 *   - formatUserMessage(task)   将任务对象格式化为 user message 字符串
 */
class BaseAgent {
  constructor() {
    // ── 子类必须重新赋值的核心属性 ──────────────────────────────────
    /** @type {string} Agent 唯一名称 */
    this.name = 'BaseAgent';

    /** @type {string} Agent 用途说明 */
    this.description = '';

    /**
     * 模型 ID。
     * - 字符串：使用指定模型
     * - null：由 agent_runner 自动取 config.DASHSCOPE_MODEL（当前全局模型）
     * @type {string|null}
     */
    this.model = null;

    /** @type {string} 系统提示词正文 */
    this.systemPrompt = '';

    /**
     * 允许调用的工具名数组。
     * - 非空数组：仅允许其中列出的工具
     * - 空数组 []：不允许任何工具（纯文本推理模式）
     * @type {string[]}
     */
    this.allowedTools = [];

    // ── 执行控制参数（子类可按需覆盖）──────────────────────────────
    /**
     * 工具循环最大轮次上限，防止无限循环。
     * @type {number}
     */
    this.maxTurns = 8;

    /**
     * 整体执行超时（毫秒）。超时后 AbortController 取消请求。
     * @type {number}
     */
    this.timeoutMs = 60000;
  }

  // ════════════════════════════════════════════════════════════════
  // 子类可重写的钩子方法
  // ════════════════════════════════════════════════════════════════

  /**
   * 在执行前构建额外上下文，返回值将拼接到 systemPrompt 末尾。
   * 可用于注入当前时间、会话元数据、动态规则等。
   *
   * @param {object} task - 任务对象 { taskId, instruction, userContext, sessionKey, ... }
   * @returns {Promise<string>} 附加上下文字符串；返回空串则不追加
   */
  async buildExtraContext(task) { // eslint-disable-line no-unused-vars
    return '';
  }

  /**
   * 将任务对象格式化为发给模型的 user message 字符串。
   * 默认优先使用 task.instruction，其次 task.userContext。
   * 子类可覆盖以生成更丰富的结构化提示。
   *
   * @param {object} task - 任务对象
   * @param {string} [task.instruction]  - 主要指令文本
   * @param {string} [task.userContext]  - 用户上下文补充
   * @param {string} [task.sessionKey]   - 会话 key（供子类引用）
   * @returns {string} user message 内容
   */
  formatUserMessage(task) {
    const parts = [];
    if (task.instruction) parts.push(task.instruction);
    if (task.userContext && task.userContext !== task.instruction) {
      parts.push(task.userContext);
    }
    return parts.join('\n\n').trim();
  }
}

module.exports = BaseAgent;
