import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { parsePositiveInteger } from '../../../../../server/parse';
import { clearInbox, getInbox } from '../../../../../server/store';

export const POST: RequestHandler = ({ params }) => {
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

  const deleted = clearInbox(inboxID);
  return json({ deleted });
};
