import type { RequestHandler } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { instantiateProvider } from '../../../../../server/providers';
import {
  exchangeGmailCode,
  getGmailProfileEmail,
} from '../../../../../server/providers/gmail';
import { SqliteSecretStore } from '../../../../../server/secret-store';
import { getInboxProviders, listInboxes } from '../../../../../server/store';
import type { GmailProviderArgs } from '../../../../../shared/gmail-types';
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

  const redirectUri = `${url.origin}/api/oauth/gmail/callback`;

  const { refreshToken, accessToken } = await exchangeGmailCode(
    code,
    redirectUri,
  );

  const args = providerConfig.args as GmailProviderArgs;
  const profileEmail = await getGmailProfileEmail(accessToken);
  if (args.email && profileEmail.toLowerCase() !== args.email.toLowerCase()) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`Authorized account (${profileEmail}) does not match configured email (${args.email}).`)}`,
    );
  }

  const secrets = new SqliteSecretStore();
  const provider = instantiateProvider(providerConfig);
  if (provider.handleAuthCallback) {
    provider.handleAuthCallback(refreshToken, secrets);
  }

  redirect(303, '/admin?auth_success=Gmail+OAuth+completed+successfully.');
};
