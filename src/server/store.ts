import type Database from 'better-sqlite3';
import pino from 'pino';

import {
  type Convo,
  type Inbox,
  type Message,
  messageSchema,
  type ProviderConfig2,
  type ProviderIdentity,
} from '../shared/types';
import { initializeDatabase } from './db';
import { DUMMY_DATA } from './dummy-data';

const logger = pino({
  name: 'store',
  transport: { target: 'pino-pretty' },
});

interface InboxRow {
  id: string;
}

interface ConvoRow {
  id: string;
  sourceURL: string;
  inboxID: string;
  messagesJSON: string;
}

interface ProviderConfig2Row {
  id: number;
  secretsValue: string;
  type: string;
  identityJSON: string;
}

interface InboxProviderConfig2Row extends ProviderConfig2Row {
  queryJSON: string;
}

export type InboxProviderConfig2 = ProviderConfig2 & {
  query: ProviderIdentity;
};

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

function parseProviderIdentity(identityJSON: string): ProviderIdentity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(identityJSON);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as ProviderIdentity;
}

function providerConfig2FromRow(row: ProviderConfig2Row): ProviderConfig2 {
  return {
    id: row.id,
    secretsValue: row.secretsValue,
    type: row.type,
    identity: parseProviderIdentity(row.identityJSON),
  };
}

function inboxFromRow(database: Database.Database, row: InboxRow): Inbox {
  return {
    id: row.id,
    convos: getConvoRowsByInbox(database, row.id).map(convoFromRow),
  };
}

export function listInboxes(): Inbox[] {
  const database = initializeDatabase();
  const inboxRows = database
    .prepare('SELECT id FROM inbox ORDER BY id')
    .all() as InboxRow[];

  return inboxRows.map((row) => inboxFromRow(database, row));
}

export function createInbox(id: string): Inbox {
  const database = initializeDatabase();
  database.prepare('INSERT INTO inbox (id) VALUES (?)').run(id);
  logger.info({ inboxID: id }, 'created inbox');
  return { id, convos: [] };
}

export function deleteInbox(id: string): boolean {
  const database = initializeDatabase();
  const result = database.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  logger.info({ inboxID: id, changed: result.changes > 0 }, 'deleted inbox');
  return result.changes > 0;
}

