import { env } from '$env/dynamic/private';

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
}

export function getSlackConfig(): SlackConfig {
  const clientId = env.SLACK_CLIENT_ID;
  const clientSecret = env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set in .env',
    );
  }
  return { clientId, clientSecret };
}
