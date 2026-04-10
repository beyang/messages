import type {
  Author,
  Convo,
  FetchConvosResult,
  Provider,
  ProviderConfig,
  ProviderIdentity,
} from '../../shared/types';
import { getGmailConfig } from '../gmail-config';
import { getProviderSecretsValue, updateProviderSecretsValue } from './secrets';

const GMAIL_REDIRECT_PATH = '/api/oauth/gmail/callback';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

export interface GmailProviderIdentity extends ProviderIdentity {
  email: string;
}

export interface GmailProviderQuery extends ProviderIdentity {
  searchQuery: string;
}

interface GmailTokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  body?: { data?: string };
  headers?: GmailHeader[];
  parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
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

function getHeaderValue(
  headers: GmailHeader[] | undefined,
  name: string,
): string | undefined {
  const targetName = name.toLowerCase();
  return headers?.find((header) => header.name.toLowerCase() === targetName)
    ?.value;
}

function getHeaderValues(
  headers: GmailHeader[] | undefined,
  name: string,
): string[] {
  const targetName = name.toLowerCase();
  return (headers ?? [])
    .filter((header) => header.name.toLowerCase() === targetName)
    .map((header) => header.value);
}

function sanitizeMailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function getSanitizedHeaderValue(
  headers: GmailHeader[] | undefined,
  name: string,
): string | undefined {
  const value = getHeaderValue(headers, name);
  if (!value) {
    return undefined;
  }
  const sanitized = sanitizeMailHeaderValue(value);
  return sanitized.length > 0 ? sanitized : undefined;
}

