'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePngRgba(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < PNG_SIGNATURE.length
    || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = PNG_SIGNATURE.length;
  let header = null;
  let sawEnd = false;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) throw new Error('PNG chunk exceeds input length');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      if (length !== 13 || header) throw new Error('PNG must contain one 13-byte IHDR chunk');
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      sawEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!header) throw new Error('PNG must contain an IHDR chunk');
  if (!sawEnd) throw new Error('PNG must contain an IEND chunk');
  if (header.width < 1 || header.height < 1) throw new Error('PNG dimensions must be positive');
  if (header.bitDepth !== 8
    || header.colorType !== 6
    || header.compression !== 0
    || header.filter !== 0
    || header.interlace !== 0) {
    throw new Error('PNG must be non-interlaced 8-bit RGBA');
  }
  if (compressed.length === 0) throw new Error('PNG must contain image data');

  const stride = header.width * 4;
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  const expectedLength = (stride + 1) * header.height;
  if (filtered.length !== expectedLength) {
    throw new Error(`PNG image data length ${filtered.length} does not match ${expectedLength}`);
  }

  const rgba = Buffer.alloc(stride * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[sourceOffset + x];
      const destination = y * stride + x;
      const left = x >= 4 ? rgba[destination - 4] : 0;
      const up = y > 0 ? rgba[destination - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? rgba[destination - stride - 4] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);
      rgba[destination] = (raw + predictor) & 0xff;
    }
    sourceOffset += stride;
  }

  return { width: header.width, height: header.height, rgba };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return output;
}

function encodePngRgba({ width, height, rgba }) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error('PNG dimensions must be positive integers');
  }
  if (!Buffer.isBuffer(rgba) || rgba.length !== width * height * 4) {
    throw new Error(`RGBA byte length must equal width * height * 4 (${width * height * 4})`);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    filtered[row] = 0;
    rgba.copy(filtered, row + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(filtered, {
    level: 9,
    strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  });
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function alphaPlane(rgba) {
  if (!Buffer.isBuffer(rgba) || rgba.length % 4 !== 0) {
    throw new Error('RGBA byte length must be divisible by four');
  }
  const alpha = Buffer.alloc(rgba.length / 4);
  for (let source = 3, destination = 0; source < rgba.length; source += 4, destination += 1) {
    alpha[destination] = rgba[source];
  }
  return alpha;
}

module.exports = Object.freeze({
  PNG_SIGNATURE,
  decodePngRgba,
  encodePngRgba,
  sha256,
  alphaPlane,
});
