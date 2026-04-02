import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { refreshInbox } from '../../../../../server/actions/refresh-inbox';
import { SqliteSecretStore } from '../../../../../server/secret-store';
import { getInbox } from '../../../../../server/store';

export const POST: RequestHandler = async ({ params }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const secrets = new SqliteSecretStore();
  const result = await refreshInbox(params.id, secrets);
  return json({
    fetched: result.convos.length,
    convos: result.convos,
    needsAuth: result.needsAuth,
    errors: result.errors,
  });
};
