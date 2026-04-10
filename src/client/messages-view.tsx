import { Box, Text } from 'ink';
import type { Convo, Message } from '../shared/types.js';
import { mrkdwnToPlainText } from './mrkdwn.js';
import { sanitizeForTerminalText } from './terminal-text.js';

interface RenderedLine {
  text: string;
  bold?: boolean;
  dimColor?: boolean;
}

function wrapTextLines(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);

  return sanitizeForTerminalText(text)
    .split('\n')
    .flatMap((line) => {
      const chars = [...line];
      if (chars.length === 0) {
        return [''];
      }

      const wrapped: string[] = [];
      for (let start = 0; start < chars.length; start += safeWidth) {
        wrapped.push(chars.slice(start, start + safeWidth).join(''));
      }

      return wrapped;
    });
}

function buildMessageLines(
  message: Message,
  width: number,
  showSeparator: boolean,
): RenderedLine[] {
  const safeWidth = Math.max(1, width);
  const authorLabel = message.author
    ? message.author.displayName
      ? `${sanitizeForTerminalText(message.author.displayName)} <${sanitizeForTerminalText(message.author.username)}>`
      : sanitizeForTerminalText(message.author.username)
    : 'Unknown';

  const bodyText = mrkdwnToPlainText(message.content);

  const lines: RenderedLine[] = [
    ...wrapTextLines(`From: ${authorLabel}`, safeWidth).map((text) => ({
      text,
      bold: true,
    })),
    ...wrapTextLines(message.timestamp ?? '', safeWidth).map((text) => ({
      text,
      dimColor: true,
    })),
    ...wrapTextLines(message.sourceURL, safeWidth).map((text) => ({
      text,
      dimColor: true,
    })),
    { text: '' },
    ...wrapTextLines(bodyText, safeWidth).map((text) => ({ text })),
  ];

  if (showSeparator) {
    lines.push({ text: '─'.repeat(safeWidth), dimColor: true });
  }

  return lines;
}

export function buildConvoMessageLines(
  convo: Convo | null,
  width: number,
): RenderedLine[] {
  if (!convo || convo.messages.length === 0) {
    return [];
  }

  return convo.messages.flatMap((message, index) =>
    buildMessageLines(message, width, index < convo.messages.length - 1),
  );
}

export function MessagesView({
  convo,
  lines,
  height,
  scrollOffset,
}: {
  convo: Convo | null;
  lines: RenderedLine[];
  height: number;
  scrollOffset: number;
}) {
  const safeHeight = Math.max(0, height);

  if (safeHeight === 0) {
    return null;
  }

  const contentLines: RenderedLine[] = !convo
    ? [{ text: 'Select a convo to read messages.', dimColor: true }]
    : convo.messages.length === 0
      ? [{ text: 'No messages in this convo.', dimColor: true }]
      : lines;

  const maxOffset = Math.max(0, contentLines.length - safeHeight);
  const safeScrollOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const viewportLines: Array<{ key: string; line: RenderedLine }> = [];

  for (let row = 0; row < safeHeight; row += 1) {
    const absoluteLineIndex = safeScrollOffset + row;
    const line = contentLines[absoluteLineIndex];

    if (line) {
      viewportLines.push({ key: `line:${absoluteLineIndex}`, line });
      continue;
    }

    viewportLines.push({ key: `pad:${row}`, line: { text: '' } });
  }

  return (
    <Box flexDirection="column" height={safeHeight} overflowY="hidden">
      {viewportLines.map((entry) => (
        <Text
          key={entry.key}
          bold={entry.line.bold}
          dimColor={entry.line.dimColor}
          wrap="truncate-end"
        >
          {entry.line.text.length > 0 ? entry.line.text : ' '}
        </Text>
      ))}
    </Box>
  );
}
