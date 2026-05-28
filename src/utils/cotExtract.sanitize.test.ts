import { describe, it, expect } from 'vitest';
import { sanitizeAssistantContent, normalizeAssistantTranscriptContent } from './cotExtract';

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

  describe('normalizeAssistantTranscriptContent', () => {
    describe('JSON status object', () => {
      it('strips standalone {"status":"completed"}', () => {
        const result = normalizeAssistantTranscriptContent('Before {"status":"completed"} After');
        expect(result).toContain('Before');
        expect(result).toContain('After');
        expect(result).not.toContain('"status"');
      });

      it('strips {"role":"assistant","content":"..."}', () => {
        const result = normalizeAssistantTranscriptContent('{"role":"assistant","content":"Hello"}');
        expect(result).toBe('');
      });

      it('strips {"type":"tool_call","name":"get_weather"}', () => {
        const result = normalizeAssistantTranscriptContent('x {"type":"tool_call","name":"get_weather","args":{}} y');
        expect(result).toBe('x  y');
        expect(result).not.toContain('tool_call');
      });

      it('strips nested protocol JSON objects without leaving braces behind', () => {
        const input = 'x {"type":"tool_call","name":"get_weather","args":{"city":"Shanghai"}} y';
        expect(normalizeAssistantTranscriptContent(input)).toBe('x  y');
      });

      it('strips {"status":"error","message":"API failed"}', () => {
        const result = normalizeAssistantTranscriptContent('{"status":"error","message":"API failed"}');
        expect(result).toBe('');
      });

      it('preserves JSON inside code fences', () => {
        const input = 'Here is some code:\n```json\n{"status": "ok"}\n```\nEnd.';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toContain('"status"');
        expect(result).toContain('```json');
      });

      it('preserves natural text containing JSON-like fragments', () => {
        const input = 'The response status was ok and everything worked.';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toBe(input);
      });

      it('strips multiple JSON objects in a row', () => {
        const input = 'a {"status":"completed"} b {"status":"error"} c';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toBe('a  b  c');
      });
    });

    describe('waiting_user_reply', () => {
      it('strips waiting_user_reply token', () => {
        const result = normalizeAssistantTranscriptContent('waiting_user_reply');
        expect(result).toBe('');
      });

      it('strips waiting_user_reply with surrounding text', () => {
        const result = normalizeAssistantTranscriptContent('Hello waiting_user_reply World');
        expect(result).toBe('Hello  World');
      });
    });

    describe('render_blocks fence', () => {
      it('strips raw render_blocks fence', () => {
        const input = 'Before\n```render_blocks\n{"blocks":[]}\n```\nAfter';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toContain('Before');
        expect(result).toContain('After');
        expect(result).not.toContain('render_blocks');
      });

      it('strips render_blocks fence even without pre/post text', () => {
        const input = '```render_blocks\n{"version":3,"blocks":[]}\n```';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).not.toContain('render_blocks');
      });

      it('strips json render_blocks fence variant', () => {
        const input = 'Before\n```json render_blocks\n{"blocks":[]}\n```\nAfter';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toBe('Before\n\nAfter');
      });
    });

    describe('inherits sanitizeAssistantContent behavior', () => {
      it('still strips [THINK_MODE:xxx]', () => {
        const result = normalizeAssistantTranscriptContent('Hello [THINK_MODE:silent] World');
        expect(result).toBe('Hello  World');
      });

      it('still strips <|tool_calls_section_begin|>', () => {
        const input = 'Before <|tool_calls_section_begin|>leak<|tool_calls_section_end|> After';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toContain('Before');
        expect(result).toContain('After');
        expect(result).not.toContain('section_begin');
      });

      it('still strips [To="canvas"] {}', () => {
        const input = 'Hello [To="canvas"] {"action":"draw"} World';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toContain('Hello');
        expect(result).toContain('World');
        expect(result).not.toContain('[To="canvas"]');
      });

      it('preserves clean text unchanged', () => {
        const input = '你好，这是一段正常的回复内容。\n\n包含一些格式化。';
        const result = normalizeAssistantTranscriptContent(input);
        expect(result).toBe(input.trim());
      });

      it('returns empty for empty input', () => {
        expect(normalizeAssistantTranscriptContent('')).toBe('');
      });

      it('returns empty for null', () => {
        expect(normalizeAssistantTranscriptContent(null as unknown as string)).toBe('');
      });

      it('returns empty for undefined', () => {
        expect(normalizeAssistantTranscriptContent(undefined as unknown as string)).toBe('');
      });
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
