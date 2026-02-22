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
