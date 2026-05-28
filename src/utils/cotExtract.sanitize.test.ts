import { describe, it, expect } from 'vitest';
import { sanitizeAssistantContent } from './cotExtract';

describe('sanitizeAssistantContent', () => {
  describe('think mode marker', () => {
    it('strips inline [THINK_MODE:xxx]', () => {
      expect(sanitizeAssistantContent('Hello [THINK_MODE:silent] World')).toBe('Hello  World');
    });

    it('strips [THINK_MODE:xxx] on its own line', () => {
      const input = 'First line\n[THINK_MODE:detailed]\nSecond line';
      expect(sanitizeAssistantContent(input)).toBe('First line\nSecond line');
    });

    it('is case-insensitive', () => {
      expect(sanitizeAssistantContent('[think_mode:verbose] text')).toBe('text');
    });
  });

  describe('leaked tool call sections', () => {
    it('strips paired section_begin / section_end', () => {
      const input = 'Before <|tool_calls_section_begin|>some stuff<|tool_calls_section_end|> After';
      const result = sanitizeAssistantContent(input);
      expect(result).toContain('Before');
      expect(result).toContain('After');
      expect(result).not.toContain('tool_calls_section_begin');
    });

    it('truncates unclosed section_begin', () => {
      const input = 'Before <|tool_calls_section_begin|>never closed';
      const result = sanitizeAssistantContent(input);
      expect(result).toBe('Before');
      expect(result).not.toContain('tool_calls_section_begin');
    });
  });

  describe('text tool annotations', () => {
    it('strips [To="canvas"] { ... } blocks', () => {
      const input = 'Hello [To="canvas"] {"action":"draw"} World';
      const result = sanitizeAssistantContent(input);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).not.toContain('[To="canvas"]');
    });

    it('strips nested braces correctly', () => {
      const input = 'Text [To="tool"] {"nested":{"key":"val"}} End';
      const result = sanitizeAssistantContent(input);
      expect(result).toContain('Text');
      expect(result).toContain('End');
      expect(result).not.toContain('[To="tool"]');
    });
  });

  describe('pipeline order', () => {
    it('applies stripThinkMode -> stripLeaked -> stripAnnotations', () => {
      const input = '[THINK_MODE:off] visible text <|tool_calls_section_begin|>leaked<|tool_calls_section_end|> [To="x"] {"a":1} done';
      const result = sanitizeAssistantContent(input);
      expect(result).not.toContain('THINK_MODE');
      expect(result).not.toContain('tool_calls_section');
      expect(result).not.toContain('[To="x"]');
      expect(result).toContain('visible text');
      expect(result).toContain('done');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeAssistantContent('')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(sanitizeAssistantContent(null as unknown as string)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(sanitizeAssistantContent(undefined as unknown as string)).toBe('');
    });

    it('returns trimmed text when no markers present', () => {
      expect(sanitizeAssistantContent('  hello  ')).toBe('hello');
    });
  });
});
