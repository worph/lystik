# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

All commands run inside the Docker container. The `./src` and `./test` directories are volume-mounted, so file edits take effect without rebuilding.

```bash
docker compose up -d --build   # Start dev server (rebuilds image)
docker compose ps              # Check container status
docker compose logs -f         # View logs
docker compose down            # Stop the stack
```

The app will be available at http://localhost:9301.

Note: docker-compose requires an external `mcp-net` network (`docker network create mcp-net` if it doesn't exist).

Run commands inside the container:

```bash
docker compose exec lystik npm test                      # Run all tests
docker compose exec lystik node --test test/api.test.js  # Run specific test file
```

## Architecture

Lystik is a minimal, single shared checkbox list app. No database, no auth, no HTTPS — designed to run behind a reverse proxy.

```
Frontend (Vanilla JS SPA + PWA Service Worker)
    │ REST API
Backend (Express)
    │ File I/O
Storage (JSON file at DATA_DIR/items.json)
```

### Key Components

- **src/server.js** — Express server with REST endpoints and MCP protocol handler (dual transport: direct HTTP POST and SSE-based).
- **src/storage.js** — File-based persistence. Each operation reads/modifies/writes the entire items array. Uses uuid v4 for IDs. Synchronous file I/O.
- **src/mcp-announce.js** — UDP discovery responder. Listens on DISCOVERY_PORT for broadcast messages and responds with a server manifest.
- **src/public/app.js** — Vanilla JS IIFE with drag-drop reordering, undo/snackbar for deletions, and PWA install prompt handling.
- **src/public/sw.js** — Service Worker: cache-first for static assets, network-first for API.

### Data Model

```json
{"id": "uuid", "text": "string", "checked": boolean, "createdAt": "ISO", "order": number}
```

### API Endpoints

- `GET /api/items` — Get sorted items
- `POST /api/items` — Add item (body: `{text}`)
- `PATCH /api/items/:id` — Update item (body: `{checked}` or `{toggle: true}`)
- `DELETE /api/items/:id` — Delete item
- `POST /api/items/reorder` — Reorder (body: `{itemIds: []}`)
- `POST /api/items/restore` — Restore deleted item
- `POST /mcp` — MCP JSON-RPC 2.0 endpoint (tools: list_items, add_item, toggle_item, delete_item)

## Testing

Tests use Node's built-in `node:test` module with `node:assert`. Each test spins up a fresh server instance on a random port with an isolated test data directory (`test/test-data/`, cleaned up automatically). Tests cover both REST API and MCP protocol.

```bash
docker compose exec lystik npm test                      # Run all tests
docker compose exec lystik node --test test/api.test.js  # Run specific test file
```

## Environment Variables

- `PORT` — HTTP port (default: 80)
- `DATA_DIR` — JSON storage directory (default: `/data` in container, `./data` locally)
- `MCP_PORT` — Port advertised in MCP discovery (default: same as PORT)
- `DISCOVERY_PORT` — UDP port for MCP auto-discovery (default: 9099)
