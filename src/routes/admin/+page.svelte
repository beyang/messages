<script lang="ts">
import { tick } from 'svelte';
import type { ActionData, PageData } from './$types';

let { data, form }: { data: PageData; form: ActionData } = $props();
let showModal = $state(false);
let showInboxModal = $state(false);
let selectedType = $state('dummy');
let providerIdInput = $state<HTMLInputElement | undefined>();
let inboxIdInput = $state<HTMLInputElement | undefined>();

let gmailEmail = $state('');
let gmailSearchQuery = $state('');

let argsJson = $derived.by(() => {
  if (selectedType === 'gmail') {
    return JSON.stringify({
      email: gmailEmail,
      searchQuery: gmailSearchQuery,
    });
  }
  return '';
});

function resetModal() {
  selectedType = 'dummy';
  gmailEmail = '';
  gmailSearchQuery = '';
}

async function openProviderModal() {
  showModal = true;
  await tick();
  providerIdInput?.focus();
}

function closeProviderModal() {
  showModal = false;
  resetModal();
}

async function openInboxModal() {
  showInboxModal = true;
  await tick();
  inboxIdInput?.focus();
}

function closeInboxModal() {
  showInboxModal = false;
}

let showAuthModal = $state(false);
let authProviderId = $state('');
let authError = $state('');

let allProviders = $derived(
  data.inboxProviders.flatMap((inbox) =>
    inbox.providers.map((p) => ({ ...p, inboxId: inbox.inboxId })),
  ),
);

function openAuthModal() {
  authError = '';
  authProviderId = allProviders[0]?.id ?? '';
  showAuthModal = true;
}

function closeAuthModal() {
  showAuthModal = false;
}

async function startAuth() {
  if (!authProviderId) return;
  authError = '';
  const res = await fetch(`/api/oauth/gmail?provider_id=${encodeURIComponent(authProviderId)}`);
  const body = await res.json();
  if (!res.ok) {
    authError = body.error ?? 'Failed to start auth.';
    return;
  }
  window.location.href = body.url;
}
</script>

<svelte:head>
  <title>Admin</title>
</svelte:head>

