import { Box, Text } from 'ink';
import type { Convo, Inbox, InboxProvider, Message } from '../shared/types.js';
import { sanitizeForTerminalText } from './terminal-text.js';

const HELP_MODAL_SHORTCUTS = [
  '↑/↓ or j/k move selection',
  'tab switch pane',
  '←/→ or h/l jump pane',
  'R refresh inboxes',
  'f fetch providers for selected inbox',
  'c clear selected inbox',
  'r compose reply',
  'a compose reply all',
  'alt+enter send reply draft',
  'esc discard reply draft',
  's toggle star on selected message',
  'e toggle archive on selected message',
  'v open source URL',
  '? toggle this help modal',
  'esc close help modal',
  'q quit',
  'ctrl+c quit',
];

type HelpModalProps = {
  inbox: Inbox | null;
  convo: Convo | null;
  message: Message | null;
  terminalRows: number;
};

function getConvoTitle(convo: Convo): string {
  for (let index = convo.messages.length - 1; index >= 0; index -= 1) {
    const subject = convo.messages[index]?.subject?.trim();
    if (subject) {
      return subject;
    }
  }

  return '(untitled)';
}

function formatProviderFields(fields: InboxProvider['query']): string | null {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return null;
  }

  return entries
    .map(([key, value]) => {
      const serializedValue =
        value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
      return `${key}:${serializedValue}`;
    })
    .join(' -> ');
}

export function formatHelpModalProvider(provider: InboxProvider): string {
  const segments = [provider.type];
  const identity = formatProviderFields(provider.identity);
  if (identity) {
    segments.push(identity);
  }
  const query = formatProviderFields(provider.query);
  if (query) {
    segments.push(query);
  }
  return sanitizeForTerminalText(segments.join(' -> '));
}

export function HelpModal({
  inbox,
  convo,
  message,
  terminalRows,
}: HelpModalProps) {
  const selectedInbox = inbox
    ? sanitizeForTerminalText(inbox.displayName)
    : '(none)';
  const selectedConvo = convo
    ? sanitizeForTerminalText(getConvoTitle(convo))
    : '(none)';
  const selectedMessage = message
    ? sanitizeForTerminalText(message.id)
    : '(none)';
  const selectedInboxProviderItems = inbox
    ? inbox.providers.length > 0
      ? inbox.providers.map((provider) => ({
          key: provider.id.toString(),
          line: formatHelpModalProvider(provider),
        }))
      : [{ key: 'none-configured', line: '(none configured)' }]
    : [{ key: 'none', line: '(none)' }];
  const height = Math.max(
    12,
    Math.min(
      terminalRows - 2,
      HELP_MODAL_SHORTCUTS.length + 9 + selectedInboxProviderItems.length,
    ),
  );

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <Box
        flexDirection="column"
        width="90%"
        height={height}
        borderStyle="double"
        borderColor="cyan"
        backgroundColor="black"
        paddingX={1}
        overflow="hidden"
      >
        <Text bold color="cyan" wrap="truncate-end">
          Help (? to close)
        </Text>
        <Text bold wrap="truncate-end">
          Keyboard shortcuts
        </Text>
        {HELP_MODAL_SHORTCUTS.map((shortcut) => (
          <Text key={shortcut} wrap="truncate-end">
            - {shortcut}
          </Text>
        ))}
        <Text wrap="truncate-end"> </Text>
        <Text wrap="truncate-end">
          <Text bold>Selected:</Text> [Inbox] {selectedInbox} -&gt; [Convo]{' '}
          {selectedConvo} -&gt; [Message] {selectedMessage}
        </Text>
        <Text bold wrap="truncate-end">
          Inbox Providers:
        </Text>
        {selectedInboxProviderItems.map((provider) => (
          <Text key={provider.key} wrap="truncate-end">
            - {provider.line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
