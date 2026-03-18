import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATABASE_PATH = path.join(DATA_DIR, 'messages.sqlite3');

let database: Database.Database | null = null;

export const SCHEMA_SQL = `
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
  database.exec(SCHEMA_SQL);

  return database;
}

export function closeDatabase(): void {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
