const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getItems() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]');
    return [];
  }
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

function saveItems(items) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function addItem(text, options = {}) {
  const items = getItems();
  const newItem = {
    id: uuidv4(),
    text: text.trim(),
    checked: false,
    createdAt: new Date().toISOString(),
    order: options.order || Date.now()
  };
  items.push(newItem);
  saveItems(items);
  return newItem;
}

function updateItem(id, updates) {
  const items = getItems();
  const item = items.find(i => i.id === id);
  if (!item) {
    return null;
  }
  if (updates.checked !== undefined) {
    item.checked = updates.checked;
  }
  saveItems(items);
  return item;
}

function toggleItem(id) {
  const items = getItems();
  const item = items.find(i => i.id === id);
  if (!item) {
    return null;
  }
  item.checked = !item.checked;
  saveItems(items);
  return item;
}

function restoreItem(itemData) {
  const items = getItems();
  items.push(itemData);
  saveItems(items);
  return itemData;
}

function deleteItem(id) {
  const items = getItems();
  const index = items.findIndex(i => i.id === id);
  if (index === -1) {
    return null;
  }
  const [deleted] = items.splice(index, 1);
  saveItems(items);
  return deleted;
}

function reorderItems(itemIds) {
  const items = getItems();
  itemIds.forEach((id, index) => {
    const item = items.find(i => i.id === id);
    if (item) {
      item.order = index;
    }
  });
  saveItems(items);
  return items;
}

function getSortedItems() {
  const items = getItems();
  return items.sort((a, b) => (a.order || 0) - (b.order || 0));
}

module.exports = {
  getItems,
  getSortedItems,
  addItem,
  updateItem,
  toggleItem,
  deleteItem,
  restoreItem,
  reorderItems
};
