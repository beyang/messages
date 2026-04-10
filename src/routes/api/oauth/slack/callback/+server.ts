import type { RequestHandler } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { updateProviderSecretsValue } from '../../../../../server/providers/secrets';
import { exchangeSlackCode } from '../../../../../server/providers/slack';
import { getProviderConfig } from '../../../../../server/store';

export const GET: RequestHandler = async ({ url }) => {
  const code = url.searchParams.get('code');
  const providerIDParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`OAuth error: ${error}`)}`,
    );
  }
  if (!code || !providerIDParam) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent('Missing "code" or "state" query param.')}`,
    );
  }

  const providerID = Number.parseInt(providerIDParam, 10);
  if (
    !Number.isInteger(providerID) ||
    providerID <= 0 ||
    providerIDParam !== providerID.toString()
  ) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent('Invalid provider id.')}`,
    );
  }

  const providerConfig = getProviderConfig(providerID);

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

  updateProviderSecretsValue(providerConfig.id, accessToken);

  redirect(303, '/admin?auth_success=Slack+OAuth+completed+successfully.');
};
