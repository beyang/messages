import type { Convo } from '../../shared/types';
import { fetchConvosFromProvider } from '../providers';
import { getInboxProviders, mergeConvosIntoInbox } from '../store';

export function refreshInbox(inboxID: string): Convo[] {
  const configs = getInboxProviders(inboxID);
  const allConvos: Convo[] = [];

  for (const config of configs) {
    const convos = fetchConvosFromProvider(config);
    const merged = mergeConvosIntoInbox(inboxID, convos);
    allConvos.push(...merged);
  }

  return allConvos;
}
