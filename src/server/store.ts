import type Database from 'better-sqlite3';

import {
  type Convo,
  type Inbox,
  type Message,
  messageSchema,
  type ProviderConfig,
} from '../shared/types';
import { initializeDatabase } from './db';
import { DUMMY_DATA } from './dummy-data';

interface InboxRow {
  id: string;
  providersJSON: string;
}

interface ConvoRow {
  id: string;
  sourceURL: string;
  inboxID: string;
  messagesJSON: string;
}

function parseMessages(
  messagesJSON: string,
  convoSourceURL: string,
): Message[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(messagesJSON);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse messages JSON for convo ${convoSourceURL}: ${detail}`,
    );
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry) => {
    const result = messageSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

function convoFromRow(row: ConvoRow): Convo {
  return {
    id: row.id,
    sourceURL: row.sourceURL,
    messages: parseMessages(row.messagesJSON, row.sourceURL),
  };
}

function getConvoRowsByInbox(
  database: Database.Database,
  inboxID: string,
): ConvoRow[] {
  return database
    .prepare(
      `
        SELECT
          id,
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

function parseProviders(providersJSON: string): ProviderConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(providersJSON);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const providers: ProviderConfig[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const id = (entry as { id?: unknown }).id;
    const type = (entry as { type?: unknown }).type;
    const args = (entry as { args?: unknown }).args ?? null;
    if (typeof id === 'string' && typeof type === 'string') {
      providers.push({ id, type, args: args as ProviderConfig['args'] });
    }
  }
  return providers;
}

function inboxFromRow(database: Database.Database, row: InboxRow): Inbox {
  return {
    id: row.id,
    convos: getConvoRowsByInbox(database, row.id).map(convoFromRow),
    providers: parseProviders(row.providersJSON),
  };
}

export function listInboxes(): Inbox[] {
  const database = initializeDatabase();
  const inboxRows = database
    .prepare(
      'SELECT id, providers_json AS providersJSON FROM inbox ORDER BY id',
    )
    .all() as InboxRow[];

  return inboxRows.map((row) => inboxFromRow(database, row));
}

export function createInbox(id: string): Inbox {
  const database = initializeDatabase();
  database
    .prepare('INSERT INTO inbox (id, providers_json) VALUES (?, ?)')
    .run(id, '[]');
  return { id, convos: [], providers: [] };
}

