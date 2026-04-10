import type Database from 'better-sqlite3';
import pino from 'pino';

import {
  type Convo,
  type Inbox,
  type Message,
  messageSchema,
  type ProviderConfig,
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

interface InboxProviderConfigRow {
  id: number;
  type: string;
  identityJSON: string;
  queryJSON: string;
}

interface ProviderRow {
  id: number;
  type: string;
  identityJSON: string;
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

function providerArgsToIdentity(
  args: ProviderConfig['args'],
): ProviderIdentity {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }

  return args as ProviderIdentity;
}

function splitProviderArgs(
  type: string,
  args: ProviderConfig['args'],
): { identity: ProviderIdentity; query: ProviderIdentity } {
  const argsObject = providerArgsToIdentity(args);

  if (type === 'gmail') {
    const identity: ProviderIdentity = {};
    const query: ProviderIdentity = {};

    for (const [key, value] of Object.entries(argsObject)) {
      if (key === 'searchQuery') {
        query.searchQuery = value;
      } else {
        identity[key] = value;
      }
    }

    return { identity, query };
  }

  if (type === 'slack') {
    return { identity: {}, query: argsObject };
  }

  return { identity: {}, query: argsObject };
}

function combineProviderIdentityAndQuery(
  identity: ProviderIdentity,
  query: ProviderIdentity,
): ProviderConfig['args'] {
  const merged = { ...identity, ...query };
  return Object.keys(merged).length > 0 ? merged : null;
}

function getInboxProviderConfigsInternal(
  database: Database.Database,
  inboxID: string,
): ProviderConfig[] {
  const rows = database
    .prepare(
      `
        SELECT
          p.id AS id,
          p.type AS type,
          p.identity AS identityJSON,
          ip.query AS queryJSON
        FROM inbox_providers ip
        JOIN providers p ON p.id = ip.provider_id
        WHERE ip.inbox_id = ?
        ORDER BY p.id
      `,
    )
    .all(inboxID) as InboxProviderConfigRow[];

  return rows.map((row) => {
    const identity = parseProviderIdentity(row.identityJSON);
    const query = parseProviderIdentity(row.queryJSON);

    return {
      id: row.id.toString(),
      type: row.type,
      args: combineProviderIdentityAndQuery(identity, query),
    };
  });
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
    providers: getInboxProviderConfigsInternal(database, row.id),
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
  return { id, convos: [], providers: [] };
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

export function getInboxProviders(inboxID: string): ProviderConfig[] {
  const database = initializeDatabase();
  return getInboxProviderConfigsInternal(database, inboxID);
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

function parseProviderID(providerID: string): number | null {
  if (!/^\d+$/.test(providerID)) {
    return null;
  }
  const parsed = Number.parseInt(providerID, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getProviderConfigByIDInternal(
  database: Database.Database,
  providerID: number,
): ProviderRow | undefined {
  return database
    .prepare(
      'SELECT id, type, identity AS identityJSON FROM providers WHERE id = ?',
    )
    .get(providerID) as ProviderRow | undefined;
}

function linkProviderToInbox(
  database: Database.Database,
  inboxID: string,
  providerID: number,
  query: ProviderIdentity,
): void {
  database
    .prepare(
      `
        INSERT INTO inbox_providers (inbox_id, provider_id, query)
        VALUES (?, ?, ?)
        ON CONFLICT(inbox_id, provider_id, query)
        DO NOTHING
      `,
    )
    .run(inboxID, providerID, JSON.stringify(query));
}

export function createProviderConfig(
  inboxID: string,
  config: ProviderConfig,
): ProviderConfig {
  const database = initializeDatabase();
  const split = splitProviderArgs(config.type, config.args);
  const existingProviderID = parseProviderID(config.id);
  if (existingProviderID) {
    const existing = getProviderConfigByIDInternal(
      database,
      existingProviderID,
    );
    if (existing) {
      const existingSplit = splitProviderArgs(existing.type, config.args);
      linkProviderToInbox(
        database,
        inboxID,
        existingProviderID,
        existingSplit.query,
      );
      const identity = parseProviderIdentity(existing.identityJSON);
      return {
        id: existing.id.toString(),
        type: existing.type,
        args: combineProviderIdentityAndQuery(identity, existingSplit.query),
      };
    }
  }

  const provider2 = createProviderConfig2({
    type: config.type,
    secretsValue: '',
    identity: split.identity,
  });

  linkProviderToInbox(database, inboxID, provider2.id, split.query);

  return {
    id: provider2.id.toString(),
    type: provider2.type,
    args: combineProviderIdentityAndQuery(provider2.identity, split.query),
  };
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

export function updateProviderConfig(
  inboxID: string,
  id: string,
  updates: { type?: string; args?: ProviderConfig['args'] },
): ProviderConfig | null {
  const database = initializeDatabase();
  const providerID = parseProviderID(id);
  if (!providerID) {
    return null;
  }

  const linkRow = database
    .prepare(
      `
        SELECT id, query AS queryJSON
        FROM inbox_providers
        WHERE inbox_id = ? AND provider_id = ?
        ORDER BY id
        LIMIT 1
      `,
    )
    .get(inboxID, providerID) as { id: number; queryJSON: string } | undefined;
  if (!linkRow) {
    return null;
  }

  const row = getProviderConfigByIDInternal(database, providerID);
  if (!row) {
    return null;
  }

  const nextType = updates.type ?? row.type;
  let nextIdentity = parseProviderIdentity(row.identityJSON);
  let nextQuery = parseProviderIdentity(linkRow.queryJSON);

  if (updates.args !== undefined) {
    const split = splitProviderArgs(nextType, updates.args);
    nextIdentity = split.identity;
    nextQuery = split.query;
  }

  database
    .prepare('UPDATE providers SET type = ?, identity = ? WHERE id = ?')
    .run(nextType, JSON.stringify(nextIdentity), providerID);

  if (updates.args !== undefined) {
    database
      .prepare('UPDATE inbox_providers SET query = ? WHERE id = ?')
      .run(JSON.stringify(nextQuery), linkRow.id);
  }

  return {
    id: providerID.toString(),
    type: nextType,
    args: combineProviderIdentityAndQuery(nextIdentity, nextQuery),
  };
}

export function deleteProviderConfig(inboxID: string, id: string): boolean {
  const database = initializeDatabase();
  const providerID = parseProviderID(id);
  if (!providerID) {
    return false;
  }

  const unlinkResult = database
    .prepare(
      'DELETE FROM inbox_providers WHERE inbox_id = ? AND provider_id = ?',
    )
    .run(inboxID, providerID);
  if (unlinkResult.changes === 0) {
    return false;
  }

  const remainingLinkRow = database
    .prepare(
      'SELECT COUNT(*) AS count FROM inbox_providers WHERE provider_id = ?',
    )
    .get(providerID) as { count: number };

  if (remainingLinkRow.count === 0) {
    database.prepare('DELETE FROM providers WHERE id = ?').run(providerID);
  }

  return true;
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
    'resetting all data: deleting all rows from inbox, convo, providers, inbox_providers, provider_secrets',
  );
  database.exec(`
    DELETE FROM convo;
    DELETE FROM inbox_providers;
    DELETE FROM providers;
    DELETE FROM provider_secrets;
    DELETE FROM inbox;
  `);
}

export function seedDummyData(): void {
  const database = initializeDatabase();
  const insertInbox = database.prepare('INSERT INTO inbox (id) VALUES (?)');
  const insertProvider = database.prepare(
    'INSERT INTO providers (secrets_value, type, identity) VALUES (?, ?, ?)',
  );
  const insertInboxProvider = database.prepare(
    'INSERT INTO inbox_providers (inbox_id, provider_id, query) VALUES (?, ?, ?)',
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
      insertInbox.run(inbox.id);

      const providerIDMap = new Map<string, string>();
      for (const provider of inbox.providers) {
        const split = splitProviderArgs(provider.type, provider.args);
        const result = insertProvider.run(
          '',
          provider.type,
          JSON.stringify(split.identity),
        );
        const providerID = Number(result.lastInsertRowid);
        insertInboxProvider.run(
          inbox.id,
          providerID,
          JSON.stringify(split.query),
        );
        providerIDMap.set(provider.id, providerID.toString());
      }

      for (const convo of inbox.convos) {
        insertConvo.run({
          id: convo.id,
          sourceURL: convo.sourceURL,
          inboxID: inbox.id,
          messagesJSON: JSON.stringify(
            convo.messages.map((message) => {
              const mappedProviderID = providerIDMap.get(message.providerID);
              if (!mappedProviderID) {
                return message;
              }

              return {
                ...message,
                providerID: mappedProviderID,
              };
            }),
          ),
        });
      }
    }
  });

  transaction();
}
