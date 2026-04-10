import type {
  Convo,
  FetchConvosResult,
  Provider,
  ProviderConfig,
  ProviderIdentity,
} from '../../shared/types';
import { getSlackConfig } from '../slack-config';
import { getProviderSecretsValue, updateProviderSecretsValue } from './secrets';

const SLACK_REDIRECT_PATH = '/api/oauth/slack/callback';
const SLACK_USER_SCOPES = 'search:read';

export interface SlackProviderIdentity extends ProviderIdentity {}

export interface SlackProviderQuery extends ProviderIdentity {
  searchQuery: string;
}

interface SlackSearchMatch {
  ts?: string;
  thread_ts?: string;
  text?: string;
  permalink?: string;
  username?: string;
  channel?: {
    id?: string;
    name?: string;
  };
}

interface SlackSearchResponse {
  ok: boolean;
  error?: string;
  messages?: {
    matches?: SlackSearchMatch[];
  };
}

interface SlackOAuthSuccessResponse {
  ok: true;
  access_token?: string;
  authed_user?: {
    access_token?: string;
  };
}

interface SlackOAuthErrorResponse {
  ok: false;
  error: string;
}

type SlackOAuthResponse = SlackOAuthSuccessResponse | SlackOAuthErrorResponse;

interface SlackTokenExchangeResult {
  accessToken: string;
}

interface GroupedConvo {
  id: string;
  sourceURL: string;
  messages: {
    ts: string;
    message: Convo['messages'][number];
  }[];
}

function sanitizeSlackTimestamp(ts: string): string {
  return ts.replaceAll('.', '-');
}

function parseSlackTimestamp(ts: string): number {
  const parsed = Number.parseFloat(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slackAppRedirectURL(channelID: string, ts: string): string {
  const params = new URLSearchParams({
    channel: channelID,
    message_ts: ts,
  });
  return `https://slack.com/app_redirect?${params.toString()}`;
}

function slackNeedsAuthURL(providerID: number): string {
  return `/api/oauth/slack?provider_id=${encodeURIComponent(providerID.toString())}`;
}

function messageSourceURL(
  match: SlackSearchMatch,
  channelID: string,
  ts: string,
): string {
  return match.permalink?.trim() || slackAppRedirectURL(channelID, ts);
}

export class SlackProvider
  implements Provider<SlackProviderIdentity, SlackProviderQuery>
{
  type: string;
  id: number;

  constructor(config: ProviderConfig<SlackProviderIdentity>) {
    this.type = config.type;
    this.id = config.id;
  }

  authInitURL(_identity: SlackProviderIdentity, baseURL: string): string {
    const creds = getSlackConfig();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: `${baseURL}${SLACK_REDIRECT_PATH}`,
      user_scope: SLACK_USER_SCOPES,
      state: this.id.toString(),
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  handleAuthCallback(accessToken: string): void {
    updateProviderSecretsValue(this.id, accessToken);
  }

  private async searchMessages(
    accessToken: string,
    searchQuery: string,
  ): Promise<SlackSearchMatch[]> {
    const params = new URLSearchParams({
      query: searchQuery,
      count: '100',
      sort: 'timestamp',
      sort_dir: 'desc',
    });

    const res = await fetch(`https://slack.com/api/search.messages?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(
        `Slack API error (search.messages): ${res.status} ${await res.text()}`,
      );
    }

    const data = (await res.json()) as SlackSearchResponse;
    if (!data.ok) {
      throw new Error(
        `Slack API error (search.messages): ${data.error ?? 'unknown_error'}`,
      );
    }

    return data.messages?.matches ?? [];
  }

  async fetchConvos(
    _identity: SlackProviderIdentity,
    query: SlackProviderQuery,
  ): Promise<FetchConvosResult> {
    const accessToken = getProviderSecretsValue(this.id).trim();
    if (!accessToken) {
      return {
        convos: [],
        needsAuth: {
          url: slackNeedsAuthURL(this.id),
        },
      };
    }

    const searchQuery = query.searchQuery?.trim();
    if (!searchQuery) {
      throw new Error('Slack provider query.searchQuery is required.');
    }

    let matches: SlackSearchMatch[];
    try {
      matches = await this.searchMessages(accessToken, searchQuery);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (
        detail.includes('invalid_auth') ||
        detail.includes('token_revoked') ||
        detail.includes('not_authed')
      ) {
        updateProviderSecretsValue(this.id, '');
        return {
          convos: [],
          needsAuth: {
            url: slackNeedsAuthURL(this.id),
          },
          errors: [
            'Slack auth token is invalid or expired. Re-authorize this provider.',
          ],
        };
      }
      throw error;
    }

    if (matches.length === 0) {
      return { convos: [] };
    }

    const groupedConvos = new Map<string, GroupedConvo>();

    for (const match of matches) {
      const channelID = match.channel?.id?.trim();
      const ts = match.ts?.trim();
      if (!channelID || !ts) {
        continue;
      }

      const threadTS = (match.thread_ts ?? ts).trim();
      const convoKey = `${channelID}:${threadTS}`;

      let grouped = groupedConvos.get(convoKey);
      if (!grouped) {
        grouped = {
          id: `slack-${channelID}-${sanitizeSlackTimestamp(threadTS)}`,
          sourceURL: messageSourceURL(match, channelID, ts),
          messages: [],
        };
        groupedConvos.set(convoKey, grouped);
      }

      if (
        match.permalink &&
        grouped.sourceURL.startsWith('https://slack.com/app_redirect')
      ) {
        grouped.sourceURL = match.permalink;
      }

      const username = match.username?.trim();
      grouped.messages.push({
        ts,
        message: {
          id: `slack-${channelID}-${sanitizeSlackTimestamp(ts)}`,
          sourceURL: messageSourceURL(match, channelID, ts),
          providerID: this.id.toString(),
          hasStar: false,
          content: match.text ?? '',
          ...(username ? { author: { username } } : {}),
        },
      });
    }

    const convos = Array.from(groupedConvos.values()).map(
      (grouped): Convo => ({
        id: grouped.id,
        sourceURL: grouped.sourceURL,
        messages: grouped.messages
          .sort((a, b) => parseSlackTimestamp(a.ts) - parseSlackTimestamp(b.ts))
          .map((entry) => entry.message),
      }),
    );

    convos.sort((a, b) => a.id.localeCompare(b.id));

    return { convos };
  }

  async setStar(
    _identity: SlackProviderIdentity,
    _messageSourceURL: string,
    _starred: boolean,
  ): Promise<void> {
    throw new Error(
      'Slack does not currently support toggling saved/Later state via API.',
    );
  }
}

export async function exchangeSlackCode(
  code: string,
  redirectUri: string,
): Promise<SlackTokenExchangeResult> {
  const creds = getSlackConfig();
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to exchange Slack auth code: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok) {
    throw new Error(`Slack OAuth token exchange failed: ${data.error}`);
  }

  const accessToken = data.authed_user?.access_token ?? data.access_token;
  if (!accessToken) {
    throw new Error('No user access token returned from Slack OAuth exchange.');
  }

  return { accessToken };
}
