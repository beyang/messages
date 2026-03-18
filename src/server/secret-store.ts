import type { SecretStore } from '../shared/types';
import { initializeDatabase } from './db';

export class SqliteSecretStore implements SecretStore {
  get(key: string): string | null {
    const database = initializeDatabase();
    const row = database
      .prepare('SELECT value FROM provider_secrets WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    const database = initializeDatabase();
    database
      .prepare(
        'INSERT INTO provider_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  delete(key: string): void {
    const database = initializeDatabase();
    database.prepare('DELETE FROM provider_secrets WHERE key = ?').run(key);
  }
}
