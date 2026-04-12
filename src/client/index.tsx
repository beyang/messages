import { execFile } from 'node:child_process';
import { Box, render, Text, useApp, useInput, useStdout } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Convo, Inbox, Message } from '../shared/types.js';
import { MessagesApi } from './api.js';
import { Footer } from './footer.js';
import { HelpModal } from './help-modal.js';
import { buildConvoMessageLayout, MessagesView } from './messages-view.js';
import { sanitizeForTerminalText } from './terminal-text.js';

const serverURL = process.env.MESSAGES_SERVER_URL ?? 'http://localhost:3000';
const api = new MessagesApi(serverURL);

type FocusPane = 'inboxes' | 'convos' | 'messages';
type ReplyMode = 'reply' | 'replyAll';

const FOCUS_PANES: FocusPane[] = ['inboxes', 'convos', 'messages'];
const FALLBACK_TERMINAL_ROWS = 24;
const FALLBACK_TERMINAL_COLS = 80;
const FOOTER_HEIGHT = 3;
const PANE_CHROME_HEIGHT = 3;
const MESSAGE_LINE_PREFIX_WIDTH = 2;
const REPLY_BOX_MIN_HEIGHT = 4;
const REPLY_BOX_MAX_HEIGHT = 7;

function openSourceURL(sourceURL: string): Promise<void> {
  let command: string;
  let args: string[];

  if (process.platform === 'darwin') {
    command = 'open';
    args = [sourceURL];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', sourceURL];
  } else {
    command = 'xdg-open';
    args = [sourceURL];
  }

  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function sortableTimestamp(timestamp: number | undefined): number {
  return typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : Number.NEGATIVE_INFINITY;
}

function getLatestConvoMessage(convo: Convo): Message | null {
  const fallbackLatestMessage =
    convo.messages[convo.messages.length - 1] ?? null;
  if (!fallbackLatestMessage) {
    return null;
  }

  let latestMessage = fallbackLatestMessage;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const message of convo.messages) {
    const messageTimestamp = sortableTimestamp(message.timestamp);
    if (messageTimestamp > latestTimestamp) {
      latestTimestamp = messageTimestamp;
      latestMessage = message;
    }
  }

  return latestMessage;
}

function sortConvosByLatestMessageTimestamp(convos: Convo[]): Convo[] {
  return [...convos].sort((a, b) => {
    const latestB = sortableTimestamp(getLatestConvoMessage(b)?.timestamp);
    const latestA = sortableTimestamp(getLatestConvoMessage(a)?.timestamp);
    if (latestB !== latestA) {
      return latestB - latestA;
    }

    return a.sourceURL.localeCompare(b.sourceURL);
  });
}

function nextFocusPane(pane: FocusPane): FocusPane {
  const index = FOCUS_PANES.indexOf(pane);
  return FOCUS_PANES[(index + 1) % FOCUS_PANES.length] ?? 'inboxes';
}

function previousFocusPane(pane: FocusPane): FocusPane {
  const index = FOCUS_PANES.indexOf(pane);
  return (
    FOCUS_PANES[(index - 1 + FOCUS_PANES.length) % FOCUS_PANES.length] ??
    'inboxes'
  );
}

function getVisibleWindowStart(
  selectedIndex: number,
  itemCount: number,
  visibleHeight: number,
  itemHeight: number,
): number {
  if (itemCount <= 0) {
    return 0;
  }

  const visibleCount = Math.max(1, Math.floor(visibleHeight / itemHeight));
  const maxStart = Math.max(0, itemCount - visibleCount);
  const desiredStart = Math.max(0, selectedIndex - visibleCount + 1);

  return Math.min(maxStart, desiredStart);
}

