import blessed from 'blessed';
import type { Convo, Inbox } from '../shared/types';
import { MessagesApi } from './api';

type FocusPane = 'inboxes' | 'threads';

interface AppState {
  inboxes: Inbox[];
  selectedInboxIndex: number;
  selectedThreadIndex: number;
  focusPane: FocusPane;
  status: string;
}

const serverURL = process.env.MESSAGES_SERVER_URL ?? 'http://localhost:3000';
const api = new MessagesApi(serverURL);

const state: AppState = {
  inboxes: [],
  selectedInboxIndex: 0,
  selectedThreadIndex: 0,
  focusPane: 'inboxes',
  status: `Connecting to ${serverURL}...`,
};

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: 'Messages TUI',
});

const inboxList = blessed.list({
  parent: screen,
  top: 0,
  left: 0,
  width: '25%',
  height: '85%',
  border: 'line',
  label: ' Inboxes ',
  mouse: true,
  tags: true,
  style: {
    border: { fg: 'white' },
    selected: {
      bg: 'blue',
      fg: 'white',
    },
  },
});

const threadList = blessed.list({
  parent: screen,
  top: 0,
  left: '25%',
  width: '30%',
  height: '85%',
  border: 'line',
  label: ' Threads ',
  mouse: true,
  tags: true,
  style: {
    border: { fg: 'white' },
    selected: {
      bg: 'blue',
      fg: 'white',
    },
  },
});

const messagesBox = blessed.box({
  parent: screen,
  top: 0,
  left: '55%',
  width: '45%',
  height: '85%',
  border: 'line',
  label: ' Messages ',
  tags: true,
  mouse: true,
  keys: true,
  vi: true,
  scrollable: true,
  alwaysScroll: true,
  style: {
    border: { fg: 'white' },
  },
  scrollbar: {
    ch: ' ',
    style: {
      bg: 'cyan',
    },
  },
});

const footerBox = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: '15%',
  border: 'line',
  label: ' Status ',
  tags: true,
  content: state.status,
  style: {
    border: { fg: 'white' },
  },
});

