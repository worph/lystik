const express = require('express');
const path = require('path');
const storage = require('./storage');

const app = express();
const PORT = process.env.PORT || 80;

// SSE clients
const clients = new Set();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Broadcast event to all SSE clients
function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    client.write(message);
  });
}

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection event
  res.write('event: connected\ndata: {}\n\n');

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});

// GET all items (sorted by order)
app.get('/api/items', (req, res) => {
  try {
    const items = storage.getSortedItems();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get items' });
  }
});

// POST new item
app.post('/api/items', (req, res) => {
  try {
    const { text, order } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    const item = storage.addItem(text, { order });
    broadcast('item-added', item);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// PATCH update item (toggle checked)
app.patch('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { checked } = req.body;

    let item;
    if (checked !== undefined) {
      item = storage.updateItem(id, { checked });
    } else {
      // Legacy behavior: toggle checked
      item = storage.toggleItem(id);
    }

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    broadcast('item-updated', item);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// POST reorder items
app.post('/api/items/reorder', (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds array is required' });
    }
    const items = storage.reorderItems(itemIds);
    broadcast('items-reordered', { itemIds });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder items' });
  }
});

// POST restore deleted item (for undo)
app.post('/api/items/restore', (req, res) => {
  try {
    const itemData = req.body;
    if (!itemData || !itemData.id || !itemData.text) {
      return res.status(400).json({ error: 'Item data is required' });
    }
    const item = storage.restoreItem(itemData);
    broadcast('item-added', item);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore item' });
  }
});

// DELETE item
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = storage.deleteItem(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    broadcast('item-deleted', item);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// MCP (Model Context Protocol) endpoint
const MCP_PROTOCOL_VERSION = '2025-03-26';

class McpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MCP_TOOLS = [
  {
    name: 'list_items',
    description: 'Get all tasks from the list',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'add_item',
    description: 'Add a new task to the list',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The task text' } },
      required: ['text']
    }
  },
  {
    name: 'toggle_item',
    description: 'Toggle the checked state of a task',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task ID' } },
      required: ['id']
    }
  },
  {
    name: 'delete_item',
    description: 'Delete a task from the list',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The task ID' } },
      required: ['id']
    }
  }
];

function handleToolCall(name, args) {
  switch (name) {
    case 'list_items': {
      const items = storage.getSortedItems();
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    }
    case 'add_item': {
      if (!args.text || !args.text.trim()) {
        throw new McpError(-32602, 'text parameter is required');
      }
      const item = storage.addItem(args.text);
      broadcast('item-added', item);
      return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
    }
    case 'toggle_item': {
      if (!args.id) {
        throw new McpError(-32602, 'id parameter is required');
      }
      const item = storage.toggleItem(args.id);
      if (!item) {
        throw new McpError(-32602, 'Item not found');
      }
      broadcast('item-updated', item);
      return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
    }
    case 'delete_item': {
      if (!args.id) {
        throw new McpError(-32602, 'id parameter is required');
      }
      const item = storage.deleteItem(args.id);
      if (!item) {
        throw new McpError(-32602, 'Item not found');
      }
      broadcast('item-deleted', item);
      return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
    }
    default:
      throw new McpError(-32602, `Unknown tool: ${name}`);
  }
}

function handleMcpMethod(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'lystik', version: '1.0.0' }
      };
    case 'notifications/initialized':
      return {};
    case 'tools/list':
      return { tools: MCP_TOOLS };
    case 'tools/call':
      if (!params || !params.name) {
        throw new McpError(-32602, 'Tool name is required');
      }
      return handleToolCall(params.name, params.arguments || {});
    default:
      throw new McpError(-32601, `Method not found: ${method}`);
  }
}

app.post('/mcp', (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
  }

  try {
    const result = handleMcpMethod(method, params);
    res.json({ jsonrpc: '2.0', id, result });
  } catch (error) {
    if (error instanceof McpError) {
      res.json({ jsonrpc: '2.0', id, error: { code: error.code, message: error.message } });
    } else {
      res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } });
    }
  }
});

// Export for testing
module.exports = app;

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
