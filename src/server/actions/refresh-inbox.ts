import type { FetchConvosResult } from '../../shared/types';
import { fetchConvosFromProvider2 } from '../providers/index2';
import { getInboxProviders2, mergeConvosIntoInbox } from '../store';

export async function refreshInbox(
  inboxID: string,
): Promise<FetchConvosResult> {
  const configs = getInboxProviders2(inboxID);
  const result: FetchConvosResult = { convos: [] };

  for (const config of configs) {
    try {
      const fetchResult = await fetchConvosFromProvider2(config, config.query);
      if (fetchResult.needsAuth) {
        result.needsAuth = fetchResult.needsAuth;
      }
      const providerConvos = fetchResult.convos.map((convo) => ({
        ...convo,
        messages: convo.messages.map((message) => ({
          ...message,
          providerID: config.id.toString(),
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
