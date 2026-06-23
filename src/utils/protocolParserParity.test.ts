/**
 * 前后端协议解析「一致性契约」测试。
 *
 * 背景：`stripTextToolAnnotations`（剥离正文里泄漏的 `[To="..."] {...}` 工具调用块）
 * 在两侧各有一份实现，且不能物理合并：
 *  - 前端 src/utils/cotExtract.ts —— TS/ESM，vite 打包，用于 UI 显示
 *  - 后端 oct-gateway/cot_sanitize.js —— CJS，electron-builder 作为独立资源目录打包
 * 两者跨 vite/CJS 构建边界，无法共享同一文件（详见 P1 blocker 说明）。
 *
 * 本测试是它们之间的“单一契约”：对**公共子集**（纯 `[To=...]{...}` 注释块）
 * 断言两侧行为一致，任何一侧未来漂移都会让此测试失败。
 *
 * 注意两侧合法的差异：后端额外折叠多空格（`[ \t]{2,}→' '`）、额外处理
 * `{tool=>...}` / `<tool_code>` / `[TOOL_CALLS]`。因此契约用“空白归一化后相等”
 * 来比较公共子集，并单列后端独有的增强项（不要求前端一致）。
 */
import { describe, it, expect } from 'vitest';
import { stripTextToolAnnotations as frontendStrip } from './cotExtract';
// 后端 CJS 模块：默认导入 module.exports 后取函数。该测试文件被 tsconfig exclude，
// 不进入 `npx tsc`，仅由 vitest 运行，故跨目录引入 .js 不影响前端类型检查。
import gatewaySanitize from '../../oct-gateway/cot_sanitize.js';

const gatewayStrip = (gatewaySanitize as { stripTextToolAnnotations: (s: string) => string })
  .stripTextToolAnnotations;

/** 归一化空白：折叠所有连续空白为单空格并 trim，用于跨“空白策略差异”比较语义一致性。 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 公共契约用例：纯 `[To=...]{...}` 工具注释块，两侧必须语义一致地剥离。 */
const SHARED_CASES: ReadonlyArray<{ name: string; input: string }> = [
  { name: '无注释直通', input: '这是一段正常的回复文本。' },
  { name: '双引号 To + 简单 JSON', input: '前文 [To="canvas"] {"a":1} 后文' },
  { name: '单引号 To', input: "开头 [To='memory.write'] {\"k\":\"v\"} 结尾" },
  { name: '嵌套大括号', input: '左 [To="canvas"] {"a":{"b":{"c":2}}} 右' },
  { name: 'JSON 字符串内含右括号不应误判', input: 'a [To="x"] {"text":"含 } 字符"} b' },
  { name: 'JSON 字符串内含转义引号', input: 'p [To="x"] {"t":"说\\"你好\\""} q' },
  { name: '多个连续注释块', input: '甲 [To="a"] {"x":1} 乙 [To="b"] {"y":2} 丙' },
  { name: '注释块在结尾', input: '正文结束 [To="canvas"] {"done":true}' },
  { name: '注释块在开头', input: '[To="canvas"] {"x":1} 正文开始' },
];

describe('protocol parser parity: stripTextToolAnnotations 公共契约', () => {
  it('两侧实现都存在且为函数', () => {
    expect(typeof frontendStrip).toBe('function');
    expect(typeof gatewayStrip).toBe('function');
  });

  for (const { name, input } of SHARED_CASES) {
    it(`公共子集语义一致：${name}`, () => {
      const front = frontendStrip(input);
      const gateway = gatewayStrip(input);
      // 空白归一化后必须完全相等：证明两侧对“移除什么、保留什么”达成一致。
      expect(normalizeWhitespace(front)).toBe(normalizeWhitespace(gateway));
    });

    it(`注释残留已剥离（两侧）：${name}`, () => {
      for (const out of [frontendStrip(input), gatewayStrip(input)]) {
        // 剥离后不应再出现 [To=...] 头标记。
        expect(out).not.toMatch(/\[To=/i);
      }
    });
  }

  it('非注释正文被保留（抽样校验内容未被吞掉）', () => {
    const input = '甲 [To="a"] {"x":1} 乙 [To="b"] {"y":2} 丙';
    const front = normalizeWhitespace(frontendStrip(input));
    expect(front).toContain('甲');
    expect(front).toContain('乙');
    expect(front).toContain('丙');
    expect(normalizeWhitespace(gatewayStrip(input))).toBe(front);
  });
});

describe('protocol parser parity: 已知且有意的两侧差异（防止被误当成 bug 修“齐”）', () => {
  it('后端额外剥离 {tool=>...} 风格，前端不处理（分层差异，非漂移）', () => {
    const input = 'x {tool => "canvas", args => { "a": 1 }} y';
    // 后端会剥离该块。
    expect(gatewayStrip(input)).not.toContain('tool =>');
    // 前端不识别此格式，按原样保留 —— 这是有意的分层职责差异。
    expect(frontendStrip(input)).toContain('tool =>');
  });
});
