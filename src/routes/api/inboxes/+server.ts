import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

import { listInboxes } from '../../../server/store';

export const GET: RequestHandler = () => {
  return json(listInboxes());
};
