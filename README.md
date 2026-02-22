# open-list

A minimal, single-list checkbox application designed for simplicity.

## Features

- Single shared checkbox list
- Real-time web notifications when items are added or checked
- JSON-based persistence
- Container-ready with web UI on port 80

## Quick Start

```bash
docker build -t open-list .
docker run -d -p 80:80 -v /path/to/data:/data open-list
```

Access the web UI at `http://localhost`.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `DATA_PATH` | `/data/list.json` | Path to the JSON storage file |
| `PORT` | `80` | HTTP port (internal) |

## Architecture

- **No authentication**: Authentication is expected to be handled by a reverse proxy or external service
- **No HTTPS**: TLS termination should be handled externally (e.g., nginx, traefik, cloudflare)
- **Single list**: One shared list for all users

## Data Storage

The list is stored as a simple JSON file:

```json
{
  "items": [
    {
      "id": "uuid-here",
      "text": "Item description",
      "checked": false,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Web Notifications

The application uses the Web Notifications API to alert users when:
- A new item is added to the list
- An item is checked or unchecked

Users must grant notification permissions in their browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/items` | Get all list items |
| `POST` | `/api/items` | Add a new item |
| `PATCH` | `/api/items/:id` | Update an item (toggle checked) |
| `DELETE` | `/api/items/:id` | Remove an item |
| `GET` | `/api/events` | SSE endpoint for real-time updates |

## Deployment

### Behind a Reverse Proxy

Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name list.example.com;

    # SSL/Auth handled here

    location / {
        proxy_pass http://open-list:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## License

MIT
