'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
  decodePngRgba,
  encodePngRgba,
  sha256,
  alphaPlane,
} = require('../tools/png-rgba.js');

test('PNG codec round-trips exact RGBA and writes deterministic bytes', () => {
  const source = fs.readFileSync(path.join(root, 'assets/ship/player-neutral.png'));
  const decoded = decodePngRgba(source);
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 512, height: 384 });

  const first = encodePngRgba(decoded);
  const second = encodePngRgba(decoded);
  assert.equal(first.equals(second), true);
  assert.equal(sha256(first), sha256(second));
  assert.deepEqual(decodePngRgba(first), decoded);
});

test('alpha-plane extraction preserves one byte per pixel in order', () => {
  const rgba = Buffer.from([
    10, 20, 30, 40,
    50, 60, 70, 80,
    90, 100, 110, 120,
  ]);
  assert.deepEqual(alphaPlane(rgba), Buffer.from([40, 80, 120]));
});

test('PNG decoder rejects invalid signatures and non-RGBA sources', () => {
  assert.throws(() => decodePngRgba(Buffer.from('not png')), /PNG signature/);
  const indexed = fs.readFileSync(path.join(root, 'assets/ui/panel-frame-cyan.png'));
  assert.throws(() => decodePngRgba(indexed), /non-interlaced 8-bit RGBA/);
});

test('PNG encoder rejects mismatched RGBA buffer lengths', () => {
  assert.throws(() => encodePngRgba({
    width: 2,
    height: 2,
    rgba: Buffer.alloc(15),
  }), /RGBA byte length/);
});
