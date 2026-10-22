/**
 * UDP discovery responder — lets MCP servers announce themselves to the aggregator.
 * Zero dependencies, uses built-in Node.js dgram module.
 */

const dgram = require('dgram');

// Ack mode: when a discovery request carries `ack`, reply with 8 bytes —
// 'BCNA' + the FNV-1a 32-bit hash of the manifest, big-endian — and send the
// manifest itself only when Beacon asks for it 1:1 with {"type":"manifest"}.
// Full manifests answered to a broadcast all land on Beacon at once and
// overflow its socket buffer; an ack never can. Requests without `ack` (an
// older Beacon) still get the full manifest. See beacon/sdk/node/mcp-announce.js.
const ACK_MAGIC = Buffer.from('BCNA');

function fnv1a32(buf) {
  let h = 0x811c9dc5;
  for (const b of buf) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function ackFor(manifest) {
  const ack = Buffer.alloc(8);
  ACK_MAGIC.copy(ack, 0);
  ack.writeUInt32BE(fnv1a32(Buffer.from(manifest)), 4);
  return ack;
}

/**
 * Start a UDP listener that responds to discovery broadcasts.
 *
 * @param {Object} options
 * @param {string} options.name - Server name for identification.
 * @param {string} options.description - Human-readable description.
 * @param {Array} options.tools - List of tool definitions (name, description, inputSchema).
 * @param {number} [options.port=9099] - The HTTP port where the MCP server is listening.
 * @param {number} [options.listenPort=9099] - UDP port to listen on for discovery broadcasts.
 * @returns {dgram.Socket} The socket (call socket.close() to stop).
 */
function createDiscoveryResponder({ name, description, tools, port = 9099, listenPort = 9099 }) {
  const manifest = JSON.stringify({
    type: 'announce',
    name,
    description,
    tools,
    port,
  });
  const ack = ackFor(manifest);

  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  socket.on('message', (data, rinfo) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'manifest') {
        socket.send(manifest, rinfo.port, rinfo.address);
      } else if (msg.type === 'discovery') {
        console.log(`Discovery request from ${rinfo.address}:${rinfo.port}, ${msg.ack ? 'acking' : 'announcing'}`);
        socket.send(msg.ack ? ack : manifest, rinfo.port, rinfo.address);
      }
    } catch {
      // ignore malformed messages
    }
  });

  socket.on('error', (err) => {
    console.error('Announce socket error:', err.message);
  });

  socket.bind(listenPort, '0.0.0.0', () => {
    socket.addMembership('239.255.99.1');
    console.log(`Discovery responder listening on UDP :${listenPort} (multicast 239.255.99.1) for ${name}`);
  });

  return socket;
}

module.exports = { createDiscoveryResponder };
