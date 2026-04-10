import type {
  FetchConvosResult,
  Provider,
  ProviderConfig,
  ProviderIdentity,
} from '../../shared/types';
import { DummyProvider } from './dummy';
import { GmailProvider, type GmailProviderIdentity } from './gmail';
import { SlackProvider, type SlackProviderIdentity } from './slack';

type AnyProvider = Provider<ProviderIdentity, ProviderIdentity>;

const PROVIDER_FACTORIES: Record<
  string,
  (config: ProviderConfig) => AnyProvider
> = {
  dummy: (config) => new DummyProvider(config),
  gmail: (config) =>
    new GmailProvider(
      config as ProviderConfig<GmailProviderIdentity>,
    ) as AnyProvider,
  slack: (config) =>
    new SlackProvider(
      config as ProviderConfig<SlackProviderIdentity>,
    ) as AnyProvider,
};

export function instantiateProvider(config: ProviderConfig): AnyProvider {
  const factory = PROVIDER_FACTORIES[config.type];
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.type}`);
  }
  return factory(config);
}

export async function fetchConvosFromProvider(
  config: ProviderConfig,
  query: ProviderIdentity,
): Promise<FetchConvosResult> {
  const provider = instantiateProvider(config);
  return provider.fetchConvos(config.identity, query);
}
