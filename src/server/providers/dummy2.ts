import crypto from 'node:crypto';
import type {
  FetchConvosResult,
  Provider2,
  ProviderConfig2,
  ProviderIdentity,
} from '../../shared/types';

export class DummyProvider2
  implements Provider2<ProviderIdentity, ProviderIdentity>
{
  type: string;
  id: number;

  constructor(config: ProviderConfig2) {
    this.type = config.type;
    this.id = config.id;
  }

  async fetchConvos(
    _identity: ProviderIdentity,
    _query: ProviderIdentity,
  ): Promise<FetchConvosResult> {
    const randomID = crypto.randomUUID();
    const providerID = this.id.toString();

    return {
      convos: [
        {
          id: `${providerID}-convo-1`,
          sourceURL: `https://dummy.example.com/threads/${providerID}-thread-1`,
          messages: [
            {
              id: `${providerID}-stable-msg`,
              sourceURL: `https://dummy.example.com/messages/${providerID}-stable`,
              providerID,
              content: `Hello from dummy provider "${providerID}" - this message never changes.`,
            },
            {
              id: randomID,
              sourceURL: `https://dummy.example.com/messages/${randomID}`,
              providerID,
              content: `New message from "${providerID}" at ${new Date().toISOString()}: ${crypto.randomUUID().slice(0, 8)}`,
            },
          ],
        },
      ],
    };
  }

  async setStar(
    _identity: ProviderIdentity,
    _messageSourceURL: string,
    _starred: boolean,
  ): Promise<void> {}
}
