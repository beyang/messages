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
    const fetchResult = await fetchConvosFromProvider(config, secrets);
    if (fetchResult.needsAuth) {
      result.needsAuth = fetchResult.needsAuth;
    }
    if (fetchResult.convos.length > 0) {
      const merged = mergeConvosIntoInbox(inboxID, fetchResult.convos);
      result.convos.push(...merged);
    }
  }

  return result;
}
