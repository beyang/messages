import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { refreshInbox } from '../../../../../server/actions/refresh-inbox';
import { getInbox } from '../../../../../server/store';

export const POST: RequestHandler = ({ params }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const convos = refreshInbox(params.id);
  return json({ fetched: convos.length, convos });
};
