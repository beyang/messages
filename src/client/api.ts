import type { Convo, Inbox } from '../shared/types';

export class MessagesApi {
  constructor(private readonly baseURL: string) {}

  async listInboxes(): Promise<Inbox[]> {
    return this.request<Inbox[]>('/api/inboxes');
  }

  async fetchProviders(inboxID: string): Promise<{
    fetched: number;
    convos: Convo[];
    errors?: string[];
    needsAuth?: { url: string };
  }> {
    return this.request(`/api/inboxes/${encodeURIComponent(inboxID)}/fetch`, {
      method: 'POST',
    });
  }

  async clearInbox(inboxID: string): Promise<{ deleted: number }> {
    return this.request(`/api/inboxes/${encodeURIComponent(inboxID)}/clear`, {
      method: 'POST',
    });
  }

  async setMessageStar(
    messageSourceURL: string,
    starred: boolean,
  ): Promise<{ starred: boolean; updatedLocal: boolean }> {
    return this.request('/api/messages/star', {
      method: 'POST',
      body: JSON.stringify({
        messageSourceURL,
        starred,
      }),
    });
  }

  async setMessageArchived(
    messageSourceURL: string,
    archived: boolean,
  ): Promise<{ archived: boolean; updatedLocal: boolean }> {
    return this.request('/api/messages/archive', {
      method: 'POST',
      body: JSON.stringify({
        messageSourceURL,
        archived,
      }),
    });
  }

  async replyToMessage(
    messageSourceURL: string,
    content: string,
  ): Promise<{ replied: boolean }> {
    return this.request('/api/messages/reply', {
      method: 'POST',
      body: JSON.stringify({
        messageSourceURL,
        content,
      }),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'application/json');
    if (init?.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await fetch(`${this.baseURL}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as T;
  }
}
