import { describe, expect, it } from 'vitest';
import type { Convo } from '../shared/types.js';
import { buildConvoMessageLines } from './messages-view.js';

describe('buildConvoMessageLines', () => {
  it('wraps message body content at word boundaries', () => {
    const convo: Convo = {
      id: 'c-1',
      sourceURL: 'convo-url',
      messages: [
        {
          id: 'm-1',
          sourceURL: 'u',
          providerID: 'test-provider',
          content: 'alpha beta gamma delta',
          author: { username: 'a' },
          timestamp: 't',
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 10);
    const bodyLines = lines.slice(4).map((line) => line.text);

    expect(lines.slice(0, 4).map((line) => line.text)).toEqual([
      'u',
      'Time: t',
      'From: a',
      '',
    ]);
    expect(bodyLines).toEqual(['alpha beta', 'gamma', 'delta']);
    expect(
      bodyLines.every((line) => !line.startsWith(' ') && !line.endsWith(' ')),
    ).toBe(true);
  });
});
