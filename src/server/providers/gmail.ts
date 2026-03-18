import type { GmailProviderArgs } from '../../shared/gmail-types';
import type {
  Convo,
  FetchConvosResult,
  Provider,
  ProviderConfig,
  SecretStore,
} from '../../shared/types';

const GMAIL_REDIRECT_PATH = '/api/oauth/gmail/callback';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

interface GmailTokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
}

interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  payload: GmailMessagePart;
}

interface GmailThreadResponse {
  id: string;
  messages: GmailMessageResponse[];
}

function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf-8');
}

function extractPlainText(part: GmailMessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractPlainText(child);
      if (text) return text;
    }
  }
  return '';
}

function gmailRefreshTokenKey(providerId: string): string {
  return `gmail:${providerId}:refresh_token`;
}

export class GmailProvider implements Provider<GmailProviderArgs> {
  type: string;
  id: string;

  constructor(config: ProviderConfig<GmailProviderArgs>) {
    this.type = config.type;
    this.id = config.id;
  }

  authInitURL(args: GmailProviderArgs, baseURL: string): string {
    const params = new URLSearchParams({
      client_id: args.credentials.clientId,
      redirect_uri: `${baseURL}${GMAIL_REDIRECT_PATH}`,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: this.id,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  handleAuthCallback(refreshToken: string, secrets: SecretStore): void {
    secrets.set(gmailRefreshTokenKey(this.id), refreshToken);
  }

  private async getAccessToken(
    credentials: GmailProviderArgs['credentials'],
    refreshToken: string,
  ): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to refresh Gmail access token: ${res.status} ${await res.text()}`,
      );
    }
    const data = (await res.json()) as GmailTokenResponse;
    return data.access_token;
  }

  private async gmailGet<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(
        `Gmail API error (${path}): ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async fetchConvos(
    args: GmailProviderArgs,
    secrets: SecretStore,
  ): Promise<FetchConvosResult> {
    const refreshToken = secrets.get(gmailRefreshTokenKey(this.id));
    if (!refreshToken) {
      return {
        convos: [],
        needsAuth: {
          url: `/api/oauth/gmail?provider_id=${encodeURIComponent(this.id)}`,
        },
      };
    }

    const accessToken = await this.getAccessToken(
      args.credentials,
      refreshToken,
    );

    const listData = await this.gmailGet<GmailListResponse>(
      accessToken,
      `messages?q=${encodeURIComponent(args.searchQuery)}&maxResults=50`,
    );
    if (!listData.messages?.length) return { convos: [] };

    const threadIds = [...new Set(listData.messages.map((m) => m.threadId))];

    const convos: Convo[] = await Promise.all(
      threadIds.map(async (threadId) => {
        const thread = await this.gmailGet<GmailThreadResponse>(
          accessToken,
          `threads/${threadId}?format=full`,
        );
        return {
          id: `gmail-${threadId}`,
          sourceURL: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
          messages: thread.messages.map((msg) => ({
            id: msg.id,
            sourceURL: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
            content: extractPlainText(msg.payload),
          })),
        };
      }),
    );

    return { convos };
  }
}

export async function exchangeGmailCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to exchange Gmail auth code: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as GmailTokenResponse;
  if (!data.refresh_token) {
    throw new Error('No refresh_token returned from token exchange');
  }
  return data.refresh_token;
}
