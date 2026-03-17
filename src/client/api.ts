import type { Inbox } from '../shared/types';

export class MessagesApi {
  constructor(private readonly baseURL: string) {}

  async listInboxes(): Promise<Inbox[]> {
    return this.request<Inbox[]>('/api/inboxes');
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
