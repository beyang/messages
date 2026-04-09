# Messages

A client-server app for reading and responding to messages.

## Stack

- Backend: TypeScript + SvelteKit API routes + SQLite (`better-sqlite3`)
- Frontend: TypeScript terminal UI (`blessed`)
- Package manager: `pnpm`

This repository currently uses SvelteKit for API endpoints only (no web UI routes).

## Data Model

```ts
interface Message {
  sourceURL: string
  content: string
}

interface Convo {
  sourceURL: string
  messages: Message[]
}

interface Inbox {
  id: string
  threads: Convo[]
}
```

SQLite schema uses two tables:

- `inbox`
- `convo` (contains a `messages_json` blob; no separate `message` table)

`sourceURL` values are treated as unique ids for conversations.

## Quick Start

```bash
pnpm install
pnpm db:seed
pnpm start
```

In another terminal:

```bash
pnpm tui
```

TUI controls:

- `tab`: switch between inbox and thread lists
- `↑/↓`: move selection
- `r`: reply to selected thread
- `R`: refresh from server
- `q`: quit

## Scripts

- `pnpm start`: run SvelteKit API server (`http://localhost:3000`)
- `pnpm build`: build the SvelteKit server bundle
- `pnpm tui`: run terminal UI client
- `pnpm run server`: alternative explicit script invocation for server
- `pnpm run client`: alternative explicit script invocation for client
- `pnpm db:seed`: reset + seed database with dummy data
- `pnpm db:reset`: clear all inbox/conversation data
- `pnpm typecheck`: run TypeScript checks

Note: `pnpm server` is a built-in pnpm command for the package store server, so use `pnpm start` (or `pnpm run server`) for this app.

## OAuth Provider Setup

Add provider OAuth credentials to `.env`:

```bash
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
```

### Slack App Creation

1. In Slack, create an app at https://api.slack.com/apps.
1. Under **OAuth & Permissions**, add the user scope `search:read`.
1. Under **Redirect URLs**, add `http://localhost:3000/api/oauth/slack/callback`.
1. Install the app to your workspace.
1. In this app's admin UI (`/admin`), add a provider with type `slack` and a search query (for example `in:#engineering incident`).
1. Click **Authorize**, pick that Slack provider, and complete Slack OAuth.
1. Trigger provider fetch (UI or API) to pull matching Slack messages into convos.
