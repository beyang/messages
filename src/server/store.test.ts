import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../shared/types';

vi.mock('./db', async () => {
  const Database = (await import('better-sqlite3')).default;
  const database = new Database(':memory:');

  database.exec(`
    CREATE TABLE convo (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      inbox_id INTEGER NOT NULL,
      messages_json TEXT NOT NULL
    );
  `);

  return {
    initializeDatabase: () => database,
  };
});

import { initializeDatabase } from './db';
import { getConvo, setMessageArchived } from './store';

describe('setMessageArchived', () => {
  beforeEach(() => {
    const database = initializeDatabase();
    database.prepare('DELETE FROM convo').run();
  });

  it('archives all provider messages in the convo when applyToConvo is true', () => {
    const database = initializeDatabase();
    const convoSourceURL =
      'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXthread';
    const targetMessageSourceURL =
      'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXmessage1';

    const messages: Message[] = [
      {
        id: 'gmail-message-1',
        sourceURL: targetMessageSourceURL,
        providerID: '1',
        content: 'First Gmail message',
        isArchived: false,
      },
      {
        id: 'gmail-message-2',
        sourceURL: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXmessage2',
        providerID: '1',
        content: 'Second Gmail message',
        isArchived: false,
      },
      {
        id: 'other-provider-message',
        sourceURL: 'https://example.com/thread/other-provider-message',
        providerID: '2',
        content: 'Message from another provider',
        isArchived: false,
      },
    ];

    database
      .prepare(
        'INSERT INTO convo (id, source_url, inbox_id, messages_json) VALUES (?, ?, ?, ?)',
      )
      .run('gmail-thread-1', convoSourceURL, 1, JSON.stringify(messages));

    const found = setMessageArchived('1', targetMessageSourceURL, true, true);

    expect(found).toBe(true);
    expect(getConvo(convoSourceURL)?.messages).toEqual([
      {
        id: 'gmail-message-1',
        sourceURL: targetMessageSourceURL,
        providerID: '1',
        content: 'First Gmail message',
        isArchived: true,
      },
      {
        id: 'gmail-message-2',
        sourceURL: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQXmessage2',
        providerID: '1',
        content: 'Second Gmail message',
        isArchived: true,
      },
      {
        id: 'other-provider-message',
        sourceURL: 'https://example.com/thread/other-provider-message',
        providerID: '2',
        content: 'Message from another provider',
        isArchived: false,
      },
    ]);
  });
});
