import type { RequestHandler } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import {
  exchangeGmailCode,
  GmailProvider2,
  type GmailProvider2Identity,
  getGmailProfileEmail,
} from '../../../../../server/providers/gmail2';
import { getProviderConfig2 } from '../../../../../server/store';
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

  const providerConfig = getProviderConfig2(providerID);

  if (!providerConfig) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent('Provider not found.')}`,
    );
  }

  if (providerConfig.type !== 'gmail') {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`Provider "${providerConfig.id}" is type "${providerConfig.type}", not "gmail".`)}`,
    );
  }

  const redirectUri = `${url.origin}/api/oauth/gmail/callback`;

  const { refreshToken, accessToken } = await exchangeGmailCode(
    code,
    redirectUri,
  );

  const profileEmail = await getGmailProfileEmail(accessToken);
  const identityEmail = providerConfig.identity.email;
  if (
    typeof identityEmail === 'string' &&
    identityEmail.trim() !== '' &&
    profileEmail.toLowerCase() !== identityEmail.toLowerCase()
  ) {
    redirect(
      303,
      `/admin?auth_error=${encodeURIComponent(`Authorized account (${profileEmail}) does not match configured email (${identityEmail}).`)}`,
    );
  }

  const identity: GmailProvider2Identity = {
    ...providerConfig.identity,
    email:
      typeof identityEmail === 'string' && identityEmail.trim() !== ''
        ? identityEmail.trim()
        : profileEmail,
  };
  const provider = new GmailProvider2({ ...providerConfig, identity });

  if (provider.handleAuthCallback) {
    provider.handleAuthCallback(refreshToken);
  }

  redirect(303, '/admin?auth_success=Gmail+OAuth+completed+successfully.');
};