function normalizeAuthenticatedDomain(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = sanitizeMailHeaderValue(value)
    .replace(/^<|>$/g, '')
    .replace(/^"|"$/g, '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const withoutLeadingAt = normalized.startsWith('@')
    ? normalized.slice(1)
    : normalized;
  const atIndex = withoutLeadingAt.lastIndexOf('@');
  return atIndex >= 0 ? withoutLeadingAt.slice(atIndex + 1) : withoutLeadingAt;
}

export function extractMailedByFromAuthenticationResults(
  headers: GmailHeader[] | undefined,
): string | undefined {
  const authenticationResults = getHeaderValues(
    headers,
    'authentication-results',
  )
    .map((value) => sanitizeMailHeaderValue(value))
    .filter((value) => value.length > 0);

  for (const result of authenticationResults) {
    const spfPassClauses = result.match(/\bspf=pass\b[^;]*/gi) ?? [];
    for (const clause of spfPassClauses) {
      const smtpMailFrom = clause.match(/\bsmtp\.mailfrom=([^\s;]+)/i)?.[1];
      const smtpFrom = clause.match(/\bsmtp\.from=([^\s;]+)/i)?.[1];
      const mailedByDomain = normalizeAuthenticatedDomain(
        smtpMailFrom ?? smtpFrom,
      );
      if (mailedByDomain) {
        return mailedByDomain;
      }
    }
  }

  return undefined;
}

export function extractSignedByFromAuthenticationResults(
  headers: GmailHeader[] | undefined,
): string | undefined {
  const authenticationResults = getHeaderValues(
    headers,
    'authentication-results',
  )
    .map((value) => sanitizeMailHeaderValue(value))
    .filter((value) => value.length > 0);

  for (const result of authenticationResults) {
    const dkimPassClauses = result.match(/\bdkim=pass\b[^;]*/gi) ?? [];
    for (const clause of dkimPassClauses) {
      const headerIdentity = clause.match(/\bheader\.i=([^\s;]+)/i)?.[1];
      const headerDomain = clause.match(/\bheader\.d=([^\s;]+)/i)?.[1];
      const signedByDomain = normalizeAuthenticatedDomain(
        headerIdentity ?? headerDomain,
      );
      if (signedByDomain) {
        return signedByDomain;
      }
    }
  }

  return undefined;
}

function buildGmailMessageMetadata(
  headers: GmailHeader[] | undefined,
): string | undefined {
  const mailedBy = extractMailedByFromAuthenticationResults(headers);
  const signedBy = extractSignedByFromAuthenticationResults(headers);
  const metadataFields: Array<[string, string | undefined]> = [
    ['to', getSanitizedHeaderValue(headers, 'to')],
    ['subject', getSanitizedHeaderValue(headers, 'subject')],
    ['reply-to', getSanitizedHeaderValue(headers, 'reply-to')],
    ['mailed-by', mailedBy],
    ['signed-by', signedBy],
  ];

  const lines = metadataFields.flatMap(([name, value]) =>
    value ? [`${name}: ${value}`] : [],
  );
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function parseGmailInternalDate(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMessageIDFromSourceURL(sourceURL: string): string {
  try {
    const url = new URL(sourceURL);
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParts = hash.split('/').filter((part) => part.length > 0);
    const hashID = hashParts.at(-1);
    if (hashID) {
      return decodeURIComponent(hashID);
    }
  } catch {
    // Fall back to a best-effort parse below.
  }

  const pathID = sourceURL
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .at(-1);

  if (pathID) {
    return decodeURIComponent(pathID);
  }

  throw new Error(`Invalid Gmail message source URL: ${sourceURL}`);
}

export class GmailProvider
  implements Provider<GmailProviderIdentity, GmailProviderQuery>
{
  type: string;
  id: number;

  constructor(config: ProviderConfig<GmailProviderIdentity>) {
    this.type = config.type;
    this.id = config.id;
  }

  authInitURL(identity: GmailProviderIdentity, baseURL: string): string {
    const creds = getGmailConfig();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: `${baseURL}${GMAIL_REDIRECT_PATH}`,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: this.id.toString(),
    });
    if (identity.email) {
      params.set('login_hint', identity.email);
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  handleAuthCallback(refreshToken: string): void {
    updateProviderSecretsValue(this.id, refreshToken);
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

  private async gmailPost(
    path: string,
    accessToken: string,
    body: unknown,
  ): Promise<void> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Gmail API error (${path}): ${res.status} ${await res.text()}`,
      );
    }
  }

  async fetchConvos(
    identity: GmailProviderIdentity,
    query: GmailProviderQuery,
  ): Promise<FetchConvosResult> {
    const refreshToken = getProviderSecretsValue(this.id).trim();
    if (!refreshToken) {
      return {
        convos: [],
        needsAuth: {
          url: `/api/oauth/gmail?provider_id=${encodeURIComponent(this.id.toString())}`,
        },
      };
    }

    const searchQuery = query.searchQuery?.trim();
    if (!searchQuery) {
      throw new Error('Gmail provider query.searchQuery is required.');
    }

    const identityEmail =
      typeof identity.email === 'string' ? identity.email.trim() : '';
    const gmailInboxURLPrefix =
      identityEmail.length > 0
        ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(identityEmail)}#inbox/`
        : 'https://mail.google.com/mail/#inbox/';

    const accessToken = await this.getAccessToken(refreshToken);

    const listData = await this.gmailGet<GmailListResponse>(
      accessToken,
      `messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`,
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
          sourceURL: `${gmailInboxURLPrefix}${threadId}`,
          messages: thread.messages.map((msg) => {
            const subject = getSanitizedHeaderValue(
              msg.payload.headers,
              'subject',
            );
            const from = getSanitizedHeaderValue(msg.payload.headers, 'from');
            const metadata = buildGmailMessageMetadata(msg.payload.headers);
            const timestamp = parseGmailInternalDate(msg.internalDate);
            return {
              id: msg.id,
              sourceURL: `${gmailInboxURLPrefix}${msg.id}`,
              providerID: this.id.toString(),
              hasStar: msg.labelIds?.includes('STARRED') ?? false,
              isArchived: !(msg.labelIds?.includes('INBOX') ?? false),
              content: extractMessageContent(msg.payload),
              ...(timestamp !== undefined ? { timestamp } : {}),
              ...(subject ? { subject } : {}),
              ...(metadata ? { metadata } : {}),
              ...(from ? { author: parseFromHeader(from) } : {}),
            };
          }),
        };
      }),
    );

    return { convos };
  }

  async setStar(
    _identity: GmailProviderIdentity,
    messageSourceURL: string,
    starred: boolean,
  ): Promise<void> {
    const refreshToken = getProviderSecretsValue(this.id).trim();
    if (!refreshToken) {
      throw new Error(
        `Missing Gmail refresh token for provider "${this.id}". Re-authorize this provider.`,
      );
    }

    const messageID = parseMessageIDFromSourceURL(messageSourceURL);
    const accessToken = await this.getAccessToken(refreshToken);

    await this.gmailPost(
      `messages/${encodeURIComponent(messageID)}/modify`,
      accessToken,
      {
        addLabelIds: starred ? ['STARRED'] : [],
        removeLabelIds: starred ? [] : ['STARRED'],
      },
    );
  }

  async setArchived(
    _identity: GmailProviderIdentity,
    messageSourceURL: string,
    archived: boolean,
  ): Promise<void> {
    const refreshToken = getProviderSecretsValue(this.id).trim();
    if (!refreshToken) {
      throw new Error(
        `Missing Gmail refresh token for provider "${this.id}". Re-authorize this provider.`,
      );
    }

    const messageID = parseMessageIDFromSourceURL(messageSourceURL);
    const accessToken = await this.getAccessToken(refreshToken);

    // Get the message to find its threadId, since archiving is a thread-level operation
    const message = await this.gmailGet<GmailMessageResponse>(
      accessToken,
      `messages/${encodeURIComponent(messageID)}?format=minimal`,
    );

    await this.gmailPost(
      `threads/${encodeURIComponent(message.threadId)}/modify`,
      accessToken,
      {
        addLabelIds: archived ? [] : ['INBOX'],
        removeLabelIds: archived ? ['INBOX'] : [],
      },
    );
  }

  async reply(
    _identity: GmailProviderIdentity,
    messageSourceURL: string,
    content: string,
  ): Promise<void> {
    const refreshToken = getProviderSecretsValue(this.id).trim();
    if (!refreshToken) {
      throw new Error(
        `Missing Gmail refresh token for provider "${this.id}". Re-authorize this provider.`,
      );
    }

    if (!content.trim()) {
      throw new Error('Reply content must not be empty.');
    }

    const messageID = parseMessageIDFromSourceURL(messageSourceURL);
    const accessToken = await this.getAccessToken(refreshToken);
    const originalMessage = await this.gmailGet<GmailMessageResponse>(
      accessToken,
      `messages/${encodeURIComponent(messageID)}?format=metadata&metadataHeaders=Reply-To&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
    );

    const toHeaderRaw =
      getHeaderValue(originalMessage.payload.headers, 'Reply-To') ??
      getHeaderValue(originalMessage.payload.headers, 'From');

    if (!toHeaderRaw) {
      throw new Error(
        `Cannot reply to Gmail message "${messageID}": missing From/Reply-To header.`,
      );
    }

    const toHeader = sanitizeMailHeaderValue(toHeaderRaw);
    if (!toHeader) {
      throw new Error(
        `Cannot reply to Gmail message "${messageID}": invalid From/Reply-To header.`,
      );
    }

    const originalSubject = sanitizeMailHeaderValue(
      getHeaderValue(originalMessage.payload.headers, 'Subject') ?? '',
    );
    const replySubject =
      originalSubject.length > 0
        ? /^re:/i.test(originalSubject)
          ? originalSubject
          : `Re: ${originalSubject}`
        : 'Re:';
    const inReplyTo = sanitizeMailHeaderValue(
      getHeaderValue(originalMessage.payload.headers, 'Message-ID') ?? '',
    );

    const headerLines = [
      `To: ${toHeader}`,
      `Subject: ${replySubject}`,
      ...(inReplyTo
        ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`]
        : []),
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
    ];

    const normalizedContent = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '\r\n');

    const raw = Buffer.from(
      `${headerLines.join('\r\n')}\r\n\r\n${normalizedContent}`,
      'utf-8',
    ).toString('base64url');

    await this.gmailPost('messages/send', accessToken, {
      threadId: originalMessage.threadId,
      raw,
    });
  }
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
