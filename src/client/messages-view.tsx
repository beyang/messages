import { Box, Text } from 'ink';
import type { Convo, Message } from '../shared/types.js';
import { mrkdwnToPlainText } from './mrkdwn.js';
import { sanitizeForTerminalText } from './terminal-text.js';

interface RenderedLine {
  text: string;
  bold?: boolean;
  dimColor?: boolean;
  messageIndex?: number;
  isMessageStart?: boolean;
}

export interface ConvoMessageLayout {
  lines: RenderedLine[];
  messages: Message[];
  messageLineStarts: number[];
  messageLineCounts: number[];
}

function textLength(text: string): number {
  return [...text].length;
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

function wrapTextLinesAtWordBoundaries(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);

  return sanitizeForTerminalText(text)
    .split('\n')
    .flatMap((line) => {
      if (line.length === 0) {
        return [''];
      }

      const words = line
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);
      if (words.length === 0) {
        return [''];
      }

      const wrapped: string[] = [];
      let currentLine = words[0] ?? '';

      for (const word of words.slice(1)) {
        const candidateLine = `${currentLine} ${word}`;
        if (textLength(candidateLine) <= safeWidth) {
          currentLine = candidateLine;
          continue;
        }

        wrapped.push(currentLine);
        currentLine = word;
      }

      wrapped.push(currentLine);
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
    ...wrapTextLines(message.sourceURL, safeWidth).map((text) => ({
      text,
      dimColor: true,
    })),
    ...wrapTextLines(`Time: ${message.timestamp ?? ''}`, safeWidth).map(
      (text) => ({
        text,
        dimColor: true,
      }),
    ),
    ...wrapTextLines(`From: ${authorLabel}`, safeWidth).map((text) => ({
      text,
      bold: true,
    })),
    { text: '' },
    ...wrapTextLinesAtWordBoundaries(bodyText, safeWidth).map((text) => ({
      text,
    })),
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
  return buildConvoMessageLayout(convo, width).lines;
}

export function buildConvoMessageLayout(
  convo: Convo | null,
  width: number,
): ConvoMessageLayout {
  if (!convo || convo.messages.length === 0) {
    return {
      lines: [],
      messages: [],
      messageLineStarts: [],
      messageLineCounts: [],
    };
  }

  const messages = [...convo.messages].reverse();
  const lines: RenderedLine[] = [];
  const messageLineStarts: number[] = [];
  const messageLineCounts: number[] = [];

  messages.forEach((message, messageIndex) => {
    const messageLines = buildMessageLines(
      message,
      width,
      messageIndex < messages.length - 1,
    );
    messageLineStarts.push(lines.length);
    messageLineCounts.push(messageLines.length);
    lines.push(
      ...messageLines.map((line, lineIndex) => ({
        ...line,
        messageIndex,
        isMessageStart: lineIndex === 0,
      })),
    );
  });

  return { lines, messages, messageLineStarts, messageLineCounts };
}

export function MessagesView({
  convo,
  lines,
  height,
  scrollOffset,
  selectedMessageIndex,
  isFocused,
}: {
  convo: Convo | null;
  lines: RenderedLine[];
  height: number;
  scrollOffset: number;
  selectedMessageIndex: number;
  isFocused: boolean;
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
      {viewportLines.map((entry) => {
        const isSelectedMessageLine =
          entry.line.messageIndex === selectedMessageIndex && !!convo;
        const isSelectedMessageStart =
          isSelectedMessageLine && entry.line.isMessageStart;
        const linePrefix = isSelectedMessageStart ? '❯ ' : '  ';

        return (
          <Box key={entry.key} flexDirection="row">
            <Text
              bold={isSelectedMessageStart}
              inverse={isSelectedMessageStart && isFocused}
            >
              {linePrefix}
            </Text>
            <Text
              bold={entry.line.bold}
              dimColor={entry.line.dimColor}
              wrap="truncate-end"
            >
              {entry.line.text.length > 0 ? entry.line.text : ' '}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
