import type { RequestHandler } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

import { instantiateProvider } from '../../../../../server/providers';
import { exchangeSlackCode } from '../../../../../server/providers/slack';
import { SqliteSecretStore } from '../../../../../server/secret-store';
import { getInboxProviders, listInboxes } from '../../../../../server/store';

export const GET: RequestHandler = async ({ url }) => {
  const code = url.searchParams.get('code');
  const providerId = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`OAuth error: ${error}`)}`,
    );
  }
  if (!code || !providerId) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent('Missing "code" or "state" query param.')}`,
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
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent('Provider not found.')}`,
    );
  }

  if (providerConfig.type !== 'slack') {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`Provider "${providerConfig.id}" is type "${providerConfig.type}", not "slack".`)}`,
    );
  }

  const redirectUri = `${url.origin}/api/oauth/slack/callback`;
  const { accessToken } = await exchangeSlackCode(code, redirectUri);

  const secrets = new SqliteSecretStore();
  const provider = instantiateProvider(providerConfig);
  if (provider.handleAuthCallback) {
    provider.handleAuthCallback(accessToken, secrets);
  }

  redirect(303, '/admin?auth_success=Slack+OAuth+completed+successfully.');
};
