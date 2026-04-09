import type { GmailProviderArgs } from '../../shared/gmail-types';
import type { SlackProviderArgs } from '../../shared/slack-types';
import type {
  FetchConvosResult,
  Provider,
  ProviderConfig,
  SecretStore,
} from '../../shared/types';
import { DummyProvider } from './dummy';
import { GmailProvider } from './gmail';
import { SlackProvider } from './slack';

const PROVIDER_FACTORIES: Record<string, (config: ProviderConfig) => Provider> =
  {
    dummy: (config) => new DummyProvider(config as ProviderConfig<null>),
    gmail: (config) =>
      new GmailProvider(config as ProviderConfig<GmailProviderArgs>),
    slack: (config) =>
      new SlackProvider(config as ProviderConfig<SlackProviderArgs>),
  };

export function instantiateProvider(config: ProviderConfig): Provider {
  const factory = PROVIDER_FACTORIES[config.type];
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.type}`);
  }
  return factory(config);
}

export async function fetchConvosFromProvider(
  config: ProviderConfig,
  secrets: SecretStore,
): Promise<FetchConvosResult> {
  const provider = instantiateProvider(config);
  return provider.fetchConvos(config.args, secrets);
}
