import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import {
  GmailProvider,
  type GmailProviderIdentity,
} from '../../../../server/providers/gmail';
import { getProviderConfig } from '../../../../server/store';

export const GET: RequestHandler = ({ url }) => {
  const providerIDParam = url.searchParams.get('provider_id');
  if (!providerIDParam) {
    return json(
      { error: 'Query param "provider_id" is required.' },
      { status: 400 },
    );
  }

  const providerID = Number.parseInt(providerIDParam, 10);
  if (
    !Number.isInteger(providerID) ||
    providerID <= 0 ||
    providerIDParam !== providerID.toString()
  ) {
    return json(
      { error: 'Query param "provider_id" must be a positive integer.' },
      { status: 400 },
    );
  }

  const providerConfig = getProviderConfig(providerID);

  if (!providerConfig) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  if (providerConfig.type !== 'gmail') {
    return json(
      {
        error: `Provider "${providerConfig.id}" is type "${providerConfig.type}", not "gmail".`,
      },
      { status: 400 },
    );
  }

  const email = providerConfig.identity.email;
  if (typeof email !== 'string' || email.trim() === '') {
    return json(
      { error: 'Gmail provider identity.email is required.' },
      { status: 400 },
    );
  }

  const identity: GmailProviderIdentity = {
    ...providerConfig.identity,
    email: email.trim(),
  };
  const provider = new GmailProvider({ ...providerConfig, identity });

  const authURL = provider.authInitURL(identity, url.origin);

  return json({ url: authURL });
};
