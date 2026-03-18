import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'messages.sqlite3');

let database: Database.Database | null = null;

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
