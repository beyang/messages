import { initializeDatabase } from '../db';

export function updateProviderSecretsValue(
  providerID: number,
  secretsValue: string,
): void {
  const database = initializeDatabase();
  const result = database
    .prepare('UPDATE providers SET secrets_value = ? WHERE id = ?')
    .run(secretsValue, providerID);
  if (result.changes === 0) {
    throw new Error(
      `Provider ${providerID} not found while saving provider secret.`,
    );
  }
}

export function getProviderSecretsValue(providerID: number): string {
  const database = initializeDatabase();
  const row = database
    .prepare('SELECT secrets_value AS secretsValue FROM providers WHERE id = ?')
    .get(providerID) as { secretsValue: string } | undefined;
  if (!row) {
    throw new Error(
      `Provider ${providerID} not found while loading provider secret.`,
    );
  }
  return row.secretsValue;
}