function getMessageScrollOffsetForSelection(
  selectedMessageIndex: number,
  messageLineStarts: number[],
  messageLineCounts: number[],
  previousScrollOffset: number,
  visibleHeight: number,
  maxScrollOffset: number,
): number {
  if (messageLineStarts.length === 0 || visibleHeight <= 0) {
    return 0;
  }

  const clampedPrevious = Math.min(
    Math.max(0, previousScrollOffset),
    maxScrollOffset,
  );
  const selectedStart = Math.min(
    messageLineStarts[selectedMessageIndex] ?? 0,
    maxScrollOffset,
  );
  const selectedHeight = Math.max(
    1,
    messageLineCounts[selectedMessageIndex] ?? 1,
  );
  const selectedEnd = selectedStart + selectedHeight;

  if (selectedHeight >= visibleHeight) {
    return selectedStart;
  }

  if (selectedStart < clampedPrevious) {
    return selectedStart;
  }

  if (selectedEnd > clampedPrevious + visibleHeight) {
    return Math.min(maxScrollOffset, Math.max(0, selectedEnd - visibleHeight));
  }

  return clampedPrevious;
}

function wrapReplyInputLines(text: string, width: number): string[] {
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

function trimLastCharacter(text: string): string {
  const chars = [...text];
  chars.pop();
  return chars.join('');
}

function getReplyBoxHeight(availableHeight: number): number {
  if (availableHeight <= 1) {
    return 0;
  }

  const preferredHeight = Math.max(
    REPLY_BOX_MIN_HEIGHT,
    Math.floor(availableHeight * 0.35),
  );
  return Math.min(
    REPLY_BOX_MAX_HEIGHT,
    Math.max(1, Math.min(preferredHeight, availableHeight - 1)),
  );
}

function ReplyComposer({
  content,
  mode,
  width,
  height,
  isFocused,
  isSubmitting,
}: {
  content: string;
  mode: ReplyMode;
  width: number;
  height: number;
  isFocused: boolean;
  isSubmitting: boolean;
}) {
  if (height <= 0) {
    return null;
  }

  const bodyLineCount = Math.max(1, height - 2);
  const wrappedLines = wrapReplyInputLines(content, Math.max(1, width - 2));
  const visibleLines = wrappedLines.slice(-bodyLineCount);
  const composerLabel = mode === 'replyAll' ? 'Reply All' : 'Reply';
  const composerVerb = mode === 'replyAll' ? 'reply-all' : 'reply';
  const submittingLabel =
    mode === 'replyAll' ? 'Replying all...' : 'Replying...';
  const renderedVisibleLines: React.ReactNode[] = [];
  const lineOccurrences = new Map<string, number>();

  for (const line of visibleLines) {
    const linePosition = renderedVisibleLines.length;
    const isLastLine = linePosition === visibleLines.length - 1;
    const lineWithCursor = isLastLine ? `${line}|` : line;
    const occurrence = lineOccurrences.get(line) ?? 0;
    lineOccurrences.set(line, occurrence + 1);

    renderedVisibleLines.push(
      <Text key={`reply-line-${line}-${occurrence}`} wrap="truncate-end">
        {lineWithCursor.length > 0 ? lineWithCursor : ' '}
      </Text>,
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'white'}
      height={height}
      paddingX={1}
      overflowY="hidden"
    >
      <Text bold color={isFocused ? 'cyan' : 'white'} wrap="truncate-end">
        {isSubmitting ? submittingLabel : composerLabel}
      </Text>
      {content.length === 0 ? (
        <Text dimColor wrap="truncate-end">
          {`Type ${composerVerb}. Enter = newline. Alt+Enter = submit. Esc = discard.`}
        </Text>
      ) : (
        renderedVisibleLines
      )}
    </Box>
  );
}

function ConvoPreview({ convo }: { convo: Convo }) {
  const messageCountPrefix =
    convo.messages.length > 1 ? `(${convo.messages.length}) ` : '';
  const hasStarredMessage = convo.messages.some(
    (message) => message.hasStar === true,
  );
  const allMessagesArchived =
    convo.messages.length > 0 &&
    convo.messages.every((message) => message.isArchived === true);
  const convoStatusPrefix = `${hasStarredMessage ? '⭐ ' : ''}${allMessagesArchived ? '📦 ' : ''}`;
  const latestMessage = getLatestConvoMessage(convo);
  if (!latestMessage) {
    return (
      <Box flexDirection="column">
        <Text wrap="truncate">
          {`${messageCountPrefix}${convoStatusPrefix}${sanitizeForTerminalText(convo.sourceURL)}`}
        </Text>
        <Text wrap="truncate" dimColor>
          (no messages)
        </Text>
      </Box>
    );
  }

  const authorName =
    latestMessage.author?.displayName ?? latestMessage.author?.username;
  const author = authorName ? sanitizeForTerminalText(authorName) : undefined;
  const subject = latestMessage.subject
    ? sanitizeForTerminalText(latestMessage.subject)
    : undefined;
  const heading =
    author && subject
      ? `${author}, ${subject}`
      : (author ?? subject ?? sanitizeForTerminalText(convo.sourceURL));
  const headingWithStatus = `${messageCountPrefix}${convoStatusPrefix}${heading}`;
  const preview = sanitizeForTerminalText(latestMessage.content)
    .replace(/\n+/g, ' ')
    .trim();

  return (
    <Box flexDirection="column">
      <Text wrap="truncate">{headingWithStatus}</Text>
      <Text wrap="truncate" dimColor>
        {preview.length > 0 ? preview : '(empty message)'}
      </Text>
    </Box>
  );
}

function SelectableList({
  items,
  selectedIndex,
  emptyLabel,
  isFocused,
  visibleHeight,
  itemHeight = 1,
}: {
  items: React.ReactNode[];
  selectedIndex: number;
  emptyLabel: string;
  isFocused: boolean;
  visibleHeight: number;
  itemHeight?: number;
}) {
  if (visibleHeight <= 0) {
    return null;
  }

  if (items.length === 0) {
    return (
      <Text dimColor wrap="truncate-end">
        {emptyLabel}
      </Text>
    );
  }

  const startIndex = getVisibleWindowStart(
    selectedIndex,
    items.length,
    visibleHeight,
    itemHeight,
  );
  const visibleCount = Math.max(1, Math.floor(visibleHeight / itemHeight));
  const visibleItems = items.slice(startIndex, startIndex + visibleCount);

  return (
    <Box flexDirection="column" height={visibleHeight} overflowY="hidden">
      {visibleItems.map((item, rowIndex) => {
        const i = startIndex + rowIndex;
        const isSelected = i === selectedIndex;
        return (
          <Box key={i} flexDirection="row">
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
  height,
}: {
  label: string;
  isFocused: boolean;
  children: React.ReactNode;
  width: string;
  height: number;
}) {
  const headerColor = isFocused ? 'cyan' : 'white';

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'white'}
      overflow="hidden"
    >
      <Box paddingX={1}>
        <Text bold color={headerColor} wrap="truncate-end">
          {label}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} minHeight={0} overflowY="hidden">
        {children}
      </Box>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInboxIndex, setSelectedInboxIndex] = useState(0);
  const [selectedConvoIndex, setSelectedConvoIndex] = useState(0);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<FocusPane>('inboxes');
  const [messageScrollOffset, setMessageScrollOffset] = useState(0);
  const [terminalRows, setTerminalRows] = useState(
    stdout.rows ?? FALLBACK_TERMINAL_ROWS,
  );
  const [terminalCols, setTerminalCols] = useState(
    stdout.columns ?? FALLBACK_TERMINAL_COLS,
  );
  const [status, setStatus] = useState(`Connecting to ${serverURL}...`);
  const [isReplying, setIsReplying] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>('reply');
  const [replyDraft, setReplyDraft] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const currentInbox = inboxes[selectedInboxIndex] ?? null;
  const convos = useMemo(
    () => sortConvosByLatestMessageTimestamp(currentInbox?.convos ?? []),
    [currentInbox],
  );
  const currentConvo = convos[selectedConvoIndex] ?? null;
  const footerHeight = Math.min(FOOTER_HEIGHT, Math.max(3, terminalRows - 3));
  const mainHeight = Math.max(3, terminalRows - footerHeight);
  const paneBodyHeight = Math.max(0, mainHeight - PANE_CHROME_HEIGHT);
  const replyBoxHeight = isReplying ? getReplyBoxHeight(paneBodyHeight) : 0;
  const messageListHeight = Math.max(0, paneBodyHeight - replyBoxHeight);
  const messagePaneContentWidth = Math.max(
    20,
    Math.floor(terminalCols * 0.5) - 7 - MESSAGE_LINE_PREFIX_WIDTH,
  );
  const currentConvoLayout = useMemo(
    () => buildConvoMessageLayout(currentConvo, messagePaneContentWidth),
    [currentConvo, messagePaneContentWidth],
  );
  const currentConvoLines = currentConvoLayout.lines;
  const messageCount = currentConvoLayout.messages.length;
  const currentMessagePosition =
    messageCount > 0 ? clamp(selectedMessageIndex, messageCount) + 1 : 0;
  const messagesPaneLabel = `Messages (${currentMessagePosition} of ${messageCount})`;
  const currentMessage =
    currentConvoLayout.messages[selectedMessageIndex] ?? null;
  const latestConvoMessage = currentConvo
    ? getLatestConvoMessage(currentConvo)
    : null;
  const openSourceTargetMessage =
    focusPane === 'convos'
      ? latestConvoMessage
      : (currentMessage ?? latestConvoMessage);
  const _canOpenSourceURL = !!openSourceTargetMessage;
  const selectedMessageTopLine =
    currentConvoLayout.messageLineStarts[selectedMessageIndex] ?? 0;
  const messageViewScrollOffset = isReplying
    ? selectedMessageTopLine
    : messageScrollOffset;
  const maxMessageScrollOffset = Math.max(
    0,
    currentConvoLines.length - messageListHeight,
  );

  useEffect(() => {
    const handleResize = () => {
      setTerminalRows(stdout.rows ?? FALLBACK_TERMINAL_ROWS);
      setTerminalCols(stdout.columns ?? FALLBACK_TERMINAL_COLS);
    };

    handleResize();
    stdout.on('resize', handleResize);

    return () => {
      stdout.removeListener('resize', handleResize);
    };
  }, [stdout]);

  useEffect(() => {
    setSelectedConvoIndex((prev) => clamp(prev, convos.length));
  }, [convos.length]);

  useEffect(() => {
    if (!currentConvo) {
      setSelectedMessageIndex(0);
      setMessageScrollOffset(0);
      setIsReplying(false);
      setReplyMode('reply');
      setReplyDraft('');
      setIsSubmittingReply(false);
      return;
    }

    setSelectedMessageIndex(0);
    setMessageScrollOffset(0);
    setIsReplying(false);
    setReplyMode('reply');
    setReplyDraft('');
    setIsSubmittingReply(false);
  }, [currentConvo]);

  useEffect(() => {
    setSelectedMessageIndex((prev) => clamp(prev, messageCount));
  }, [messageCount]);

  useEffect(() => {
    if (!currentMessage && isReplying) {
      setIsReplying(false);
      setReplyMode('reply');
      setReplyDraft('');
      setIsSubmittingReply(false);
    }
  }, [currentMessage, isReplying]);

  useEffect(() => {
    setMessageScrollOffset((prev) =>
      getMessageScrollOffsetForSelection(
        selectedMessageIndex,
        currentConvoLayout.messageLineStarts,
        currentConvoLayout.messageLineCounts,
        prev,
        messageListHeight,
        maxMessageScrollOffset,
      ),
    );
  }, [
    selectedMessageIndex,
    currentConvoLayout.messageLineStarts,
    currentConvoLayout.messageLineCounts,
    messageListHeight,
    maxMessageScrollOffset,
  ]);

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
    (inbox) =>
      `${sanitizeForTerminalText(inbox.displayName)} (${inbox.convos.length})`,
  );
  const convoItems = convos.map((convo) => (
    <ConvoPreview key={convo.id} convo={convo} />
  ));

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (!isReplying && input === '?') {
      setIsHelpModalOpen((prev) => !prev);
      return;
    }

    if (isHelpModalOpen) {
      if (key.escape) {
        setIsHelpModalOpen(false);
      }
      return;
    }

    if (isReplying) {
      const replyModeLabel = replyMode === 'replyAll' ? 'reply-all' : 'reply';

      if (key.escape && !isSubmittingReply) {
        setIsReplying(false);
        setReplyMode('reply');
        setReplyDraft('');
        setStatus(`Discarded draft ${replyModeLabel}.`);
        return;
      }

      if (isSubmittingReply) {
        return;
      }

      if (key.return && key.meta) {
        if (!currentMessage) {
          setIsReplying(false);
          setReplyDraft('');
          setStatus('No message selected.');
          return;
        }

        if (!replyDraft.trim()) {
          setStatus('Reply cannot be empty.');
          return;
        }

        const replyTarget = currentMessage;
        const replyContent = replyDraft;
        const replyActionLabel =
          replyMode === 'replyAll' ? 'reply-all' : 'reply';
        setIsSubmittingReply(true);
        setStatus(
          `Sending ${replyActionLabel} to message "${replyTarget.id}"...`,
        );

        void (async () => {
          try {
            if (replyMode === 'replyAll') {
              await api.replyAllToMessage(replyTarget.sourceURL, replyContent);
            } else {
              await api.replyToMessage(replyTarget.sourceURL, replyContent);
            }
            setIsReplying(false);
            setReplyMode('reply');
            setReplyDraft('');
            await refreshData(
              `Sent ${replyActionLabel} to message "${replyTarget.id}".`,
            );
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error);
            setStatus(`${replyActionLabel} failed: ${detail}`);
          } finally {
            setIsSubmittingReply(false);
          }
        })();
        return;
      }

      if (key.return) {
        setReplyDraft((prev) => `${prev}\n`);
        return;
      }

      if (key.backspace || key.delete) {
        setReplyDraft((prev) => trimLastCharacter(prev));
        return;
      }

      if (key.tab) {
        setReplyDraft((prev) => `${prev}\t`);
        return;
      }

      if (
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.pageUp ||
        key.pageDown ||
        key.home ||
        key.end ||
        key.ctrl ||
        key.meta
      ) {
        return;
      }

      if (input.length > 0) {
        setReplyDraft((prev) => `${prev}${input}`);
      }
      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (key.tab) {
      setFocusPane((prev) => nextFocusPane(prev));
      return;
    }

    if (key.leftArrow || input === 'h') {
      setFocusPane((prev) => previousFocusPane(prev));
      return;
    }
    if (key.rightArrow || input === 'l') {
      setFocusPane((prev) => nextFocusPane(prev));
      return;
    }

    if (key.upArrow || input === 'k') {
      if (focusPane === 'inboxes') {
        setSelectedInboxIndex((prev) => {
          const next = clamp(prev - 1, inboxes.length);
          if (next !== prev) setSelectedConvoIndex(0);
          return next;
        });
      } else if (focusPane === 'convos') {
        setSelectedConvoIndex((prev) => clamp(prev - 1, convos.length));
      } else {
        setSelectedMessageIndex((prev) => clamp(prev - 1, messageCount));
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
      } else if (focusPane === 'convos') {
        setSelectedConvoIndex((prev) => clamp(prev + 1, convos.length));
      } else {
        setSelectedMessageIndex((prev) => clamp(prev + 1, messageCount));
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
      setStatus(
        `Fetching providers for inbox "${currentInbox.displayName}"...`,
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
      setStatus(
        `Clearing messages from inbox "${currentInbox.displayName}"...`,
      );
      void (async () => {
        try {
          const result = await api.clearInbox(currentInbox.id);
          setSelectedConvoIndex(0);
          await refreshData(
            `Cleared ${result.deleted} conversation(s) from inbox "${currentInbox.displayName}".`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Clear failed: ${detail}`);
        }
      })();
      return;
    }

    if (input === 'r') {
      if (!currentMessage) {
        setStatus('No message selected.');
        return;
      }

      setFocusPane('messages');
      setReplyMode('reply');
      setReplyDraft('');
      setIsSubmittingReply(false);
      setIsReplying(true);
      setStatus(
        `Composing reply to message "${currentMessage.id}". Alt+Enter sends, Esc discards.`,
      );
      return;
    }

    if (input === 'a') {
      if (!currentMessage) {
        setStatus('No message selected.');
        return;
      }

      setFocusPane('messages');
      setReplyMode('replyAll');
      setReplyDraft('');
      setIsSubmittingReply(false);
      setIsReplying(true);
      setStatus(
        `Composing reply-all to message "${currentMessage.id}". Alt+Enter sends, Esc discards.`,
      );
      return;
    }

    if (input === 's') {
      if (!currentMessage) {
        setStatus('No message selected.');
        return;
      }

      const nextStarred = !(currentMessage.hasStar ?? false);
      setStatus(
        `${nextStarred ? 'Starring' : 'Unstarring'} message "${currentMessage.id}"...`,
      );

      void (async () => {
        try {
          await api.setMessageStar(currentMessage.sourceURL, nextStarred);
          await refreshData(
            `${nextStarred ? 'Starred' : 'Unstarred'} message "${currentMessage.id}".`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Star toggle failed: ${detail}`);
        }
      })();
      return;
    }

    if (input === 'e') {
      if (!currentMessage) {
        setStatus('No message selected.');
        return;
      }

      const nextArchived = !(currentMessage.isArchived ?? false);
      setStatus(
        `${nextArchived ? 'Archiving' : 'Unarchiving'} message "${currentMessage.id}"...`,
      );

      void (async () => {
        try {
          await api.setMessageArchived(currentMessage.sourceURL, nextArchived);
          await refreshData(
            `${nextArchived ? 'Archived' : 'Unarchived'} message "${currentMessage.id}".`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Archive toggle failed: ${detail}`);
        }
      })();
      return;
    }

    if (input === 'v') {
      if (!openSourceTargetMessage) {
        return;
      }

      setStatus(
        `Opening source URL for message "${openSourceTargetMessage.id}"...`,
      );
      void (async () => {
        try {
          await openSourceURL(openSourceTargetMessage.sourceURL);
          setStatus(
            `Opened source URL for message "${openSourceTargetMessage.id}".`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setStatus(`Open source failed: ${detail}`);
        }
      })();
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%" overflow="hidden">
      <Box flexGrow={1} height={mainHeight} overflow="hidden">
        <Pane
          label="Inboxes"
          isFocused={focusPane === 'inboxes'}
          width="20%"
          height={mainHeight}
        >
          <SelectableList
            items={inboxItems}
            selectedIndex={selectedInboxIndex}
            emptyLabel="(no inboxes)"
            isFocused={focusPane === 'inboxes'}
            visibleHeight={paneBodyHeight}
          />
        </Pane>
        <Pane
          label="Convos"
          isFocused={focusPane === 'convos'}
          width="30%"
          height={mainHeight}
        >
          <SelectableList
            items={convoItems}
            selectedIndex={selectedConvoIndex}
            emptyLabel=" (no convos)"
            isFocused={focusPane === 'convos'}
            visibleHeight={paneBodyHeight}
            itemHeight={2}
          />
        </Pane>
        <Pane
          label={messagesPaneLabel}
          isFocused={focusPane === 'messages'}
          width="50%"
          height={mainHeight}
        >
          <Box flexDirection="column" flexGrow={1} minHeight={0}>
            {isReplying && replyBoxHeight > 0 ? (
              <ReplyComposer
                content={replyDraft}
                mode={replyMode}
                width={messagePaneContentWidth + MESSAGE_LINE_PREFIX_WIDTH}
                height={replyBoxHeight}
                isFocused={focusPane === 'messages'}
                isSubmitting={isSubmittingReply}
              />
            ) : null}
            <MessagesView
              convo={currentConvo}
              lines={currentConvoLines}
              height={messageListHeight}
              scrollOffset={messageViewScrollOffset}
              selectedMessageIndex={selectedMessageIndex}
              isFocused={focusPane === 'messages'}
              allowBottomPadding={isReplying}
            />
          </Box>
        </Pane>
      </Box>
      <Footer status={status} height={footerHeight} />
      {isHelpModalOpen ? (
        <HelpModal
          inbox={currentInbox}
          convo={currentConvo}
          message={currentMessage}
          terminalRows={terminalRows}
        />
      ) : null}
    </Box>
  );
}

render(<App />, { alternateScreen: true });
