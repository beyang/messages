import { describe, expect, it } from 'vitest';
import { sanitizeForTerminalText } from './terminal-text.js';

describe('sanitizeForTerminalText', () => {
  it('normalizes CRLF and strips terminal control sequences', () => {
    expect(
      sanitizeForTerminalText('a\r\nb\r\u001b[31mred\u001b[0m\u0007'),
    ).toBe('a\nb\nred');
  });

  it('removes bidi controls and expands tabs', () => {
    expect(sanitizeForTerminalText('x\u202Eabc\u2069\tend')).toBe('xabc  end');
  });
});
