import { describe, expect, it } from 'vitest';
import type { InboxProvider } from '../shared/types.js';
import { formatHelpModalProvider } from './help-modal.js';

describe('formatHelpModalProvider', () => {
  it('formats provider type, identity, and query using arrow-delimited key:value pairs', () => {
    const provider: InboxProvider = {
      id: 42,
      type: 'gmail',
      identity: {
        email: 'alex@example.com',
        enabled: true,
      },
      query: {
        searchQuery: 'from:me newer_than:7d',
        labels: ['INBOX', 'STARRED'],
      },
    };

    expect(formatHelpModalProvider(provider)).toBe(
      'gmail -> email:alex@example.com -> enabled:true -> searchQuery:from:me newer_than:7d -> labels:["INBOX","STARRED"]',
    );
  });

  it('omits identity and query when both are empty', () => {
    const provider: InboxProvider = {
      id: 7,
      type: 'slack',
      identity: {},
      query: {},
    };

    expect(formatHelpModalProvider(provider)).toBe('slack');
  });

  it('omits only empty identity or query segments', () => {
    expect(
      formatHelpModalProvider({
        id: 8,
        type: 'gmail',
        identity: {},
        query: { searchQuery: 'is:unread' },
      }),
    ).toBe('gmail -> searchQuery:is:unread');

    expect(
      formatHelpModalProvider({
        id: 9,
        type: 'slack',
        identity: { team: 'acme' },
        query: {},
      }),
    ).toBe('slack -> team:acme');
  });
});
