#!/usr/bin/env node
/**
 * Generate simple PWA icons for Lystik
 * Creates basic PNG icons with the theme color and a checkmark
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Theme color from the app
const THEME_COLOR = { r: 26, g: 115, b: 232 }; // #1a73e8
const WHITE = { r: 255, g: 255, b: 255 };

function createPNG(width, height, drawFunc) {
  // Create raw RGBA pixel data
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = drawFunc(x, y, width, height);
      const idx = (y * width + x) * 4;
      pixels[idx] = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = 255; // Alpha
    }
  }

  // Create filtered scanlines (filter byte 0 = None for each row)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // Filter type: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  // Compress with zlib
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 6;  // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Draw function for the icon
function drawIcon(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.4;

  // Distance from center
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Rounded square shape
  const cornerRadius = width * 0.15;
  const halfSize = width * 0.4;

  // Check if inside rounded square
  const inSquare = Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize;
  const inCorner = (
    (Math.abs(dx) > halfSize - cornerRadius && Math.abs(dy) > halfSize - cornerRadius) &&
    Math.sqrt(Math.pow(Math.abs(dx) - (halfSize - cornerRadius), 2) +
              Math.pow(Math.abs(dy) - (halfSize - cornerRadius), 2)) > cornerRadius
  );

  if (inSquare && !inCorner) {
    // Inside the rounded square - check for checkmark
    const checkScale = width / 24;
    const checkX = (x - cx) / checkScale + 12;
    const checkY = (y - cy) / checkScale + 12;

    // Checkmark path: M9 12l2 2 4-4
    const lineWidth = 1.2;

    // First segment: (9,12) to (11,14)
    const d1 = distToSegment(checkX, checkY, 9, 12, 11, 14);
    // Second segment: (11,14) to (15,10)
    const d2 = distToSegment(checkX, checkY, 11, 14, 15, 10);

    if (d1 < lineWidth || d2 < lineWidth) {
      return WHITE;
    }
    return THEME_COLOR;
  }

  return WHITE;
}

// Distance from point to line segment
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;

  return Math.sqrt(Math.pow(px - nearX, 2) + Math.pow(py - nearY, 2));
}

// Generate icons
const iconsDir = path.join(__dirname, '..', 'src', 'public', 'icons');

const sizes = [192, 512];

sizes.forEach(size => {
  const png = createPNG(size, size, drawIcon);
  const filename = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Generated ${filename}`);
});

console.log('Icons generated successfully!');
