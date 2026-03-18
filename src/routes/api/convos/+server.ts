import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { getConvo } from '../../../server/store';

export const GET: RequestHandler = ({ url }) => {
  const sourceURL = url.searchParams.get('sourceURL');
  if (!sourceURL || sourceURL.trim() === '') {
    return json(
      { error: 'Query parameter sourceURL is required.' },
      { status: 400 },
    );
  }

  const convo = getConvo(sourceURL);
  if (!convo) {
    return json({ error: 'Conversation not found.' }, { status: 404 });
  }

  return json(convo);
};
