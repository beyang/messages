import blessed from 'blessed';
import type { Convo, Inbox } from '../shared/types';
import { MessagesApi } from './api';

type FocusPane = 'inboxes' | 'convos';

const FOOTER_HEIGHT = 6;
const MAIN_PANE_HEIGHT = `100%-${FOOTER_HEIGHT}`;

interface AppState {
  inboxes: Inbox[];
  selectedInboxIndex: number;
  selectedConvoIndex: number;
  focusPane: FocusPane;
  status: string;
}

const serverURL = process.env.MESSAGES_SERVER_URL ?? 'http://localhost:3000';
const api = new MessagesApi(serverURL);

const state: AppState = {
  inboxes: [],
  selectedInboxIndex: 0,
  selectedConvoIndex: 0,
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
  height: MAIN_PANE_HEIGHT,
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

const convoList = blessed.list({
  parent: screen,
  top: 0,
  left: '25%',
  width: '30%',
  height: MAIN_PANE_HEIGHT,
  border: 'line',
  label: ' Convos ',
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
  height: MAIN_PANE_HEIGHT,
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
  height: FOOTER_HEIGHT,
  border: 'line',
  label: ' Status ',
  tags: true,
  wrap: true,
  content: state.status,
  style: {
    border: { fg: 'white' },
  },
});

function escapeTags(value: string): string {
  return value
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('\t', '    ');
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

function currentConvos(): Convo[] {
  return currentInbox()?.convos ?? [];
}

function currentConvo(): Convo | null {
  const convos = currentConvos();
  return convos[state.selectedConvoIndex] ?? null;
}

function setStatus(message: string): void {
  state.status = message;
}

function renderInboxes(): void {
  const items = state.inboxes.map(
    (inbox) => `${escapeTags(inbox.id)} (${inbox.convos.length})`,
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

function renderConvos(): void {
  const convos = currentConvos();
  const items = convos.map((convo) => {
    const firstSubject = convo.messages.find((m) => m.subject)?.subject;
    const label = firstSubject
      ? escapeTags(firstSubject)
      : escapeTags(convo.sourceURL);
    return `${label} (${convo.messages.length})`;
  });
  convoList.setItems(
    items.length > 0 ? items : ['{gray-fg}(no convos){/gray-fg}'],
  );

  if (items.length > 0) {
    convoList.select(state.selectedConvoIndex);
  } else {
    convoList.select(0);
  }
}

/** Tracks the currently rendered convo so we only reset scroll position when the user switches to a different convo, not on every re-render. */
let lastRenderedConvoSourceURL: string | null = null;

function renderMessages(): void {
  const convo = currentConvo();
  if (!convo) {
    lastRenderedConvoSourceURL = null;
    messagesBox.setContent(
      '{gray-fg}Select a convo to read messages.{/gray-fg}',
    );
    return;
  }

  if (convo.messages.length === 0) {
    lastRenderedConvoSourceURL = convo.sourceURL;
    messagesBox.setContent('{gray-fg}No messages in this convo.{/gray-fg}');
    return;
  }

  const content = convo.messages
    .map(
      (message, index) =>
        `{bold}${index + 1}. ${escapeTags(message.sourceURL)}{/bold}\n${escapeTags(message.content)}`,
    )
    .join('\n\n');

  const convoChanged = lastRenderedConvoSourceURL !== convo.sourceURL;
  lastRenderedConvoSourceURL = convo.sourceURL;

  messagesBox.setContent(content);
  if (convoChanged) {
    messagesBox.scrollTo(0);
  }
}

function renderFooter(): void {
  const selectedConvo = currentConvo();
  const selectedConvoLabel = selectedConvo
    ? `Selected convo: ${selectedConvo.sourceURL}`
    : 'Selected convo: (none)';

  const inbox = currentInbox();
  const providerLabel = inbox
    ? `Providers: ${inbox.providers.length > 0 ? inbox.providers.map((p) => `${p.id}(${p.type})`).join(', ') : '(none)'}`
    : 'Providers: (no inbox selected)';

  footerBox.setContent(
    [
      escapeTags(state.status),
      '{bold}Keys{/bold}: ↑/↓ move · tab switch pane · R refresh · f fetch · c clear inbox · p add provider · q quit',
      escapeTags(`${providerLabel} · ${selectedConvoLabel}`),
    ].join('\n'),
  );
}

function renderBorders(): void {
  inboxList.style.border.fg = state.focusPane === 'inboxes' ? 'cyan' : 'white';
  convoList.style.border.fg = state.focusPane === 'convos' ? 'cyan' : 'white';
}

function renderAll(): void {
  renderInboxes();
  renderConvos();
  renderMessages();
  renderFooter();
  renderBorders();
  screen.render();
}

function syncConvoSelection(): void {
  state.selectedConvoIndex = clampIndex(
    state.selectedConvoIndex,
    currentConvos().length,
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
    state.selectedConvoIndex = 0;
    renderAll();
    return;
  }

  const convos = currentConvos();
  if (convos.length === 0) {
    return;
  }

  state.selectedConvoIndex = clampIndex(
    state.selectedConvoIndex + step,
    convos.length,
  );
  renderAll();
}

function cycleFocusPane(): void {
  state.focusPane = state.focusPane === 'inboxes' ? 'convos' : 'inboxes';
  renderAll();
}

async function refreshData(statusMessage: string): Promise<void> {
  const previousConvo = currentConvo()?.sourceURL;

  try {
    state.inboxes = await api.listInboxes();
    state.selectedInboxIndex = clampIndex(
      state.selectedInboxIndex,
      state.inboxes.length,
    );

    if (previousConvo) {
      const inbox = currentInbox();
      if (inbox) {
        const nextConvoIndex = inbox.convos.findIndex(
          (convo) => convo.sourceURL === previousConvo,
        );
        if (nextConvoIndex >= 0) {
          state.selectedConvoIndex = nextConvoIndex;
        }
      }
    }

    syncConvoSelection();
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
  state.focusPane = 'convos';
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

screen.key(['f'], () => {
  const inbox = currentInbox();
  if (!inbox) {
    setStatus('No inbox selected.');
    renderAll();
    return;
  }

  if (inbox.providers.length === 0) {
    setStatus('No providers configured for this inbox. Press "p" to add one.');
    renderAll();
    return;
  }

  void (async () => {
    try {
      setStatus(`Fetching from ${inbox.providers.length} provider(s)...`);
      renderAll();
      const result = await api.fetchProviders(inbox.id);
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
      renderAll();
    }
  })();
});

screen.key(['c'], () => {
  const inbox = currentInbox();
  if (!inbox) {
    setStatus('No inbox selected.');
    renderAll();
    return;
  }

  void (async () => {
    try {
      setStatus(`Clearing messages from inbox "${inbox.id}"...`);
      renderAll();
      const result = await api.clearInbox(inbox.id);
      state.selectedConvoIndex = 0;
      await refreshData(
        `Cleared ${result.deleted} conversation(s) from inbox "${inbox.id}".`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus(`Clear failed: ${detail}`);
      renderAll();
    }
  })();
});

screen.key(['p'], () => {
  const inbox = currentInbox();
  if (!inbox) {
    setStatus('No inbox selected.');
    renderAll();
    return;
  }

  const prompt = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 'shrink',
    border: 'line',
    label: ' Add Provider ',
    style: { border: { fg: 'cyan' } },
  });

  prompt.input('Provider ID:', '', (_err, providerId) => {
    if (!providerId || providerId.trim() === '') {
      prompt.destroy();
      renderAll();
      return;
    }

    const typePrompt = blessed.prompt({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: 'line',
      label: ' Provider Type ',
      style: { border: { fg: 'cyan' } },
    });

    typePrompt.input(
      'Provider type (e.g. dummy):',
      'dummy',
      (_err2, providerType) => {
        typePrompt.destroy();
        if (!providerType || providerType.trim() === '') {
          renderAll();
          return;
        }

        void (async () => {
          try {
            await api.createProvider(
              inbox.id,
              providerId.trim(),
              providerType.trim(),
            );
            setStatus(`Provider "${providerId.trim()}" added.`);
            await refreshData(`Provider "${providerId.trim()}" added.`);
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error);
            setStatus(`Failed to add provider: ${detail}`);
            renderAll();
          }
        })();
      },
    );
  });
});

inboxList.on('select', (_item, index) => {
  if (typeof index !== 'number') {
    return;
  }

  state.selectedInboxIndex = clampIndex(index, state.inboxes.length);
  state.selectedConvoIndex = 0;
  state.focusPane = 'inboxes';
  renderAll();
});

convoList.on('select', (_item, index) => {
  if (typeof index !== 'number') {
    return;
  }

  state.selectedConvoIndex = clampIndex(index, currentConvos().length);
  state.focusPane = 'convos';
  renderAll();
});

void refreshData('Loaded inboxes.');
