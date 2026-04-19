import { describe, it, expect } from 'vitest';
import { parseClarifyCard } from './parser';

describe('parseClarifyCard', () => {
  it('解析完整的 clarify_card 标签', () => {
    const input = `好的我来帮你。

[clarify_card]
{
  "title": "帮你写小红书",
  "fields": [
    {
      "id": "style",
      "label": "风格",
      "type": "single",
      "options": ["生活分享", "干货教程"],
      "allow_custom": true
    }
  ]
}
[/clarify_card]`;
    const { spec, range, stripped } = parseClarifyCard(input);
    expect(spec).not.toBeNull();
    expect(spec!.title).toBe('帮你写小红书');
    expect(spec!.fields).toHaveLength(1);
    expect(spec!.fields[0].allow_custom).toBe(true);
    expect(range).not.toBeNull();
    expect(stripped).toBe('好的我来帮你。');
  });

  it('字段少于 2 个选项的 single 字段会被过滤', () => {
    const input = `[clarify_card]
{
  "title": "测试",
  "fields": [
    { "id": "x", "label": "x", "type": "single", "options": ["只有一个"] }
  ]
}
[/clarify_card]`;
    const { spec } = parseClarifyCard(input);
    expect(spec).toBeNull();
  });

  it('fields 为空时返回 null', () => {
    const input = `[clarify_card]
{ "fields": [] }
[/clarify_card]`;
    const { spec } = parseClarifyCard(input);
    expect(spec).toBeNull();
  });

  it('title 省略时 spec 仍可解析（title 为可选字段）', () => {
    const input = `[clarify_card]
{
  "fields": [
    { "id": "x", "label": "选 A 还是 B？", "type": "single", "options": ["A", "B"] }
  ]
}
[/clarify_card]`;
    const { spec } = parseClarifyCard(input);
    expect(spec).not.toBeNull();
    expect(spec!.fields).toHaveLength(1);
    expect(spec!.title ?? '').toBe('');
  });

  it('JSON 格式错误时 spec 为 null 但标签会被剥离', () => {
    const input = `[clarify_card]{不是合法 json}[/clarify_card]正文`;
    const { spec, stripped } = parseClarifyCard(input);
    expect(spec).toBeNull();
    expect(stripped).toContain('正文');
    expect(stripped).not.toContain('clarify_card');
  });

  it('无标签时保留原文', () => {
    const input = `普通消息，没有卡片`;
    const { spec, stripped } = parseClarifyCard(input);
    expect(spec).toBeNull();
    expect(stripped).toBe(input);
  });
});
