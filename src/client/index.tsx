import { execFile } from 'node:child_process';
import { Box, render, Text, useApp, useInput, useStdout } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Convo, Inbox, Message } from '../shared/types.js';
import { MessagesApi } from './api.js';
import { buildConvoMessageLayout, MessagesView } from './messages-view.js';
import { sanitizeForTerminalText } from './terminal-text.js';

const serverURL = process.env.MESSAGES_SERVER_URL ?? 'http://localhost:3000';
const api = new MessagesApi(serverURL);

type FocusPane = 'inboxes' | 'convos' | 'messages';

const FOCUS_PANES: FocusPane[] = ['inboxes', 'convos', 'messages'];
const FALLBACK_TERMINAL_ROWS = 24;
const FALLBACK_TERMINAL_COLS = 80;
const FOOTER_HEIGHT = 5;
const PANE_CHROME_HEIGHT = 3;
const MESSAGE_LINE_PREFIX_WIDTH = 2;

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

function ConvoPreview({ convo }: { convo: Convo }) {
  const hasStarredMessage = convo.messages.some(
    (message) => message.hasStar === true,
  );
  const allMessagesArchived =
    convo.messages.length > 0 &&
    convo.messages.every((message) => message.isArchived === true);
  const convoStatusPrefix = `${hasStarredMessage ? '⭐ ' : ''}${allMessagesArchived ? '📦 ' : ''}`;
  const lastMessage = convo.messages[convo.messages.length - 1];
  if (!lastMessage) {
    return (
      <Box flexDirection="column">
        <Text wrap="truncate">
          {`${convoStatusPrefix}${sanitizeForTerminalText(convo.sourceURL)}`}
        </Text>
        <Text wrap="truncate" dimColor>
          (no messages)
        </Text>
      </Box>
    );
  }

  const authorName =
    lastMessage.author?.displayName ?? lastMessage.author?.username;
  const author = authorName ? sanitizeForTerminalText(authorName) : undefined;
  const subject = lastMessage.subject
    ? sanitizeForTerminalText(lastMessage.subject)
    : undefined;
  const heading =
    author && subject
      ? `${author}, ${subject}`
      : (author ?? subject ?? sanitizeForTerminalText(convo.sourceURL));
  const headingWithStatus = `${convoStatusPrefix}${heading}`;
  const preview = sanitizeForTerminalText(lastMessage.content)
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

function Footer({
  status,
  inbox,
  convo,
  message,
  canOpenSourceURL,
  height,
}: {
  status: string;
  inbox: Inbox | null;
  convo: Convo | null;
  message: Message | null;
  canOpenSourceURL: boolean;
  height: number;
}) {
  const safeStatus = sanitizeForTerminalText(status);
  const keyHints = [
    '↑/↓ move',
    'tab switch pane',
    '←/→ jump pane',
    'R refresh',
    'f fetch',
    'c clear inbox',
    's toggle star',
    'e toggle archive',
  ];
  if (canOpenSourceURL) {
    keyHints.push('o open source');
  }
  keyHints.push('q quit');
  const inboxLabel = inbox
    ? `Selected inbox: ${sanitizeForTerminalText(inbox.id)}`
    : 'Selected inbox: (none)';
  const convoLabel = convo
    ? `Selected convo: ${sanitizeForTerminalText(convo.sourceURL)}`
    : 'Selected convo: (none)';
  const messageLabel = message
    ? `Selected message: ${sanitizeForTerminalText(message.id)}`
    : 'Selected message: (none)';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="white"
      paddingX={1}
      height={height}
      overflow="hidden"
    >
      <Text wrap="truncate-end">{safeStatus}</Text>
      <Text wrap="truncate-end">
        <Text bold>Keys: </Text>
        {keyHints.join(' · ')}
      </Text>
      <Text wrap="truncate-end">
        {inboxLabel} · {convoLabel} · {messageLabel}
      </Text>
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

  const currentInbox = inboxes[selectedInboxIndex] ?? null;
  const convos = currentInbox?.convos ?? [];
  const currentConvo = convos[selectedConvoIndex] ?? null;
  const footerHeight = Math.min(FOOTER_HEIGHT, Math.max(3, terminalRows - 3));
  const mainHeight = Math.max(3, terminalRows - footerHeight);
  const paneBodyHeight = Math.max(0, mainHeight - PANE_CHROME_HEIGHT);
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
  const currentMessage =
    currentConvoLayout.messages[selectedMessageIndex] ?? null;
  const latestConvoMessage =
    currentConvo?.messages[currentConvo.messages.length - 1] ?? null;
  const openSourceTargetMessage =
    focusPane === 'convos'
      ? latestConvoMessage
      : (currentMessage ?? latestConvoMessage);
  const canOpenSourceURL = !!openSourceTargetMessage;
  const maxMessageScrollOffset = Math.max(
    0,
    currentConvoLines.length - paneBodyHeight,
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
      return;
    }

    setSelectedMessageIndex(0);
    setMessageScrollOffset(0);
  }, [currentConvo]);

  useEffect(() => {
    setSelectedMessageIndex((prev) => clamp(prev, messageCount));
  }, [messageCount]);

  useEffect(() => {
    setMessageScrollOffset((prev) =>
      getMessageScrollOffsetForSelection(
        selectedMessageIndex,
        currentConvoLayout.messageLineStarts,
        currentConvoLayout.messageLineCounts,
        prev,
        paneBodyHeight,
        maxMessageScrollOffset,
      ),
    );
  }, [
    selectedMessageIndex,
    currentConvoLayout.messageLineStarts,
    currentConvoLayout.messageLineCounts,
    paneBodyHeight,
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
    (inbox) => `${sanitizeForTerminalText(inbox.id)} (${inbox.convos.length})`,
  );
  const convoItems = convos.map((convo) => (
    <ConvoPreview key={convo.id} convo={convo} />
  ));

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
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
      setStatus(`Fetching providers for inbox "${currentInbox.id}"...`);
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

    if (input === 'o') {
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
            emptyLabel="(no convos)"
            isFocused={focusPane === 'convos'}
            visibleHeight={paneBodyHeight}
            itemHeight={2}
          />
        </Pane>
        <Pane
          label="Messages"
          isFocused={focusPane === 'messages'}
          width="50%"
          height={mainHeight}
        >
          <Box
            flexDirection="column"
            flexGrow={1}
            minHeight={0}
            paddingLeft={1}
          >
            <MessagesView
              convo={currentConvo}
              lines={currentConvoLines}
              height={paneBodyHeight}
              scrollOffset={messageScrollOffset}
              selectedMessageIndex={selectedMessageIndex}
              isFocused={focusPane === 'messages'}
            />
          </Box>
        </Pane>
      </Box>
      <Footer
        status={status}
        inbox={currentInbox}
        convo={currentConvo}
        message={currentMessage}
        canOpenSourceURL={canOpenSourceURL}
        height={footerHeight}
      />
    </Box>
  );
}

render(<App />, { alternateScreen: true });
