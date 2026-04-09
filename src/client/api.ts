import type {
  Convo,
  Inbox,
  JsonSerializable,
  ProviderConfig,
} from '../shared/types';

export class MessagesApi {
  constructor(private readonly baseURL: string) {}

  async listInboxes(): Promise<Inbox[]> {
    return this.request<Inbox[]>('/api/inboxes');
  }

  async createProvider(
    inboxID: string,
    id: string,
    type: string,
    args: JsonSerializable = null,
  ): Promise<ProviderConfig> {
    return this.request<ProviderConfig>(
      `/api/inboxes/${encodeURIComponent(inboxID)}/providers`,
      { method: 'POST', body: JSON.stringify({ id, type, args }) },
    );
  }

  async updateProvider(
    inboxID: string,
    id: string,
    updates: { type?: string; args?: JsonSerializable },
  ): Promise<ProviderConfig> {
    return this.request<ProviderConfig>(
      `/api/inboxes/${encodeURIComponent(inboxID)}/providers`,
      { method: 'PUT', body: JSON.stringify({ id, ...updates }) },
    );
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

  async deleteProvider(inboxID: string, id: string): Promise<void> {
    await this.request(
      `/api/inboxes/${encodeURIComponent(inboxID)}/providers`,
      { method: 'DELETE', body: JSON.stringify({ id }) },
    );
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
