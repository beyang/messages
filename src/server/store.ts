import type Database from 'better-sqlite3';

import type { Convo, Inbox, Message } from '../shared/types';
import { initializeDatabase } from './db';
import { DUMMY_DATA } from './dummy-data';

interface InboxRow {
  id: string;
}

interface ConvoRow {
  sourceURL: string;
  inboxID: string;
  messagesJSON: string;
}

function parseMessages(messagesJSON: string, convoSourceURL: string): Message[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(messagesJSON);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse messages JSON for convo ${convoSourceURL}: ${detail}`);
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const messages: Message[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const sourceURL = (entry as { sourceURL?: unknown }).sourceURL;
    const content = (entry as { content?: unknown }).content;

    if (typeof sourceURL === 'string' && typeof content === 'string') {
      messages.push({ sourceURL, content });
    }
  }

  return messages;
}

function convoFromRow(row: ConvoRow): Convo {
  return {
    sourceURL: row.sourceURL,
    messages: parseMessages(row.messagesJSON, row.sourceURL),
  };
}

function getConvoRowsByInbox(database: Database.Database, inboxID: string): ConvoRow[] {
  return database
    .prepare(
      `
        SELECT
          source_url AS sourceURL,
          inbox_id AS inboxID,
          messages_json AS messagesJSON
        FROM convo
        WHERE inbox_id = ?
        ORDER BY source_url
      `,
    )
    .all(inboxID) as ConvoRow[];
}

export function listInboxes(): Inbox[] {
  const database = initializeDatabase();
  const inboxRows = database.prepare('SELECT id FROM inbox ORDER BY id').all() as InboxRow[];

  return inboxRows.map((inboxRow) => ({
    id: inboxRow.id,
    threads: getConvoRowsByInbox(database, inboxRow.id).map(convoFromRow),
  }));
}

export function getInbox(id: string): Inbox | null {
  const database = initializeDatabase();
  const inboxRow = database.prepare('SELECT id FROM inbox WHERE id = ?').get(id) as InboxRow | undefined;

  if (!inboxRow) {
    return null;
  }

  return {
    id: inboxRow.id,
    threads: getConvoRowsByInbox(database, inboxRow.id).map(convoFromRow),
  };
}

export function getConvo(sourceURL: string): Convo | null {
  const database = initializeDatabase();
  const convoRow = database
    .prepare(
      `
        SELECT
          source_url AS sourceURL,
          inbox_id AS inboxID,
          messages_json AS messagesJSON
        FROM convo
        WHERE source_url = ?
      `,
    )
    .get(sourceURL) as ConvoRow | undefined;

  if (!convoRow) {
    return null;
  }

  return convoFromRow(convoRow);
}

export function resetAllData(): void {
  const database = initializeDatabase();

  database.exec(`
    DELETE FROM convo;
    DELETE FROM inbox;
  `);
}

export function seedDummyData(): void {
  const database = initializeDatabase();
  const insertInbox = database.prepare('INSERT INTO inbox (id) VALUES (?)');
  const insertConvo = database.prepare(
    `
      INSERT INTO convo (source_url, inbox_id, messages_json)
      VALUES (@sourceURL, @inboxID, @messagesJSON)
    `,
  );

  const transaction = database.transaction(() => {
    resetAllData();

    for (const inbox of DUMMY_DATA) {
      insertInbox.run(inbox.id);

      for (const convo of inbox.threads) {
        insertConvo.run({
          sourceURL: convo.sourceURL,
          inboxID: inbox.id,
          messagesJSON: JSON.stringify(convo.messages),
        });
      }
    }
  });

  transaction();
}