export function getInbox(id: string): Inbox | null {
  const database = initializeDatabase();
  const inboxRow = database
    .prepare('SELECT id FROM inbox WHERE id = ?')
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

export function getInboxProviders2(inboxID: string): InboxProviderConfig2[] {
  const database = initializeDatabase();
  const rows = database
    .prepare(
      `
        SELECT
          p.id AS id,
          p.secrets_value AS secretsValue,
          p.type AS type,
          p.identity AS identityJSON,
          ip.query AS queryJSON
        FROM inbox_providers ip
        JOIN providers p ON p.id = ip.provider_id
        WHERE ip.inbox_id = ?
        ORDER BY p.id
      `,
    )
    .all(inboxID) as InboxProviderConfig2Row[];

  return rows.map((row) => ({
    ...providerConfig2FromRow(row),
    query: parseProviderIdentity(row.queryJSON),
  }));
}

export function setInboxProviderAssociations(
  inboxID: string,
  providerIDs: number[],
): void {
  const uniqueProviderIDs = [...new Set(providerIDs)];
  if (uniqueProviderIDs.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Provider IDs must be positive integers.');
  }

  const database = initializeDatabase();
  const inboxExists = database
    .prepare('SELECT 1 FROM inbox WHERE id = ?')
    .get(inboxID);
  if (!inboxExists) {
    throw new Error('Inbox not found.');
  }

  if (uniqueProviderIDs.length > 0) {
    const placeholders = uniqueProviderIDs.map(() => '?').join(', ');
    const matchedProviders = database
      .prepare(`SELECT id FROM providers WHERE id IN (${placeholders})`)
      .all(...uniqueProviderIDs) as { id: number }[];
    if (matchedProviders.length !== uniqueProviderIDs.length) {
      throw new Error('One or more providers were not found.');
    }
  }

  database.transaction(() => {
    const insertAssociation = database.prepare(`
      INSERT INTO inbox_providers (inbox_id, provider_id, query)
      SELECT ?, ?, '{}'
      WHERE NOT EXISTS (
        SELECT 1
        FROM inbox_providers
        WHERE inbox_id = ? AND provider_id = ?
      )
    `);

    for (const providerID of uniqueProviderIDs) {
      insertAssociation.run(inboxID, providerID, inboxID, providerID);
    }

    if (uniqueProviderIDs.length === 0) {
      database
        .prepare('DELETE FROM inbox_providers WHERE inbox_id = ?')
        .run(inboxID);
      return;
    }

    const placeholders = uniqueProviderIDs.map(() => '?').join(', ');
    database
      .prepare(
        `DELETE FROM inbox_providers
         WHERE inbox_id = ? AND provider_id NOT IN (${placeholders})`,
      )
      .run(inboxID, ...uniqueProviderIDs);
  })();

  logger.info(
    { inboxID, providerIDs: uniqueProviderIDs },
    'set inbox providers',
  );
}

export function createProviderConfig2(config: {
  type: string;
  secretsValue: string;
  identity: ProviderIdentity;
}): ProviderConfig2 {
  const database = initializeDatabase();
  const result = database
    .prepare(
      'INSERT INTO providers (secrets_value, type, identity) VALUES (?, ?, ?)',
    )
    .run(config.secretsValue, config.type, JSON.stringify(config.identity));

  const provider: ProviderConfig2 = {
    id: Number(result.lastInsertRowid),
    secretsValue: config.secretsValue,
    type: config.type,
    identity: config.identity,
  };

  logger.info(
    { providerID: provider.id, type: provider.type },
    'created provider',
  );
  return provider;
}

export function listProviderConfigs2(): ProviderConfig2[] {
  const database = initializeDatabase();
  const rows = database
    .prepare(
      'SELECT id, secrets_value AS secretsValue, type, identity AS identityJSON FROM providers ORDER BY id',
    )
    .all() as ProviderConfig2Row[];

  return rows.map(providerConfig2FromRow);
}

export function getProviderConfig2(id: number): ProviderConfig2 | null {
  const database = initializeDatabase();
  const row = database
    .prepare(
      'SELECT id, secrets_value AS secretsValue, type, identity AS identityJSON FROM providers WHERE id = ?',
    )
    .get(id) as ProviderConfig2Row | undefined;

  if (!row) {
    return null;
  }

  return providerConfig2FromRow(row);
}

export function mergeMessages(
  existing: Message[],
  incoming: Message[],
): Message[] {
  const merged = [...existing];
  const existingIndexByID = new Map(
    merged.map((message, index) => [message.id, index]),
  );

  for (const msg of incoming) {
    const existingIndex = existingIndexByID.get(msg.id);
    if (existingIndex === undefined) {
      existingIndexByID.set(msg.id, merged.length);
      merged.push(msg);
      continue;
    }

    const existingMessage = merged[existingIndex];
    const updates: Partial<Message> = {};

    if (existingMessage.providerID !== msg.providerID) {
      updates.providerID = msg.providerID;
    }

    if (
      typeof msg.hasStar === 'boolean' &&
      existingMessage.hasStar !== msg.hasStar
    ) {
      updates.hasStar = msg.hasStar;
    }

    if (Object.keys(updates).length > 0) {
      merged[existingIndex] = {
        ...existingMessage,
        ...updates,
      };
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
    `UPDATE convo
     SET source_url = @sourceURL,
         inbox_id = @inboxID,
         messages_json = @messagesJSON
     WHERE id = @id`,
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
          inboxID,
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

export function clearInbox(inboxID: string): number {
  const database = initializeDatabase();
  const result = database
    .prepare('DELETE FROM convo WHERE inbox_id = ?')
    .run(inboxID);
  logger.info(
    { inboxID, deleted: result.changes },
    'cleared all convos from inbox',
  );
  return result.changes;
}

export function resetAllData(): void {
  const database = initializeDatabase();

  logger.warn(
    'resetting all data: deleting all rows from inbox, convo, providers, inbox_providers',
  );
  database.exec(`
    DELETE FROM convo;
    DELETE FROM inbox_providers;
    DELETE FROM providers;
    DELETE FROM inbox;
  `);
}

export function seedDummyData(): void {
  const database = initializeDatabase();
  const insertInbox = database.prepare('INSERT INTO inbox (id) VALUES (?)');
  const insertConvo = database.prepare(
    `
      INSERT INTO convo (id, source_url, inbox_id, messages_json)
      VALUES (@id, @sourceURL, @inboxID, @messagesJSON)
    `,
  );

  const transaction = database.transaction(() => {
    resetAllData();

    for (const inbox of DUMMY_DATA) {
      insertInbox.run(inbox.id);

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