<div class="admin">
  <h1>
    Admin
    <span class="header-actions">
      <button type="button" class="add-btn" onclick={openInboxModal}>Add Inbox</button>
      <button type="button" class="add-btn" onclick={openProviderModal}>Add Provider</button>
      <button type="button" class="add-btn" onclick={openAuthModal}>Authorize</button>
    </span>
  </h1>

  {#if form?.error || data.authError}
    <div class="flash error">{form?.error ?? data.authError}</div>
  {/if}
  {#if form?.success || data.authSuccess}
    <div class="flash success">{form?.success ?? data.authSuccess}</div>
  {/if}

  {#each Object.entries(data.tables) as [name, table]}
    <section class="table-section">
      <h2>{name} <span class="count">({table.total} rows)</span></h2>

      {#if table.rows.length === 0}
        <p class="empty">No rows.</p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                {#each table.columns as col}
                  <th>{col}</th>
                {/each}
                {#if name === 'inbox'}
                  <th></th>
                {/if}
              </tr>
            </thead>
            <tbody>
              {#each table.rows as row}
                <tr>
                  {#each table.columns as col}
                    <td><pre>{(() => { const v = String(row[col] ?? ''); try { const p = JSON.parse(v); return typeof p === 'object' && p !== null ? JSON.stringify(p, null, 2) : v; } catch { return v; } })()}</pre></td>
                  {/each}
                  {#if name === 'inbox'}
                    <td>
                      <form method="POST" action="?/deleteInbox" class="inline-form">
                        <input type="hidden" name="inboxId" value={String(row.id ?? '')} />
                        <button type="submit" class="delete-btn">Delete</button>
                      </form>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if table.total > table.pageSize}
          <div class="pagination">
            {#each Array.from({ length: Math.ceil(table.total / table.pageSize) }, (_, i) => i + 1) as p}
              <a
                href="?{new URLSearchParams(Object.entries(data.tables).map(([n, t]) => [`${n}_page`, String(n === name ? p : t.page)])).toString()}"
                class:active={p === table.page}
              >
                {p}
              </a>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  {/each}
</div>

{#if showModal}
  <div class="overlay" onclick={closeProviderModal} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <h2>Add Provider</h2>
      <form method="POST" action="?/addProvider">
        <label>
          Inbox ID
          <select name="inboxId" required>
            {#each data.inboxIds as id}
              <option value={id}>{id}</option>
            {/each}
          </select>
        </label>
        <label>
          Provider ID
          <input bind:this={providerIdInput} name="providerId" required placeholder="my-gmail" />
        </label>
        <label>
          Type
          <select name="type" required bind:value={selectedType}>
            <option value="dummy">dummy</option>
            <option value="gmail">gmail</option>
          </select>
        </label>

        {#if selectedType === 'gmail'}
          <label>
            Email
            <input bind:value={gmailEmail} required placeholder="you@gmail.com" type="email" />
          </label>
          <label>
            Search Query
            <input bind:value={gmailSearchQuery} required placeholder="label:inbox" />
          </label>
        {/if}

        <input type="hidden" name="args" value={argsJson} />

        <div class="modal-actions">
          <button type="button" onclick={closeProviderModal}>Cancel</button>
          <button type="submit">Add</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showInboxModal}
  <div class="overlay" onclick={closeInboxModal} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <h2>Add Inbox</h2>
      <form method="POST" action="?/addInbox">
        <label>
          Inbox ID
          <input bind:this={inboxIdInput} name="inboxId" required placeholder="my-inbox" />
        </label>
        <div class="modal-actions">
          <button type="button" onclick={closeInboxModal}>Cancel</button>
          <button type="submit">Add</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showAuthModal}
  <div class="overlay" onclick={closeAuthModal} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <h2>Authorize Provider</h2>
      {#if authError}
        <div class="flash error">{authError}</div>
      {/if}
      {#if allProviders.length === 0}
        <p class="empty">No providers configured. Add a provider first.</p>
        <div class="modal-actions">
          <button type="button" onclick={closeAuthModal}>Close</button>
        </div>
      {:else}
        <label>
          Provider
          <select bind:value={authProviderId}>
            {#each allProviders as p}
              <option value={p.id}>{p.id} ({p.type}) — {p.inboxId}</option>
            {/each}
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" onclick={closeAuthModal}>Cancel</button>
          <button type="button" class="auth-submit" onclick={startAuth}>Authorize</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(html) {
    margin: 0;
    padding: 0;
    background: #0f172a;
    color: #e2e8f0;
  }
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0f172a;
    color: #e2e8f0;
  }

  .admin {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e2e8f0;
  }

  h1 {
    margin-bottom: 0.25rem;
    color: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .add-btn {
    padding: 0.5rem 1.25rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .add-btn:hover {
    background: #2563eb;
  }

  .flash {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }
  .flash.error {
    background: #7f1d1d;
    color: #fca5a5;
  }
  .flash.success {
    background: #14532d;
    color: #86efac;
  }

  .table-section {
    margin-bottom: 1.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1rem 1.25rem;
  }

  h2 {
    font-size: 1.05rem;
    margin: 0 0 0.75rem;
    color: #f1f5f9;
  }
  .count {
    font-weight: normal;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .empty {
    color: #64748b;
    font-style: italic;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: 1px solid #334155;
  }
  th {
    background: #334155;
    color: #cbd5e1;
    white-space: nowrap;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
  td {
    color: #e2e8f0;
  }
  td pre {
    margin: 0;
    white-space: pre;
    overflow-x: auto;
    max-width: 480px;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
  tr:nth-child(even) td {
    background: #0f172a;
  }
  tr:nth-child(odd) td {
    background: #1e293b;
  }

  .inline-form {
    margin: 0;
  }

  .delete-btn {
    padding: 0.25rem 0.6rem;
    background: #7f1d1d;
    color: #fca5a5;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .delete-btn:hover {
    background: #991b1b;
  }

  .pagination {
    margin-top: 0.75rem;
    display: flex;
    gap: 0.25rem;
  }
  .pagination a {
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    text-decoration: none;
    color: #93c5fd;
    background: #334155;
    font-size: 0.82rem;
  }
  .pagination a:hover {
    background: #475569;
  }
  .pagination a.active {
    background: #3b82f6;
    color: #fff;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1.5rem;
    width: 420px;
    max-width: 90vw;
    color: #e2e8f0;
  }
  .modal h2 {
    margin-top: 0;
    color: #f1f5f9;
  }

  .modal label {
    display: block;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }
  .modal input,
  .modal select {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid #334155;
    border-radius: 4px;
    background: #0f172a;
    color: #e2e8f0;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
    box-sizing: border-box;
  }
  .modal input:focus,
  .modal select:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .modal-actions button {
    padding: 0.4rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .modal-actions button[type='submit'] {
    background: #3b82f6;
    color: #fff;
  }
  .modal-actions button[type='submit']:hover {
    background: #2563eb;
  }
  .modal-actions button[type='button'] {
    background: #334155;
    color: #e2e8f0;
  }
  .modal-actions button[type='button']:hover {
    background: #475569;
  }
  .modal-actions button.auth-submit {
    background: #3b82f6;
    color: #fff;
  }
  .modal-actions button.auth-submit:hover {
    background: #2563eb;
  }
</style>
