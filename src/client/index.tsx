import { Box, render, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { Convo, Inbox, Message } from '../shared/types.js';
import { MessagesApi } from './api.js';
import { MrkdwnText } from './mrkdwn.js';
import { sanitizeForTerminalText } from './terminal-text.js';

const serverURL = process.env.MESSAGES_SERVER_URL ?? 'http://localhost:3000';
const api = new MessagesApi(serverURL);

type FocusPane = 'inboxes' | 'convos';

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function MessagePreview({ message }: { message: Message }) {
  const authorName = message.author?.displayName ?? message.author?.username;
  const author = authorName ? sanitizeForTerminalText(authorName) : undefined;
  const subject = message.subject
    ? sanitizeForTerminalText(message.subject)
    : undefined;
  const preview = sanitizeForTerminalText(message.content)
    .replace(/\n+/g, '')
    .slice(0, 20);
  return (
    <Box flexDirection="column">
      <Text wrap="truncate">
        {author}
        {author && subject ? ', ' : ''}
        {subject && <Text bold>{subject}</Text>}
      </Text>
      <Text wrap="truncate" dimColor>
        {preview}
      </Text>
    </Box>
  );
}

function SelectableList({
  items,
  selectedIndex,
  emptyLabel,
  isFocused,
}: {
  items: React.ReactNode[];
  selectedIndex: number;
  emptyLabel: string;
  isFocused: boolean;
}) {
  if (items.length === 0) {
    return <Text dimColor>{emptyLabel}</Text>;
  }
  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: items lack stable IDs
            key={i}
            flexDirection="row"
          >
            <Text bold={isSelected} inverse={isSelected && isFocused}>
              {isSelected ? '❯ ' : '  '}
            </Text>
            <Box flexGrow={1} flexDirection="column">
              {typeof item === 'string' ? (
                <Text
                  bold={isSelected}
                  inverse={isSelected && isFocused}
                  wrap="truncate"
                >
                  {item}
                </Text>
              ) : (
                item
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function Pane({
  label,
  isFocused,
  children,
  width,
}: {
  label: string;
  isFocused: boolean;
  children: React.ReactNode;
  width: string;
}) {
  const headerColor = isFocused ? 'cyan' : 'white';

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'white'}
    >
      <Box marginTop={-1} paddingX={1}>
        <Text bold color={headerColor}>
          {' '}
          {label}{' '}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}

function MessageFull({ message }: { message: Message }) {
  const content = sanitizeForTerminalText(message.content);
  const timestamp = sanitizeForTerminalText(message.timestamp ?? '');
  const sourceURL = sanitizeForTerminalText(message.sourceURL);
  const authorLabel = message.author
    ? message.author.displayName
      ? `${sanitizeForTerminalText(message.author.displayName)} <${sanitizeForTerminalText(message.author.username)}>`
      : sanitizeForTerminalText(message.author.username)
    : 'Unknown';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>From: {authorLabel}</Text>
      <Text dimColor>{timestamp}</Text>
      <Text dimColor>{sourceURL}</Text>
      <Text> </Text>
      <MrkdwnText content={content} />
    </Box>
  );
}

function MessageView({ convo }: { convo: Convo | null }) {
  if (!convo) {
    return <Text dimColor>Select a convo to read messages.</Text>;
  }
  if (convo.messages.length === 0) {
    return <Text dimColor>No messages in this convo.</Text>;
  }
  return (
    <Box flexDirection="column">
      {convo.messages.map((message) => (
        <MessageFull key={message.id} message={message} />
      ))}
    </Box>
  );
}

function Footer({
  status,
  inbox,
  convo,
}: {
  status: string;
  inbox: Inbox | null;
  convo: Convo | null;
}) {
  const safeStatus = sanitizeForTerminalText(status);
  const providerLabel = inbox
    ? `Providers: ${inbox.providers.length > 0 ? inbox.providers.map((p) => `${sanitizeForTerminalText(p.id)}(${sanitizeForTerminalText(p.type)})`).join(', ') : '(none)'}`
    : 'Providers: (no inbox selected)';
  const convoLabel = convo
    ? `Selected convo: ${sanitizeForTerminalText(convo.sourceURL)}`
    : 'Selected convo: (none)';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      paddingX={1}
    >
      <Text>{safeStatus}</Text>
      <Text bold>
        Keys:{' '}
        <Text>
          ↑/↓ move · tab switch pane · R refresh · f fetch · c clear inbox · q
          quit
        </Text>
      </Text>
      <Text>
        {providerLabel} · {convoLabel}
      </Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInboxIndex, setSelectedInboxIndex] = useState(0);
  const [selectedConvoIndex, setSelectedConvoIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<FocusPane>('inboxes');
  const [status, setStatus] = useState(`Connecting to ${serverURL}...`);

  const currentInbox = inboxes[selectedInboxIndex] ?? null;
  const convos = currentInbox?.convos ?? [];
  const currentConvo = convos[selectedConvoIndex] ?? null;

  const refreshData = useCallback(async (msg: string) => {
    try {
      const data = await api.listInboxes();
      setInboxes(data);
      setSelectedInboxIndex((prev) => clamp(prev, data.length));
      setStatus(msg);
      if (data.length === 0) {
        setStatus('No inboxes found. Run `pnpm db:seed` to load demo data.');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to load data from ${serverURL}: ${detail}`);
    }
  }, []);

  useEffect(() => {
    void refreshData('Loaded inboxes.');
  }, [refreshData]);

  const inboxItems = inboxes.map(
    (inbox) => `${sanitizeForTerminalText(inbox.id)} (${inbox.convos.length})`,
  );
  const convoItems = convos.map((convo) => {
    const lastMessage = convo.messages[convo.messages.length - 1];
    if (lastMessage) {
      return <MessagePreview key={convo.id} message={lastMessage} />;
    }
    return sanitizeForTerminalText(convo.sourceURL);
  });

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (key.tab) {
      setFocusPane((prev) => (prev === 'inboxes' ? 'convos' : 'inboxes'));
      return;
    }

    if (key.leftArrow || input === 'h') {
      setFocusPane('inboxes');
      return;
    }
    if (key.rightArrow || input === 'l') {
      setFocusPane('convos');
      return;
    }

    if (key.upArrow || input === 'k') {
      if (focusPane === 'inboxes') {
        setSelectedInboxIndex((prev) => {
          const next = clamp(prev - 1, inboxes.length);
          if (next !== prev) setSelectedConvoIndex(0);
          return next;
        });
      } else {
        setSelectedConvoIndex((prev) => clamp(prev - 1, convos.length));
      }
      return;
    }

    if (key.downArrow || input === 'j') {
      if (focusPane === 'inboxes') {
        setSelectedInboxIndex((prev) => {
          const next = clamp(prev + 1, inboxes.length);
          if (next !== prev) setSelectedConvoIndex(0);
          return next;
        });
      } else {
        setSelectedConvoIndex((prev) => clamp(prev + 1, convos.length));
      }
      return;
    }

    if (input === 'R') {
      void refreshData('Inboxes refreshed from server.');
      return;
    }

    if (input === 'f') {
      if (!currentInbox) {
        setStatus('No inbox selected.');
        return;
      }
      if (currentInbox.providers.length === 0) {
        setStatus('No providers configured for this inbox.');
        return;
      }
      setStatus(
        `Fetching from ${currentInbox.providers.length} provider(s)...`,
      );
      void (async () => {
        try {
          const result = await api.fetchProviders(currentInbox.id);
          const parts: string[] = [
            `Fetched ${result.fetched} conversation(s) from providers.`,
          ];
          if (result.needsAuth) {
            parts.push(`Auth required: ${serverURL}${result.needsAuth.url}`);
          }
          if (result.errors?.length) {
            parts.push(`Errors: ${result.errors.join('; ')}`);
          }
          await refreshData(parts.join(' | '));
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Fetch failed: ${detail}`);
        }
      })();
      return;
    }

    if (input === 'c') {
      if (!currentInbox) {
        setStatus('No inbox selected.');
        return;
      }
      setStatus(`Clearing messages from inbox "${currentInbox.id}"...`);
      void (async () => {
        try {
          const result = await api.clearInbox(currentInbox.id);
          setSelectedConvoIndex(0);
          await refreshData(
            `Cleared ${result.deleted} conversation(s) from inbox "${currentInbox.id}".`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Clear failed: ${detail}`);
        }
      })();
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexGrow={1}>
        <Pane label="Inboxes" isFocused={focusPane === 'inboxes'} width="20%">
          <SelectableList
            items={inboxItems}
            selectedIndex={selectedInboxIndex}
            emptyLabel="(no inboxes)"
            isFocused={focusPane === 'inboxes'}
          />
        </Pane>
        <Pane label="Convos" isFocused={focusPane === 'convos'} width="30%">
          <SelectableList
            items={convoItems}
            selectedIndex={selectedConvoIndex}
            emptyLabel="(no convos)"
            isFocused={focusPane === 'convos'}
          />
        </Pane>
        <Pane label="Messages" isFocused={false} width="50%">
          <MessageView convo={currentConvo} />
        </Pane>
      </Box>
      <Footer status={status} inbox={currentInbox} convo={currentConvo} />
    </Box>
  );
}

render(<App />, { alternateScreen: true });
