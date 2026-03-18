import crypto from 'node:crypto';
import type { Convo, Provider, ProviderConfig } from '../shared/types';

class DummyProvider implements Provider<null> {
  type: string;
  id: string;

  constructor(config: ProviderConfig<null>) {
    this.type = config.type;
    this.id = config.id;
  }

  fetchConvos(_args: null): Convo[] {
    const randomId = crypto.randomUUID();
    return [
      {
        id: `${this.id}-convo-1`,
        sourceURL: `https://dummy.example.com/threads/${this.id}-thread-1`,
        messages: [
          {
            id: `${this.id}-stable-msg`,
            sourceURL: `https://dummy.example.com/messages/${this.id}-stable`,
            content: `Hello from dummy provider "${this.id}" – this message never changes.`,
          },
          {
            id: randomId,
            sourceURL: `https://dummy.example.com/messages/${randomId}`,
            content: `New message from "${this.id}" at ${new Date().toISOString()}: ${crypto.randomUUID().slice(0, 8)}`,
          },
        ],
      },
    ];
  }
}

const PROVIDER_FACTORIES: Record<string, (config: ProviderConfig) => Provider> =
  {
    dummy: (config) => new DummyProvider(config as ProviderConfig<null>),
  };

export function instantiateProvider(config: ProviderConfig): Provider {
  const factory = PROVIDER_FACTORIES[config.type];
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.type}`);
  }
  return factory(config);
}

export function fetchConvosFromProvider(config: ProviderConfig): Convo[] {
  const provider = instantiateProvider(config);
  return provider.fetchConvos(config.args);
}
