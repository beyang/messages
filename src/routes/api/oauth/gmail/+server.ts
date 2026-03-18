import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { instantiateProvider } from '../../../../server/providers';
import { getInboxProviders, listInboxes } from '../../../../server/store';

export const GET: RequestHandler = ({ url }) => {
  const providerId = url.searchParams.get('provider_id');
  if (!providerId) {
    return json(
      { error: 'Query param "provider_id" is required.' },
      { status: 400 },
    );
  }

  const inboxes = listInboxes();
  let providerConfig = null;
  for (const inbox of inboxes) {
    const configs = getInboxProviders(inbox.id);
    providerConfig = configs.find((c) => c.id === providerId) ?? null;
    if (providerConfig) break;
  }

  if (!providerConfig) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  const provider = instantiateProvider(providerConfig);
  if (!provider.authInitURL) {
    return json({ error: 'Provider does not support OAuth.' }, { status: 400 });
  }

  const authURL = provider.authInitURL(providerConfig.args, url.origin);
  return json({ url: authURL });
};
