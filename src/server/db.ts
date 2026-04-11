import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'messages.sqlite3');

let database: Database.Database | null = null;

function parseJSONObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function splitLegacyProviderArgs(
  type: string,
  args: unknown,
): { identity: Record<string, unknown>; query: Record<string, unknown> } {
  const argsObject = parseJSONObject(args);

  if (type === 'gmail') {
    const identity: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};

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

function splitQueryFromProviderIdentity(
  type: string,
  identity: unknown,
): { identity: Record<string, unknown>; query: Record<string, unknown> } {
  const identityObject = parseJSONObject(identity);

  if (type === 'gmail' || type === 'slack') {
    const { searchQuery, ...remainingIdentity } = identityObject;
    const query: Record<string, unknown> = {};

    if (searchQuery !== undefined) {
      query.searchQuery = searchQuery;
    }

    return { identity: remainingIdentity, query };
  }

  return { identity: identityObject, query: {} };
}

const BASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS inbox (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS convo (
    source_url TEXT PRIMARY KEY,
    inbox_id TEXT NOT NULL,
    messages_json TEXT NOT NULL,
    FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_convo_inbox_id ON convo (inbox_id);
`;

const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // Migration 1: add providers_json column to inbox, add id column to convo + messages
  (db) => {
    db.exec(`
      CREATE TABLE convo_new (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        inbox_id TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE
      );
    `);

    const rows = db
      .prepare('SELECT source_url, inbox_id, messages_json FROM convo')
      .all() as {
      source_url: string;
      inbox_id: string;
      messages_json: string;
    }[];

    const insert = db.prepare(
      'INSERT INTO convo_new (id, source_url, inbox_id, messages_json) VALUES (?, ?, ?, ?)',
    );

    for (const row of rows) {
      const convoId = crypto.randomUUID();
      let messages: unknown[];
      try {
        messages = JSON.parse(row.messages_json);
      } catch {
        messages = [];
      }
      const updated = (Array.isArray(messages) ? messages : []).map(
        (msg: unknown) => {
          const m = msg as Record<string, unknown>;
          return { id: crypto.randomUUID(), ...m };
        },
      );
      insert.run(
        convoId,
        row.source_url,
        row.inbox_id,
        JSON.stringify(updated),
      );
    }

    db.exec(`
      DROP TABLE convo;
      ALTER TABLE convo_new RENAME TO convo;
      CREATE INDEX IF NOT EXISTS idx_convo_inbox_id ON convo (inbox_id);

      ALTER TABLE inbox ADD COLUMN providers_json TEXT NOT NULL DEFAULT '[]';
    `);
  },
  // Migration 2: add provider_secrets table
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS provider_secrets (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  },
  // Migration 3: add providers table
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        secrets_value TEXT NOT NULL,
        type TEXT NOT NULL,
        identity TEXT NOT NULL DEFAULT '{}'
      );
    `);
  },
  // Migration 4: replace inbox.providers_json with inbox_providers join table
  (db) => {
    const legacyRows = db
      .prepare('SELECT id, providers_json AS providersJSON FROM inbox')
      .all() as { id: string; providersJSON: string }[];

    db.exec(`
      CREATE TABLE inbox_new (
        id TEXT PRIMARY KEY
      );

      INSERT INTO inbox_new (id)
      SELECT id FROM inbox;

      DROP TABLE inbox;
      ALTER TABLE inbox_new RENAME TO inbox;

      CREATE TABLE IF NOT EXISTS inbox_providers (
        inbox_id TEXT NOT NULL,
        provider_id INTEGER NOT NULL,
        query TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (inbox_id, provider_id),
        FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_inbox_id
      ON inbox_providers (inbox_id);

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_provider_id
      ON inbox_providers (provider_id);
    `);

    const findProviderByID = db.prepare(
      'SELECT id FROM providers WHERE id = ?',
    );
    const insertProvider = db.prepare(
      'INSERT INTO providers (secrets_value, type, identity) VALUES (?, ?, ?)',
    );
    const insertInboxProvider = db.prepare(
      'INSERT OR IGNORE INTO inbox_providers (inbox_id, provider_id, query) VALUES (?, ?, ?)',
    );

    for (const row of legacyRows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.providersJSON);
      } catch {
        parsed = [];
      }

      if (!Array.isArray(parsed)) {
        continue;
      }

      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const rawType = (entry as { type?: unknown }).type;
        if (typeof rawType !== 'string' || rawType.trim() === '') {
          continue;
        }

        const rawID = (entry as { id?: unknown }).id;
        let providerID: number | null = null;

        if (
          typeof rawID === 'number' &&
          Number.isInteger(rawID) &&
          rawID > 0 &&
          findProviderByID.get(rawID)
        ) {
          providerID = rawID;
        }

        if (
          providerID === null &&
          typeof rawID === 'string' &&
          /^\d+$/.test(rawID)
        ) {
          const parsedID = Number.parseInt(rawID, 10);
          if (findProviderByID.get(parsedID)) {
            providerID = parsedID;
          }
        }

        const rawArgs = (entry as { args?: unknown }).args;
        const split = splitLegacyProviderArgs(rawType.trim(), rawArgs);

        if (providerID === null) {
          const identity = split.identity;

          providerID = Number(
            insertProvider.run('', rawType.trim(), JSON.stringify(identity))
              .lastInsertRowid,
          );
        }

        insertInboxProvider.run(
          row.id,
          providerID,
          JSON.stringify(split.query),
        );
      }
    }
  },
  // Migration 5: ensure inbox_providers.query exists and backfill from provider identity where needed
  (db) => {
    const tableInfo = db
      .prepare("PRAGMA table_info('inbox_providers')")
      .all() as { name: string }[];
    const hasQueryColumn = tableInfo.some((column) => column.name === 'query');

    if (!hasQueryColumn) {
      db.exec(
        "ALTER TABLE inbox_providers ADD COLUMN query TEXT NOT NULL DEFAULT '{}'",
      );
    }

    const rows = db
      .prepare(
        `
          SELECT
            ip.inbox_id AS inboxID,
            ip.provider_id AS providerID,
            ip.query AS queryJSON,
            p.type AS type,
            p.identity AS identityJSON
          FROM inbox_providers ip
          JOIN providers p ON p.id = ip.provider_id
        `,
      )
      .all() as {
      inboxID: string;
      providerID: number;
      queryJSON: string;
      type: string;
      identityJSON: string;
    }[];

    const updateProviderIdentity = db.prepare(
      'UPDATE providers SET identity = ? WHERE id = ?',
    );
    const updateInboxProviderQuery = db.prepare(
      'UPDATE inbox_providers SET query = ? WHERE inbox_id = ? AND provider_id = ?',
    );

    for (const row of rows) {
      let currentIdentity: unknown;
      try {
        currentIdentity = JSON.parse(row.identityJSON);
      } catch {
        currentIdentity = {};
      }

      let currentQuery: unknown;
      try {
        currentQuery = JSON.parse(row.queryJSON);
      } catch {
        currentQuery = {};
      }

      const split = splitQueryFromProviderIdentity(row.type, currentIdentity);
      const normalizedQuery = parseJSONObject(currentQuery);
      const nextQuery =
        Object.keys(normalizedQuery).length > 0 ? normalizedQuery : split.query;

      if (JSON.stringify(split.identity) !== JSON.stringify(currentIdentity)) {
        updateProviderIdentity.run(
          JSON.stringify(split.identity),
          row.providerID,
        );
      }

      if (JSON.stringify(nextQuery) !== JSON.stringify(currentQuery)) {
        updateInboxProviderQuery.run(
          JSON.stringify(nextQuery),
          row.inboxID,
          row.providerID,
        );
      }
    }
  },
  // Migration 6: add row id to inbox_providers and allow multiple queries per inbox+provider
  (db) => {
    db.exec(`
      CREATE TABLE inbox_providers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inbox_id TEXT NOT NULL,
        provider_id INTEGER NOT NULL,
        query TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        UNIQUE (inbox_id, provider_id, query)
      );

      INSERT INTO inbox_providers_new (inbox_id, provider_id, query)
      SELECT inbox_id, provider_id, query
      FROM inbox_providers;

      DROP TABLE inbox_providers;
      ALTER TABLE inbox_providers_new RENAME TO inbox_providers;

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_inbox_id
      ON inbox_providers (inbox_id);

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_provider_id
      ON inbox_providers (provider_id);
    `);
  },
  // Migration 7: drop legacy provider_secrets table after moving secrets into providers.secrets_value
  (db) => {
    db.exec('DROP TABLE IF EXISTS provider_secrets;');
  },
  // Migration 8: migrate inbox to numeric id PK and keep legacy string id as display_name
  (db) => {
    db.exec(`
      CREATE TABLE inbox_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL UNIQUE
      );

      INSERT INTO inbox_new (display_name)
      SELECT id
      FROM inbox
      ORDER BY id;

      CREATE TABLE convo_new (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        inbox_id INTEGER NOT NULL,
        messages_json TEXT NOT NULL,
        FOREIGN KEY (inbox_id) REFERENCES inbox_new (id) ON DELETE CASCADE
      );

      INSERT INTO convo_new (id, source_url, inbox_id, messages_json)
      SELECT
        c.id,
        c.source_url,
        i.id,
        c.messages_json
      FROM convo c
      JOIN inbox_new i ON i.display_name = c.inbox_id;

      CREATE TABLE inbox_providers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inbox_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        query TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (inbox_id) REFERENCES inbox_new (id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        UNIQUE (inbox_id, provider_id, query)
      );

      INSERT INTO inbox_providers_new (id, inbox_id, provider_id, query)
      SELECT
        ip.id,
        i.id,
        ip.provider_id,
        ip.query
      FROM inbox_providers ip
      JOIN inbox_new i ON i.display_name = ip.inbox_id;

      DROP TABLE inbox_providers;
      DROP TABLE convo;
      DROP TABLE inbox;

      ALTER TABLE inbox_new RENAME TO inbox;
      ALTER TABLE convo_new RENAME TO convo;
      ALTER TABLE inbox_providers_new RENAME TO inbox_providers;

      CREATE INDEX IF NOT EXISTS idx_convo_inbox_id ON convo (inbox_id);

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_inbox_id
      ON inbox_providers (inbox_id);

      CREATE INDEX IF NOT EXISTS idx_inbox_providers_provider_id
      ON inbox_providers (provider_id);
    `);
  },
];

function runMigrations(db: Database.Database): void {
  const currentVersion = (
    db.pragma('user_version') as [{ user_version: number }]
  )[0].user_version;

  if (currentVersion >= MIGRATIONS.length) return;

  db.pragma('foreign_keys = OFF');
  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i](db);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  db.pragma('foreign_keys = ON');
}

export function applySchema(db: Database.Database): void {
  db.exec(BASE_SCHEMA_SQL);
  runMigrations(db);
}

export function getDatabasePath(): string {
  return DATABASE_PATH;
}

export function initializeDatabase(): Database.Database {
  if (database) {
    return database;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  database = new Database(DATABASE_PATH);
  database.pragma('foreign_keys = ON');
  applySchema(database);

  return database;
}

export function closeDatabase(): void {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
