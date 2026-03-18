import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { instantiateProvider } from '../../../../../server/providers';
import { exchangeGmailCode } from '../../../../../server/providers/gmail';
import { SqliteSecretStore } from '../../../../../server/secret-store';
import { getInboxProviders, listInboxes } from '../../../../../server/store';
import type { GmailProviderArgs } from '../../../../../shared/gmail-types';

export const GET: RequestHandler = async ({ url }) => {
  const code = url.searchParams.get('code');
  const providerId = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return json({ error: `OAuth error: ${error}` }, { status: 400 });
  }
  if (!code || !providerId) {
    return json(
      { error: 'Missing "code" or "state" query param.' },
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

  const args = providerConfig.args as GmailProviderArgs;
  const redirectUri = `${url.origin}/api/oauth/gmail/callback`;

  const refreshToken = await exchangeGmailCode(
    args.credentials.clientId,
    args.credentials.clientSecret,
    code,
    redirectUri,
  );

  const secrets = new SqliteSecretStore();
  const provider = instantiateProvider(providerConfig);
  if (provider.handleAuthCallback) {
    provider.handleAuthCallback(refreshToken, secrets);
  }

  return json({ ok: true, message: 'Gmail OAuth completed successfully.' });
};
