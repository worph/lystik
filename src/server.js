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

// Export for testing
module.exports = app;

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
