import { fail } from '@sveltejs/kit';
import { initializeDatabase } from '../../server/db';
import {
  createInbox,
  createProviderConfig,
  deleteInbox,
  listInboxes,
} from '../../server/store';
import type { ProviderConfig } from '../../shared/types';
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

const ALLOWED_TABLES = new Set(['inbox', 'convo', 'provider_secrets']);

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

  const tables = ['inbox', 'convo', 'provider_secrets'] as const;
  const data: Record<string, TablePage> = {};

  for (const table of tables) {
    const page = Number(url.searchParams.get(`${table}_page`) ?? '1');
    data[table] = queryTable(table, Math.max(1, page), pageSize);
  }

  const db = initializeDatabase();
  const inboxes = (
    db.prepare('SELECT id FROM inbox ORDER BY id').all() as { id: string }[]
  ).map((r) => r.id);

  const inboxProviders = listInboxes().map((inbox) => ({
    inboxId: inbox.id,
    providers: inbox.providers.map((p) => ({ id: p.id, type: p.type })),
  }));

  const authError = url.searchParams.get('auth_error') ?? null;
  const authSuccess = url.searchParams.get('auth_success') ?? null;

  return {
    tables: data,
    inboxIds: inboxes,
    inboxProviders,
    authError,
    authSuccess,
  };
};

export const actions: Actions = {
  addProvider: async ({ request }) => {
    const form = await request.formData();
    const inboxId = form.get('inboxId') as string | null;
    const providerId = form.get('providerId') as string | null;
    const type = form.get('type') as string | null;
    const argsJson = form.get('args') as string | null;

    if (!inboxId?.trim()) return fail(400, { error: 'Inbox ID is required.' });
    if (!providerId?.trim())
      return fail(400, { error: 'Provider ID is required.' });
    if (!type?.trim()) return fail(400, { error: 'Type is required.' });

    let args: ProviderConfig['args'] = null;
    if (argsJson?.trim()) {
      try {
        args = JSON.parse(argsJson) as ProviderConfig['args'];
      } catch {
        return fail(400, { error: 'Args must be valid JSON.' });
      }
    }

    createProviderConfig(inboxId.trim(), {
      id: providerId.trim(),
      type: type.trim(),
      args,
    });

    return { success: 'Provider added.' };
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
