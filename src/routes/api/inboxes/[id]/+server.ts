import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { getInbox } from '../../../../server/store';

export const GET: RequestHandler = ({ params }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  return json(inbox);
};
