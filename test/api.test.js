const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Set test data directory
const TEST_DATA_DIR = path.join(__dirname, 'test-data');
process.env.DATA_DIR = TEST_DATA_DIR;

const app = require('../src/server');

let server;
let baseUrl;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {}
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function cleanTestData() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

describe('API Tests', () => {
  beforeEach(() => {
    cleanTestData();
  });

  test('GET /api/items returns empty array initially', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('GET', '/api/items');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.strictEqual(res.data.length, 0);

    server.close();
  });

  test('POST /api/items creates an item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/api/items', { text: 'Test item' });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.id);
    assert.strictEqual(res.data.text, 'Test item');
    assert.strictEqual(res.data.checked, false);

    // Verify item exists
    const getRes = await request('GET', '/api/items');
    assert.strictEqual(getRes.data.length, 1);

    server.close();
  });

  test('POST /api/items returns 400 for empty text', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/api/items', { text: '' });
    assert.strictEqual(res.status, 400);

    server.close();
  });

  test('PATCH /api/items/:id toggles checked state', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    // Create item
    const createRes = await request('POST', '/api/items', { text: 'Toggle test' });
    const itemId = createRes.data.id;
    assert.strictEqual(createRes.data.checked, false);

    // Toggle to checked
    const toggleRes = await request('PATCH', `/api/items/${itemId}`);
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleRes.data.checked, true);

    // Toggle back to unchecked
    const toggleRes2 = await request('PATCH', `/api/items/${itemId}`);
    assert.strictEqual(toggleRes2.data.checked, false);

    server.close();
  });

  test('PATCH /api/items/:id returns 404 for non-existent item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('PATCH', '/api/items/non-existent-id');
    assert.strictEqual(res.status, 404);

    server.close();
  });

  test('DELETE /api/items/:id removes item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    // Create item
    const createRes = await request('POST', '/api/items', { text: 'Delete test' });
    const itemId = createRes.data.id;

    // Delete item
    const deleteRes = await request('DELETE', `/api/items/${itemId}`);
    assert.strictEqual(deleteRes.status, 200);

    // Verify item is gone
    const getRes = await request('GET', '/api/items');
    assert.strictEqual(getRes.data.length, 0);

    server.close();
  });

  test('DELETE /api/items/:id returns 404 for non-existent item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('DELETE', '/api/items/non-existent-id');
    assert.strictEqual(res.status, 404);

    server.close();
  });

  after(() => {
    cleanTestData();
  });
});

describe('MCP API Tests', () => {
  beforeEach(() => {
    cleanTestData();
  });

  test('MCP initialize returns protocol version and capabilities', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.jsonrpc, '2.0');
    assert.strictEqual(res.data.id, 1);
    assert.strictEqual(res.data.result.protocolVersion, '2025-03-26');
    assert.ok(res.data.result.capabilities);
    assert.ok(res.data.result.serverInfo);

    server.close();
  });

  test('MCP tools/list returns tool definitions', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.result.tools));
    assert.strictEqual(res.data.result.tools.length, 4);

    const toolNames = res.data.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('list_items'));
    assert.ok(toolNames.includes('add_item'));
    assert.ok(toolNames.includes('toggle_item'));
    assert.ok(toolNames.includes('delete_item'));

    server.close();
  });

  test('MCP tools/call add_item creates item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'add_item', arguments: { text: 'MCP test task' } }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.result.content);
    const item = JSON.parse(res.data.result.content[0].text);
    assert.strictEqual(item.text, 'MCP test task');
    assert.strictEqual(item.checked, false);

    // Verify via REST API
    const getRes = await request('GET', '/api/items');
    assert.strictEqual(getRes.data.length, 1);

    server.close();
  });

  test('MCP tools/call list_items returns items', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    // Create item via REST
    await request('POST', '/api/items', { text: 'Test item' });

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_items', arguments: {} }
    });

    assert.strictEqual(res.status, 200);
    const items = JSON.parse(res.data.result.content[0].text);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].text, 'Test item');

    server.close();
  });

  test('MCP tools/call toggle_item toggles item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    // Create item via REST
    const createRes = await request('POST', '/api/items', { text: 'Toggle test' });
    const itemId = createRes.data.id;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'toggle_item', arguments: { id: itemId } }
    });

    assert.strictEqual(res.status, 200);
    const item = JSON.parse(res.data.result.content[0].text);
    assert.strictEqual(item.checked, true);

    server.close();
  });

  test('MCP tools/call delete_item removes item', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    // Create item via REST
    const createRes = await request('POST', '/api/items', { text: 'Delete test' });
    const itemId = createRes.data.id;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'delete_item', arguments: { id: itemId } }
    });

    assert.strictEqual(res.status, 200);

    // Verify item is gone
    const getRes = await request('GET', '/api/items');
    assert.strictEqual(getRes.data.length, 0);

    server.close();
  });

  test('MCP returns error for invalid method', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 7,
      method: 'invalid/method'
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.error);
    assert.strictEqual(res.data.error.code, -32601);

    server.close();
  });

  test('MCP returns error for missing tool params', async () => {
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const res = await request('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'add_item', arguments: {} }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.error);
    assert.strictEqual(res.data.error.code, -32602);

    server.close();
  });

  after(() => {
    cleanTestData();
  });
});
