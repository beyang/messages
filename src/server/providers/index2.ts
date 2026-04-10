import type {
  FetchConvosResult,
  Provider2,
  ProviderConfig2,
  ProviderIdentity,
} from '../../shared/types';
import { DummyProvider2 } from './dummy2';
import { GmailProvider2, type GmailProvider2Identity } from './gmail2';
import { SlackProvider2, type SlackProvider2Identity } from './slack2';

type AnyProvider2 = Provider2<ProviderIdentity, ProviderIdentity>;

const PROVIDER2_FACTORIES: Record<
  string,
  (config: ProviderConfig2) => AnyProvider2
> = {
  dummy: (config) => new DummyProvider2(config),
  gmail: (config) =>
    new GmailProvider2(
      config as ProviderConfig2<GmailProvider2Identity>,
    ) as AnyProvider2,
  slack: (config) =>
    new SlackProvider2(
      config as ProviderConfig2<SlackProvider2Identity>,
    ) as AnyProvider2,
};

export function instantiateProvider2(config: ProviderConfig2): AnyProvider2 {
  const factory = PROVIDER2_FACTORIES[config.type];
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.type}`);
  }
  return factory(config);
}

export async function fetchConvosFromProvider2(
  config: ProviderConfig2,
  query: ProviderIdentity,
): Promise<FetchConvosResult> {
  const provider = instantiateProvider2(config);
  return provider.fetchConvos(config.identity, query);
}
