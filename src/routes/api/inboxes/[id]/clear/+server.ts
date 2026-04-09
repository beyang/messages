import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { clearInbox, getInbox } from '../../../../../server/store';

export const POST: RequestHandler = ({ params }) => {
  const inbox = getInbox(params.id);
  if (!inbox) {
    return json({ error: 'Inbox not found.' }, { status: 404 });
  }

  const deleted = clearInbox(params.id);
  return json({ deleted });
};
