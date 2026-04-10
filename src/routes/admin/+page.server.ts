import { fail } from '@sveltejs/kit';
import { initializeDatabase } from '../../server/db';
import {
  createInbox,
  createProviderConfig2,
  deleteInbox,
  getInboxProviders2,
  listInboxes,
  listProviderConfigs2,
  setInboxProviderAssociations,
} from '../../server/store';
import { providerIdentitySchema } from '../../shared/types';
import type { Actions, PageServerLoad } from './$types';

interface TablePage {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  primaryKey: string;
}

function isInboxAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return (
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    error.message.includes('UNIQUE constraint failed: inbox.id')
  );
}

const ALLOWED_TABLES = new Set([
  'inbox',
  'inbox_providers',
  'convo',
  'provider_secrets',
  'providers',
]);

function getTablePrimaryKey(
  db: ReturnType<typeof initializeDatabase>,
  tableName: string,
): string {
  const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string;
    pk: number;
  }[];
  const pkCol = info.find((c) => c.pk === 1);
  return pkCol?.name ?? 'id';
}

function queryTable(
  tableName: string,
  page: number,
  pageSize: number,
): TablePage {
  const db = initializeDatabase();

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`)
    .get() as { cnt: number };
  const total = countRow.cnt;

  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`)
    .all(pageSize, offset) as Record<string, unknown>[];

  const columns =
    rows.length > 0
      ? Object.keys(rows[0])
      : (
          db.prepare(`PRAGMA table_info(${tableName})`).all() as {
            name: string;
          }[]
        ).map((c) => c.name);

  const primaryKey = getTablePrimaryKey(db, tableName);

  return { columns, rows, total, page, pageSize, primaryKey };
}

export const load: PageServerLoad = ({ url }) => {
  const pageSize = 20;

  const tables = [
    'inbox',
    'inbox_providers',
    'convo',
    'provider_secrets',
    'providers',
  ] as const;
  const data: Record<string, TablePage> = {};

  for (const table of tables) {
    const page = Number(url.searchParams.get(`${table}_page`) ?? '1');
    data[table] = queryTable(table, Math.max(1, page), pageSize);
  }

  const inboxes = listInboxes();

  const authProviders = listProviderConfigs2().map((provider) => ({
    id: provider.id,
    type: provider.type,
    identityJSON: JSON.stringify(provider.identity),
  }));

  const inboxProviderAssignments = inboxes.map((inbox) => ({
    inboxID: inbox.id,
    providerIDs: getInboxProviders2(inbox.id).map((provider) => provider.id),
  }));

  const authError = url.searchParams.get('auth_error') ?? null;
  const authSuccess = url.searchParams.get('auth_success') ?? null;

  return {
    tables: data,
    inboxIDs: inboxes.map((inbox) => inbox.id),
    inboxProviderAssignments,
    authProviders,
    authError,
    authSuccess,
  };
};

export const actions: Actions = {
  addProvider: async ({ request }) => {
    const form = await request.formData();
    const type = form.get('type') as string | null;
    const identityJson = form.get('identity') as string | null;

    if (!type?.trim()) return fail(400, { error: 'Type is required.' });

    let parsedIdentity: unknown = {};
    if (identityJson?.trim()) {
      try {
        parsedIdentity = JSON.parse(identityJson);
      } catch {
        return fail(400, { error: 'Identity must be valid JSON.' });
      }
    }

    const identityResult = providerIdentitySchema.safeParse(parsedIdentity);
    if (!identityResult.success) {
      return fail(400, { error: 'Identity must be a JSON object.' });
    }

    const trimmedType = type.trim();
    const identity = { ...identityResult.data };

    if (trimmedType === 'gmail') {
      const email = identity.email;
      if (typeof email !== 'string' || email.trim() === '') {
        return fail(400, { error: 'Gmail identity.email is required.' });
      }
      identity.email = email.trim();
    }

    const provider = createProviderConfig2({
      type: trimmedType,
      secretsValue: '',
      identity,
    });

    return { success: `Provider added (id=${provider.id}).` };
  },
  addInbox: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('inboxId') as string | null;

    if (!id?.trim()) return fail(400, { error: 'Inbox ID is required.' });

    try {
      createInbox(id.trim());
    } catch (error) {
      if (isInboxAlreadyExistsError(error)) {
        return fail(400, { error: 'Inbox already exists.' });
      }

      return fail(500, { error: 'Failed to create inbox.' });
    }

    return { success: 'Inbox added.' };
  },
  deleteInbox: async ({ request }) => {
    const form = await request.formData();
    const id = form.get('inboxId') as string | null;

    if (!id?.trim()) return fail(400, { error: 'Inbox ID is required.' });

    const deleted = deleteInbox(id.trim());
    if (!deleted) return fail(404, { error: 'Inbox not found.' });

    return { success: 'Inbox deleted.' };
  },
  setInboxProviders: async ({ request }) => {
    const form = await request.formData();
    const inboxID = form.get('inboxId') as string | null;
    const rawProviderIDs = form.getAll('providerIDs');

    if (!inboxID?.trim()) {
      return fail(400, { error: 'Inbox ID is required.' });
    }

    const providerIDs: number[] = [];
    for (const rawProviderID of rawProviderIDs) {
      if (typeof rawProviderID !== 'string') {
        return fail(400, { error: 'Provider IDs must be strings.' });
      }

      const trimmed = rawProviderID.trim();
      if (!/^\d+$/.test(trimmed)) {
        return fail(400, { error: 'Provider IDs must be positive integers.' });
      }

      providerIDs.push(Number.parseInt(trimmed, 10));
    }

    try {
      setInboxProviderAssociations(inboxID.trim(), providerIDs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('failed to set inbox providers', {
        inboxID: inboxID.trim(),
        providerIDs,
        error,
      });
      if (
        message === 'Inbox not found.' ||
        message === 'One or more providers were not found.' ||
        message === 'Provider IDs must be positive integers.'
      ) {
        return fail(400, { error: message });
      }

      return fail(500, {
        error: `Failed to set inbox providers: ${message}`,
      });
    }

    return { success: 'Inbox providers updated.' };
  },
  updateCell: async ({ request }) => {
    const form = await request.formData();
    const tableName = form.get('tableName') as string | null;
    const pkValue = form.get('pkValue') as string | null;
    const column = form.get('column') as string | null;
    const value = form.get('value') as string | null;

    if (!tableName?.trim())
      return fail(400, { error: 'Table name is required.' });
    if (!ALLOWED_TABLES.has(tableName.trim()))
      return fail(400, { error: 'Invalid table name.' });
    if (pkValue === null || pkValue === undefined)
      return fail(400, { error: 'Primary key value is required.' });
    if (!column?.trim())
      return fail(400, { error: 'Column name is required.' });

    const db = initializeDatabase();
    const table = tableName.trim();
    const col = column.trim();

    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
      pk: number;
    }[];
    const validColumns = tableInfo.map((c) => c.name);
    if (!validColumns.includes(col))
      return fail(400, { error: `Invalid column: ${col}` });

    const pk = getTablePrimaryKey(db, table);

    db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${pk} = ?`).run(
      value,
      pkValue,
    );

    return { success: `Updated ${table}.${col}.` };
  },
};
