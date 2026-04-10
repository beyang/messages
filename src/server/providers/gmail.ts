import type { GmailProviderArgs } from '../../shared/gmail-types';
import type {
  Author,
  Convo,
  FetchConvosResult,
  Provider,
  ProviderConfig,
  SecretStore,
} from '../../shared/types';
import { getGmailConfig } from '../gmail-config';

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
  headers?: { name: string; value: string }[];
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

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    );
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractByMimeType(part: GmailMessagePart, mimeType: string): string {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractByMimeType(child, mimeType);
      if (text) return text;
    }
  }
  return '';
}

function extractMessageContent(part: GmailMessagePart): string {
  const plainText = extractByMimeType(part, 'text/plain');
  if (plainText) {
    return plainText;
  }

  const html = extractByMimeType(part, 'text/html');
  if (html) {
    return htmlToText(html);
  }

  return '';
}

function parseFromHeader(from: string): Author {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { username: match[2], displayName: match[1].replace(/^"|"$/g, '') };
  }
  return { username: from };
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
    const creds = getGmailConfig();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: `${baseURL}${GMAIL_REDIRECT_PATH}`,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: this.id,
    });
    if (args.email) {
      params.set('login_hint', args.email);
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  handleAuthCallback(refreshToken: string, secrets: SecretStore): void {
    secrets.set(gmailRefreshTokenKey(this.id), refreshToken);
  }

  private async getAccessToken(refreshToken: string): Promise<string> {
    const creds = getGmailConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
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

    const accessToken = await this.getAccessToken(refreshToken);

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
          messages: thread.messages.map((msg) => {
            const subject = msg.payload.headers?.find(
              (h) => h.name.toLowerCase() === 'subject',
            )?.value;
            const from = msg.payload.headers?.find(
              (h) => h.name.toLowerCase() === 'from',
            )?.value;
            return {
              id: msg.id,
              sourceURL: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
              providerID: this.id,
              content: extractMessageContent(msg.payload),
              ...(subject ? { subject } : {}),
              ...(from ? { author: parseFromHeader(from) } : {}),
            };
          }),
        };
      }),
    );

    return { convos };
  }

  async setStar(
    _args: GmailProviderArgs,
    _secrets: SecretStore,
    _messageSourceURL: string,
    _starred: boolean,
  ): Promise<void> {}
}

interface GmailTokenExchangeResult {
  refreshToken: string;
  accessToken: string;
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string,
): Promise<GmailTokenExchangeResult> {
  const creds = getGmailConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
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
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}

export async function getGmailProfileEmail(
  accessToken: string,
): Promise<string> {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Gmail profile: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { emailAddress: string };
  return data.emailAddress;
}
