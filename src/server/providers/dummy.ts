import crypto from 'node:crypto';
import type {
  FetchConvosResult,
  Provider,
  ProviderConfig,
  SecretStore,
} from '../../shared/types';

export class DummyProvider implements Provider<null> {
  type: string;
  id: string;

  constructor(config: ProviderConfig<null>) {
    this.type = config.type;
    this.id = config.id;
  }

  async fetchConvos(
    _args: null,
    _secrets: SecretStore,
  ): Promise<FetchConvosResult> {
    const randomId = crypto.randomUUID();
    return {
      convos: [
        {
          id: `${this.id}-convo-1`,
          sourceURL: `https://dummy.example.com/threads/${this.id}-thread-1`,
          messages: [
            {
              id: `${this.id}-stable-msg`,
              sourceURL: `https://dummy.example.com/messages/${this.id}-stable`,
              providerID: this.id,
              content: `Hello from dummy provider "${this.id}" – this message never changes.`,
            },
            {
              id: randomId,
              sourceURL: `https://dummy.example.com/messages/${randomId}`,
              providerID: this.id,
              content: `New message from "${this.id}" at ${new Date().toISOString()}: ${crypto.randomUUID().slice(0, 8)}`,
            },
          ],
        },
      ],
    };
  }

  async setStar(
    _args: null,
    _secrets: SecretStore,
    _messageSourceURL: string,
    _starred: boolean,
  ): Promise<void> {}
}
