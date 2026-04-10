import type { FetchConvosResult, SecretStore } from '../../shared/types';
import { fetchConvosFromProvider } from '../providers';
import { getInboxProviders, mergeConvosIntoInbox } from '../store';

export async function refreshInbox(
  inboxID: string,
  secrets: SecretStore,
): Promise<FetchConvosResult> {
  const configs = getInboxProviders(inboxID);
  const result: FetchConvosResult = { convos: [] };

  for (const config of configs) {
    try {
      const fetchResult = await fetchConvosFromProvider(config, secrets);
      if (fetchResult.needsAuth) {
        result.needsAuth = fetchResult.needsAuth;
      }
      const providerConvos = fetchResult.convos.map((convo) => ({
        ...convo,
        messages: convo.messages.map((message) => ({
          ...message,
          providerID: config.id,
        })),
      }));
      if (providerConvos.length > 0) {
        const merged = mergeConvosIntoInbox(inboxID, providerConvos);
        result.convos.push(...merged);
      }
      if (fetchResult.errors) {
        result.errors = [...(result.errors ?? []), ...fetchResult.errors];
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      result.errors = [
        ...(result.errors ?? []),
        `${config.type}(${config.id}): ${detail}`,
      ];
    }
  }

  return result;
}
