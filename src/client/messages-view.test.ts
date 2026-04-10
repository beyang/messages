import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Convo } from '../shared/types.js';
import {
  buildConvoMessageLayout,
  buildConvoMessageLines,
} from './messages-view.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 10);
    const bodyLines = lines.slice(4).map((line) => line.text);

    expect(lines.slice(0, 4).map((line) => line.text)).toEqual([
      'u',
      'Time: ',
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
          timestamp: 1000,
        },
        {
          id: 'latest',
          sourceURL: 'latest-url',
          providerID: 'test-provider',
          content: 'latest message body',
          author: { username: 'new' },
          timestamp: 2000,
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

  it('renders a star before the source URL for starred messages', () => {
    const convo: Convo = {
      id: 'c-3',
      sourceURL: 'convo-url',
      messages: [
        {
          id: 'm-starred',
          sourceURL: 'starred-url',
          providerID: 'test-provider',
          hasStar: true,
          content: 'message body',
          author: { username: 'star-user' },
          timestamp: 3000,
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 80);

    expect(lines[0]?.text).toBe('⭐ starred-url');
  });

  it('renders metadata as muted lines above the from line', () => {
    const convo: Convo = {
      id: 'c-3b',
      sourceURL: 'convo-url',
      messages: [
        {
          id: 'm-metadata',
          sourceURL: 'metadata-url',
          providerID: 'test-provider',
          content: 'message body',
          metadata:
            'from: Sender <sender@example.com>\nreply-to: Reply <reply@example.com>',
          author: { username: 'sender@example.com' },
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 120);

    expect(lines.map((line) => line.text)).toEqual([
      'metadata-url',
      'Time: ',
      'from: Sender <sender@example.com>',
      'reply-to: Reply <reply@example.com>',
      'From: sender@example.com',
      '',
      'message body',
    ]);
    expect(lines[2]?.dimColor).toBe(true);
    expect(lines[3]?.dimColor).toBe(true);
    expect(lines[4]?.bold).toBe(true);
  });

  it('renders timestamps within the last 24 hours as relative age', () => {
    const now = Date.UTC(2026, 3, 10, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const convo: Convo = {
      id: 'c-4',
      sourceURL: 'recent-convo-url',
      messages: [
        {
          id: 'm-recent',
          sourceURL: 'recent-url',
          providerID: 'test-provider',
          content: 'recent message body',
          author: { username: 'recent-user' },
          timestamp: now - (3 * 60 + 7) * 60 * 1000,
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 80);

    expect(lines[1]?.text).toBe('Time: 3h7m ago');
  });

  it('omits zero-hour prefix for recent timestamps under one hour old', () => {
    const now = Date.UTC(2026, 3, 10, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const convo: Convo = {
      id: 'c-4b',
      sourceURL: 'very-recent-convo-url',
      messages: [
        {
          id: 'm-very-recent',
          sourceURL: 'very-recent-url',
          providerID: 'test-provider',
          content: 'very recent message body',
          author: { username: 'recent-user' },
          timestamp: now - 7 * 60 * 1000,
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 80);

    expect(lines[1]?.text).toBe('Time: 7m ago');
  });

  it('renders older timestamps using local datetime with weekday', () => {
    const now = Date.UTC(2026, 3, 10, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const oldTimestamp = now - 25 * 60 * 60 * 1000;
    const expectedLocalDateTime = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(oldTimestamp));

    const convo: Convo = {
      id: 'c-5',
      sourceURL: 'old-convo-url',
      messages: [
        {
          id: 'm-old',
          sourceURL: 'old-url',
          providerID: 'test-provider',
          content: 'old message body',
          author: { username: 'old-user' },
          timestamp: oldTimestamp,
        },
      ],
    };

    const lines = buildConvoMessageLines(convo, 120);

    expect(lines[1]?.text).toBe(`Time: ${expectedLocalDateTime}`);
  });
});
