# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

All commands run inside the Docker container. Start the dev stack first:

```bash
docker compose up -d --build   # Start dev server (rebuilds image)
docker compose ps              # Check container status
docker compose logs -f         # View logs
docker compose down            # Stop the stack
```

The app will be available at http://localhost:3000.

Run commands inside the container:

```bash
docker compose exec lystik npm test    # Run tests
docker compose exec lystik npm start   # Manual server start (already running)
```

## Architecture

Lystik is a minimal, single shared checkbox list app with real-time sync. No database, no auth, no HTTPS - designed to run behind a reverse proxy.

```
Frontend (Vanilla JS SPA)
    │ REST API + SSE
Backend (Express)
    │ File I/O
Storage (JSON file at DATA_DIR/items.json)
```

### Key Components

- **src/server.js** - Express server with REST endpoints and SSE broadcasting. Maintains a Set of connected clients and broadcasts all changes to every client.
- **src/storage.js** - File-based persistence. Each operation reads/modifies/writes the entire items array. Uses uuid v4 for IDs.
- **src/public/app.js** - Vanilla JS IIFE with drag-drop reordering, SSE listener for real-time sync, Web Notifications, and undo/snackbar for deletions.

### Data Model

```json
{"id": "uuid", "text": "string", "checked": boolean, "createdAt": "ISO", "order": number}
```

### API Endpoints

- `GET /api/items` - Get sorted items
- `POST /api/items` - Add item (body: `{text}`)
- `PATCH /api/items/:id` - Update item (body: `{checked}` or `{toggle: true}`)
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/reorder` - Reorder (body: `{itemIds: []}`)
- `POST /api/items/restore` - Restore deleted item
- `GET /api/events` - SSE stream (events: connected, item-added, item-updated, item-deleted, items-reordered)

## Testing

Tests use Node's built-in `node:test` module with `node:assert`. Each test spins up a fresh server instance on a random port with isolated test data directory.

```bash
docker compose exec lystik npm test                      # Run all tests
docker compose exec lystik node --test test/api.test.js  # Run specific test file
```

## Environment Variables

- `PORT` - HTTP port (default: 80)
- `DATA_DIR` - JSON storage directory (default: `/data` in container, `./data` locally)
