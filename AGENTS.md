# AGENTS.md

This file provides guidance for agents working in this repository.

## Project Purpose

`messages` is a local-first TypeScript client-server app for reading and responding to message threads.

- Backend: SvelteKit API routes + SQLite (`better-sqlite3`)
- Frontend: terminal UI with `blessed`
- Package manager: `pnpm`

## Architecture Overview

### Module Layout

- `src/shared/types.ts`: canonical data contracts shared by server and client.
- `src/server/db.ts`: SQLite connection/bootstrap and table creation.
- `src/server/store.ts`: all data access and mutation logic.
- `src/routes/health/+server.ts`: healthcheck route.
- `src/routes/api/**/+server.ts`: API route handlers and request validation.
- `src/client/api.ts`: client HTTP wrapper for server API.
- `src/client/index.ts`: TUI state machine, rendering, keybindings, and reply UX.
- `src/scripts/db.ts`: DB maintenance entrypoint (`seed`/`reset`).

### Data Model Constraints (Important)

Preserve these invariants unless the task explicitly requires a schema migration:

1. There are only two tables: `inbox` and `convo`.
1. There is no standalone `message` table.
1. `convo.messages_json` stores an array of `Message` objects as JSON.
1. `sourceURL` is treated as the unique identifier for conversations.
1. Replies append to the existing conversation JSON array.

### API Contract Notes

- `GET /api/inboxes` returns `Inbox[]` with embedded thread/message data.
- `GET /api/inboxes/:id` returns one `Inbox` or 404.
- `GET /api/convos?sourceURL=...` returns one `Convo` or 404.
- `POST /api/convos/reply` validates payload, appends message, returns updated `Convo`.

When changing these routes, keep `src/client/api.ts` and `src/client/index.ts` in sync.

### Operational Notes

1. DB file path is `data/messages.sqlite3` (created automatically).
1. Seed/reset workflows live in `src/scripts/db.ts`.
1. `pnpm server` conflicts with pnpm's built-in store-server command; use `pnpm start` or `pnpm run server` for this app.
1. This is an API-only SvelteKit app right now (no web page routes are required).

## Implementation Guidance For Agents

1. Keep shared interfaces in `src/shared/types.ts` as the source of truth.
1. Put SQL and data-shape conversions in `src/server/store.ts`, not route handlers.
1. Keep SvelteKit route handlers in `src/routes/**/+server.ts` focused on input validation + HTTP responses.
1. Preserve TUI keyboard controls and pane model unless requested otherwise.
1. Avoid introducing a third table for messages without explicit product/schema direction.

## Verification Commands

Run these after code changes:

1. Install deps if needed: `pnpm install`
1. Type check: `pnpm typecheck`
1. Build check: `pnpm build`
1. Reset and reseed DB: `pnpm db:reset && pnpm db:seed`

Recommended API smoke test:

```bash
pnpm start
# in another terminal
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/inboxes
curl -s -X POST http://localhost:3000/api/convos/reply \
  -H 'content-type: application/json' \
  -d '{"convoSourceURL":"https://chat.example.com/threads/alex","content":"Test reply from smoke test."}'
```

Recommended manual TUI check:

1. Run `pnpm tui`.
1. Verify inbox/thread navigation with arrow keys and `tab`.
1. Send a reply with `r` and confirm it appears in the message pane.
