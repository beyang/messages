import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
  createProviderConfig,
  deleteProviderConfig,
  getInbox,
  updateProviderConfig,
} from '../../../../../server/store';
import type { InboxProviderConfig } from '../../../../../shared/types';

export const POST: RequestHandler = async ({ params, request }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const body = await request.json();
  const { id, type, args } = body as {
    id?: string;
    type?: string;
    args?: unknown;
  };

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return json({ error: 'Field "id" is required.' }, { status: 400 });
  }
  if (!type || typeof type !== 'string' || type.trim() === '') {
    return json({ error: 'Field "type" is required.' }, { status: 400 });
  }

  const config = createProviderConfig(params.id, {
    id: id.trim(),
    type: type.trim(),
    args: (args ?? null) as InboxProviderConfig['args'],
  });

  return json(config, { status: 201 });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const body = await request.json();
  const { id, type, args } = body as {
    id?: string;
    type?: string;
    args?: unknown;
  };

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return json({ error: 'Field "id" is required.' }, { status: 400 });
  }

  const updated = updateProviderConfig(params.id, id.trim(), {
    type: type?.trim(),
    args: args as InboxProviderConfig['args'] | undefined,
  });

  if (!updated) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, request }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const body = await request.json();
  const { id } = body as { id?: string };

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return json({ error: 'Field "id" is required.' }, { status: 400 });
  }

  const deleted = deleteProviderConfig(params.id, id.trim());
  if (!deleted) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  return json({ ok: true });
};
