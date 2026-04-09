<script lang="ts">
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { onMount } from 'svelte';

let {
  value = $bindable(''),
  oncancel,
}: {
  value: string;
  oncancel?: () => void;
} = $props();

let container: HTMLDivElement | undefined = $state();
let view: EditorView | undefined;

onMount(() => {
  if (!container) return;

  const darkTheme = EditorView.theme({
    '&': {
      fontSize: '0.8rem',
      minHeight: '3rem',
      maxHeight: '20rem',
      border: '1px solid #3b82f6',
      borderRadius: '4px',
      overflow: 'auto',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, monospace',
      padding: '0.3rem 0',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  });

  view = new EditorView({
    state: EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        json(),
        oneDark,
        darkTheme,
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              oncancel?.();
              return true;
            },
          },
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: { docChanged: boolean; state: EditorState }) => {
          if (update.docChanged) {
            value = update.state.doc.toString();
          }
        }),
      ],
    }),
    parent: container,
  });

  view.focus();

  return () => {
    view?.destroy();
  };
});
</script>

<div bind:this={container} class="cm-wrapper"></div>

<style>
  .cm-wrapper {
    width: 100%;
    min-width: 200px;
  }
</style>