export function deleteInbox(id: string): boolean {
  const database = initializeDatabase();
  const result = database.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getInbox(id: string): Inbox | null {
  const database = initializeDatabase();
  const inboxRow = database
    .prepare(
      'SELECT id, providers_json AS providersJSON FROM inbox WHERE id = ?',
    )
    .get(id) as InboxRow | undefined;

  if (!inboxRow) {
    return null;
  }

  return inboxFromRow(database, inboxRow);
}

export function getConvo(sourceURL: string): Convo | null {
  const database = initializeDatabase();
  const convoRow = database
    .prepare(
      `
        SELECT
          id,
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

export function getInboxProviders(inboxID: string): ProviderConfig[] {
  const database = initializeDatabase();
  const row = database
    .prepare('SELECT providers_json AS providersJSON FROM inbox WHERE id = ?')
    .get(inboxID) as { providersJSON: string } | undefined;
  if (!row) return [];
  return parseProviders(row.providersJSON);
}

function getInboxProvidersInternal(
  database: Database.Database,
  inboxID: string,
): ProviderConfig[] {
  const row = database
    .prepare('SELECT providers_json AS providersJSON FROM inbox WHERE id = ?')
    .get(inboxID) as { providersJSON: string } | undefined;
  if (!row) return [];
  return parseProviders(row.providersJSON);
}

function setInboxProviders(
  database: Database.Database,
  inboxID: string,
  providers: ProviderConfig[],
): void {
  database
    .prepare('UPDATE inbox SET providers_json = ? WHERE id = ?')
    .run(JSON.stringify(providers), inboxID);
}

export function createProviderConfig(
  inboxID: string,
  config: ProviderConfig,
): ProviderConfig {
  const database = initializeDatabase();
  const providers = getInboxProvidersInternal(database, inboxID);
  providers.push(config);
  setInboxProviders(database, inboxID, providers);
  return config;
}

export function updateProviderConfig(
  inboxID: string,
  id: string,
  updates: { type?: string; args?: ProviderConfig['args'] },
): ProviderConfig | null {
  const database = initializeDatabase();
  const providers = getInboxProvidersInternal(database, inboxID);
  const provider = providers.find((p) => p.id === id);
  if (!provider) return null;
  if (updates.type !== undefined) provider.type = updates.type;
  if (updates.args !== undefined) provider.args = updates.args;
  setInboxProviders(database, inboxID, providers);
  return provider;
}

export function deleteProviderConfig(inboxID: string, id: string): boolean {
  const database = initializeDatabase();
  const providers = getInboxProvidersInternal(database, inboxID);
  const index = providers.findIndex((p) => p.id === id);
  if (index < 0) return false;
  providers.splice(index, 1);
  setInboxProviders(database, inboxID, providers);
  return true;
}

export function mergeMessages(
  existing: Message[],
  incoming: Message[],
): Message[] {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing];
  for (const msg of incoming) {
    if (!seen.has(msg.id)) {
      seen.add(msg.id);
      merged.push(msg);
    }
  }
  return merged;
}

export function mergeConvosIntoInbox(
  inboxID: string,
  convos: Convo[],
): Convo[] {
  const database = initializeDatabase();
  const result: Convo[] = [];

  const selectConvo = database.prepare(
    `SELECT id, source_url AS sourceURL, inbox_id AS inboxID, messages_json AS messagesJSON
     FROM convo WHERE id = ?`,
  );
  const insertConvo = database.prepare(
    `INSERT INTO convo (id, source_url, inbox_id, messages_json)
     VALUES (@id, @sourceURL, @inboxID, @messagesJSON)`,
  );
  const updateConvo = database.prepare(
    `UPDATE convo SET source_url = @sourceURL, messages_json = @messagesJSON WHERE id = @id`,
  );

  database.transaction(() => {
    for (const convo of convos) {
      const existingRow = selectConvo.get(convo.id) as ConvoRow | undefined;

      if (existingRow) {
        const existingMessages = parseMessages(
          existingRow.messagesJSON,
          existingRow.sourceURL,
        );
        const merged = mergeMessages(existingMessages, convo.messages);
        updateConvo.run({
          id: convo.id,
          sourceURL: convo.sourceURL,
          messagesJSON: JSON.stringify(merged),
        });
        result.push({ ...convo, messages: merged });
      } else {
        insertConvo.run({
          id: convo.id,
          sourceURL: convo.sourceURL,
          inboxID,
          messagesJSON: JSON.stringify(convo.messages),
        });
        result.push(convo);
      }
    }
  })();

  return result;
}

export function resetAllData(): void {
  const database = initializeDatabase();

  database.exec(`
    DELETE FROM convo;
    DELETE FROM provider_secrets;
    DELETE FROM inbox;
  `);
}

export function seedDummyData(): void {
  const database = initializeDatabase();
  const insertInbox = database.prepare(
    'INSERT INTO inbox (id, providers_json) VALUES (?, ?)',
  );
  const insertConvo = database.prepare(
    `
      INSERT INTO convo (id, source_url, inbox_id, messages_json)
      VALUES (@id, @sourceURL, @inboxID, @messagesJSON)
    `,
  );

  const transaction = database.transaction(() => {
    resetAllData();

    for (const inbox of DUMMY_DATA) {
      insertInbox.run(inbox.id, JSON.stringify(inbox.providers));

      for (const convo of inbox.convos) {
        insertConvo.run({
          id: convo.id,
          sourceURL: convo.sourceURL,
          inboxID: inbox.id,
          messagesJSON: JSON.stringify(convo.messages),
        });
      }
    }
  });

  transaction();
}
