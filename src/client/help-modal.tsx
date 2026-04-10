import { Box, Text } from 'ink';
import type { Convo, Inbox, Message } from '../shared/types.js';
import { sanitizeForTerminalText } from './terminal-text.js';

const HELP_MODAL_SHORTCUTS = [
  '↑/↓ or j/k move selection',
  'tab switch pane',
  '←/→ or h/l jump pane',
  'R refresh inboxes',
  'f fetch providers for selected inbox',
  'c clear selected inbox',
  'r compose reply',
  'alt+enter send reply draft',
  'esc discard reply draft',
  's toggle star on selected message',
  'e toggle archive on selected message',
  'o open source URL',
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

export function HelpModal({
  inbox,
  convo,
  message,
  terminalRows,
}: HelpModalProps) {
  const selectedInbox = inbox ? sanitizeForTerminalText(inbox.id) : '(none)';
  const selectedConvo = convo
    ? sanitizeForTerminalText(getConvoTitle(convo))
    : '(none)';
  const selectedMessage = message
    ? sanitizeForTerminalText(message.id)
    : '(none)';
  const height = Math.max(
    12,
    Math.min(terminalRows - 2, HELP_MODAL_SHORTCUTS.length + 8),
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
      </Box>
    </Box>
  );
}
