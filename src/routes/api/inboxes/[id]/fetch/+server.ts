import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { refreshInbox } from '../../../../../server/actions/refresh-inbox';
import { parsePositiveInteger } from '../../../../../server/parse';
import { getInbox } from '../../../../../server/store';

export const POST: RequestHandler = async ({ params }) => {
  const inboxID = parsePositiveInteger(params.id);
  if (inboxID === null) {
    return json(
      { error: 'Inbox ID must be a positive integer.' },
      { status: 400 },
    );
  }

  const inbox = getInbox(inboxID);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const result = await refreshInbox(inboxID);
  return json({
    fetched: result.convos.length,
    convos: result.convos,
    needsAuth: result.needsAuth,
    errors: result.errors,
  });
};
