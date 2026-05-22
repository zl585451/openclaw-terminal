'use strict';

const { describe, it, expect } = globalThis;
const { sanitizeAssistantReply, toUserVisibleAssistantText } = require('../cot_sanitize');

describe('assistant reply normalization strips internal protocol payloads from user-visible text', () => {
  it('extracts content from serialized assistant message objects', () => {
    const raw = '{"role":"assistant","content":"抱歉，我无法直接查看图片。"}';
    expect(toUserVisibleAssistantText(raw)).toBe('抱歉，我无法直接查看图片。');
    expect(sanitizeAssistantReply(raw)).toBe('抱歉，我无法直接查看图片。');
  });

  it('extracts workflow message from completed status objects even with a short persona prefix', () => {
    const raw = '少{ "status":"completed","message":"以下是为您量身定制的短视频创作方案。"}';
    expect(toUserVisibleAssistantText(raw)).toBe('以下是为您量身定制的短视频创作方案。');
    expect(sanitizeAssistantReply(raw)).toBe('以下是为您量身定制的短视频创作方案。');
  });

  it('suppresses waiting_user_reply protocol payloads instead of rendering them as chat text', () => {
    const raw = '{ "status":"waiting_user_reply","message":"澄清询问器已展示给用户。"}';
    expect(toUserVisibleAssistantText(raw)).toBe('');
    expect(sanitizeAssistantReply(raw)).toBe('');
  });
});
