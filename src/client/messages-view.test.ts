import { describe, expect, it } from 'vitest';
import type { Convo } from '../shared/types.js';
import {
  buildConvoMessageLayout,
  buildConvoMessageLines,
} from './messages-view.js';

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

  it('tracks line ranges for each rendered message', () => {
    const convo: Convo = {
      id: 'c-2',
      sourceURL: 'convo-url',
      messages: [
        {
          id: 'oldest',
          sourceURL: 'oldest-url',
          providerID: 'test-provider',
          content: 'oldest message body',
          author: { username: 'old' },
          timestamp: 't1',
        },
        {
          id: 'latest',
          sourceURL: 'latest-url',
          providerID: 'test-provider',
          content: 'latest message body',
          author: { username: 'new' },
          timestamp: 't2',
        },
      ],
    };

    const layout = buildConvoMessageLayout(convo, 80);

    expect(layout.messages.map((message) => message.id)).toEqual([
      'latest',
      'oldest',
    ]);
    expect(layout.messageLineStarts).toHaveLength(2);
    expect(layout.messageLineCounts).toHaveLength(2);
    expect(layout.messageLineStarts[0]).toBe(0);
    expect(layout.messageLineStarts[1]).toBe(layout.messageLineCounts[0]);
    expect(layout.lines).toHaveLength(
      layout.messageLineCounts[0] + layout.messageLineCounts[1],
    );
  });
});
