import { env } from '$env/dynamic/private';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
}

export function getGmailConfig(): GmailConfig {
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env',
    );
  }
  return { clientId, clientSecret };
}