function escapeTags(value: string): string {
  return value.replaceAll('{', '\\{').replaceAll('}', '\\}');
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function currentInbox(): Inbox | null {
  return state.inboxes[state.selectedInboxIndex] ?? null;
}

function currentThreads(): Convo[] {
  return currentInbox()?.threads ?? [];
}

function currentThread(): Convo | null {
  const threads = currentThreads();
  return threads[state.selectedThreadIndex] ?? null;
}

function setStatus(message: string): void {
  state.status = message;
}

function renderInboxes(): void {
  const items = state.inboxes.map(
    (inbox) => `${escapeTags(inbox.id)} (${inbox.threads.length})`,
  );
  inboxList.setItems(
    items.length > 0 ? items : ['{gray-fg}(no inboxes){/gray-fg}'],
  );

  if (items.length > 0) {
    inboxList.select(state.selectedInboxIndex);
  } else {
    inboxList.select(0);
  }
}

function renderThreads(): void {
  const threads = currentThreads();
  const items = threads.map(
    (thread) => `${escapeTags(thread.sourceURL)} (${thread.messages.length})`,
  );
  threadList.setItems(
    items.length > 0 ? items : ['{gray-fg}(no threads){/gray-fg}'],
  );

  if (items.length > 0) {
    threadList.select(state.selectedThreadIndex);
  } else {
    threadList.select(0);
  }
}

function renderMessages(): void {
  const thread = currentThread();
  if (!thread) {
    messagesBox.setContent(
      '{gray-fg}Select a thread to read messages.{/gray-fg}',
    );
    return;
  }

  if (thread.messages.length === 0) {
    messagesBox.setContent('{gray-fg}No messages in this thread.{/gray-fg}');
    return;
  }

  const content = thread.messages
    .map(
      (message, index) =>
        `{bold}${index + 1}. ${escapeTags(message.sourceURL)}{/bold}\n${escapeTags(message.content)}`,
    )
    .join('\n\n');

  messagesBox.setContent(content);
  messagesBox.setScrollPerc(100);
}

function renderFooter(): void {
  const selectedThread = currentThread();
  const selectedThreadLabel = selectedThread
    ? `Selected thread: ${selectedThread.sourceURL}`
    : 'Selected thread: (none)';

  footerBox.setContent(
    [
      escapeTags(state.status),
      '{bold}Keys{/bold}: ↑/↓ move · tab switch pane · R refresh · q quit',
      escapeTags(selectedThreadLabel),
    ].join('\n'),
  );
}

function renderBorders(): void {
  inboxList.style.border.fg = state.focusPane === 'inboxes' ? 'cyan' : 'white';
  threadList.style.border.fg = state.focusPane === 'threads' ? 'cyan' : 'white';
}

function renderAll(): void {
  renderInboxes();
  renderThreads();
  renderMessages();
  renderFooter();
  renderBorders();
  screen.render();
}

function syncThreadSelection(): void {
  state.selectedThreadIndex = clampIndex(
    state.selectedThreadIndex,
    currentThreads().length,
  );
}

function moveSelection(step: number): void {
  if (state.focusPane === 'inboxes') {
    if (state.inboxes.length === 0) {
      return;
    }

    state.selectedInboxIndex = clampIndex(
      state.selectedInboxIndex + step,
      state.inboxes.length,
    );
    state.selectedThreadIndex = 0;
    renderAll();
    return;
  }

  const threads = currentThreads();
  if (threads.length === 0) {
    return;
  }

  state.selectedThreadIndex = clampIndex(
    state.selectedThreadIndex + step,
    threads.length,
  );
  renderAll();
}

function cycleFocusPane(): void {
  state.focusPane = state.focusPane === 'inboxes' ? 'threads' : 'inboxes';
  renderAll();
}

async function refreshData(statusMessage: string): Promise<void> {
  const previousThread = currentThread()?.sourceURL;

  try {
    state.inboxes = await api.listInboxes();
    state.selectedInboxIndex = clampIndex(
      state.selectedInboxIndex,
      state.inboxes.length,
    );

    if (previousThread) {
      const inbox = currentInbox();
      if (inbox) {
        const nextThreadIndex = inbox.threads.findIndex(
          (thread) => thread.sourceURL === previousThread,
        );
        if (nextThreadIndex >= 0) {
          state.selectedThreadIndex = nextThreadIndex;
        }
      }
    }

    syncThreadSelection();
    setStatus(statusMessage);

    if (state.inboxes.length === 0) {
      setStatus('No inboxes found. Run `pnpm db:seed` to load demo data.');
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to load data from ${serverURL}: ${detail}`);
  }

  renderAll();
}

screen.key(['q', 'C-c'], () => {
  screen.destroy();
  process.exit(0);
});

screen.key(['tab'], () => {
  cycleFocusPane();
});

screen.key(['left', 'h'], () => {
  state.focusPane = 'inboxes';
  renderAll();
});

screen.key(['right', 'l'], () => {
  state.focusPane = 'threads';
  renderAll();
});

screen.key(['up', 'k'], () => {
  moveSelection(-1);
});

screen.key(['down', 'j'], () => {
  moveSelection(1);
});

screen.key(['R'], () => {
  void refreshData('Inboxes refreshed from server.');
});

inboxList.on('select', (_item, index) => {
  if (typeof index !== 'number') {
    return;
  }

  state.selectedInboxIndex = clampIndex(index, state.inboxes.length);
  state.selectedThreadIndex = 0;
  state.focusPane = 'inboxes';
  renderAll();
});

threadList.on('select', (_item, index) => {
  if (typeof index !== 'number') {
    return;
  }

  state.selectedThreadIndex = clampIndex(index, currentThreads().length);
  state.focusPane = 'threads';
  renderAll();
});

void refreshData('Loaded inboxes.');
