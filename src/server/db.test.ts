import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applySchema } from './db';

describe('database migrations', () => {
  it('migrates inbox string ids to display_name with numeric foreign keys', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE inbox (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE convo (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        inbox_id TEXT NOT NULL,
        messages_json TEXT NOT NULL,
        FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE
      );

      CREATE INDEX idx_convo_inbox_id ON convo (inbox_id);

      CREATE TABLE providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        secrets_value TEXT NOT NULL,
        type TEXT NOT NULL,
        identity TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE inbox_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inbox_id TEXT NOT NULL,
        provider_id INTEGER NOT NULL,
        query TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (inbox_id) REFERENCES inbox (id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
        UNIQUE (inbox_id, provider_id, query)
      );

      CREATE INDEX idx_inbox_providers_inbox_id ON inbox_providers (inbox_id);
      CREATE INDEX idx_inbox_providers_provider_id ON inbox_providers (provider_id);

      PRAGMA user_version = 7;
    `);

    db.exec(`
      INSERT INTO inbox (id) VALUES ('beta');
      INSERT INTO inbox (id) VALUES ('alpha');
      INSERT INTO providers (secrets_value, type, identity)
      VALUES ('', 'dummy', '{}');
      INSERT INTO convo (id, source_url, inbox_id, messages_json)
      VALUES ('convo-1', 'https://example.com/convo-1', 'beta', '[]');
      INSERT INTO inbox_providers (inbox_id, provider_id, query)
      VALUES ('alpha', 1, '{"searchQuery":"is:unread"}');
    `);

    applySchema(db);

    const inboxRows = db
      .prepare('SELECT id, display_name AS displayName FROM inbox ORDER BY id')
      .all() as { id: number; displayName: string }[];
    expect(inboxRows).toEqual([
      { id: 1, displayName: 'alpha' },
      { id: 2, displayName: 'beta' },
    ]);

    const convoRow = db
      .prepare('SELECT inbox_id AS inboxID FROM convo WHERE id = ?')
      .get('convo-1') as { inboxID: number };
    expect(convoRow.inboxID).toBe(2);

    const inboxProviderRow = db
      .prepare('SELECT inbox_id AS inboxID FROM inbox_providers WHERE id = 1')
      .get() as { inboxID: number };
    expect(inboxProviderRow.inboxID).toBe(1);

    db.prepare('DELETE FROM inbox WHERE display_name = ?').run('beta');
    const convoCount = db
      .prepare('SELECT COUNT(*) AS count FROM convo')
      .get() as { count: number };
    expect(convoCount.count).toBe(0);

    db.close();
  });
});
