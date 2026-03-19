import { fail } from '@sveltejs/kit';
import { initializeDatabase } from '../../server/db';
import {
  createInbox,
  createProviderConfig,
  deleteInbox,
} from '../../server/store';
import type { ProviderConfig } from '../../shared/types';
import type { Actions, PageServerLoad } from './$types';

interface TablePage {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
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

  return { columns, rows, total, page, pageSize };
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

  return { tables: data, inboxIds: inboxes };
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
};
