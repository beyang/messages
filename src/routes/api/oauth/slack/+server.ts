import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { getSlackConfig } from '../../../../server/slack-config';
import { getProviderConfig2 } from '../../../../server/store';

const SLACK_REDIRECT_PATH = '/api/oauth/slack/callback';
const SLACK_USER_SCOPES = 'search:read';

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

  const providerConfig = getProviderConfig2(providerID);

  if (!providerConfig) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  if (providerConfig.type !== 'slack') {
    return json(
      {
        error: `Provider "${providerConfig.id}" is type "${providerConfig.type}", not "slack".`,
      },
      { status: 400 },
    );
  }

  const creds = getSlackConfig();
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: `${url.origin}${SLACK_REDIRECT_PATH}`,
    user_scope: SLACK_USER_SCOPES,
    state: providerConfig.id.toString(),
  });
  const authURL = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

  return json({ url: authURL });
};
