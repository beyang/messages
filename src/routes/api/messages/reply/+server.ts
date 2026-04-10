import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import { replyWithProvider } from '../../../../server/providers';
import {
  getMessageProviderID,
  getProviderConfig,
} from '../../../../server/store';

export const POST: RequestHandler = async ({ request }) => {
  let body: {
    messageSourceURL?: unknown;
    content?: unknown;
  };

  try {
    body = (await request.json()) as {
      messageSourceURL?: unknown;
      content?: unknown;
    };
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const messageSourceURL =
    typeof body.messageSourceURL === 'string'
      ? body.messageSourceURL.trim()
      : '';
  if (!messageSourceURL) {
    return json({ error: 'messageSourceURL is required.' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content : '';
  if (!content.trim()) {
    return json(
      { error: 'content is required and must not be empty.' },
      { status: 400 },
    );
  }

  const messageProviderID = getMessageProviderID(messageSourceURL);
  if (!messageProviderID) {
    return json({ error: 'Message not found.' }, { status: 404 });
  }

  const providerID = Number.parseInt(messageProviderID, 10);
  if (!Number.isInteger(providerID) || providerID <= 0) {
    return json({ error: 'Message provider is invalid.' }, { status: 400 });
  }

  const providerConfig = getProviderConfig(providerID);
  if (!providerConfig) {
    return json({ error: 'Provider not found.' }, { status: 404 });
  }

  try {
    await replyWithProvider(providerConfig, messageSourceURL, content);
    return json({ replied: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: detail }, { status: 500 });
  }
};
