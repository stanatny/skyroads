import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Skyroads case study records the final movement contract and V1.1 artifact map', () => {
  const source = read('references/skyroads-case-study.md');
  for (const term of ['145 ms', '220 ms', '110 ms']) assert.match(source, new RegExp(term));
  assert.doesNotMatch(source, /140 ms hold eligibility/);
  assert.doesNotMatch(source, /85 ms repeated lane travel/);

  for (const artifact of [
    'rhythm-and-world-polish',
    'orbital-defense-world-art',
    'obstacle-perspective-corrections',
    'semantic-spectrum-gameplay-art',
    'dangerous-event-horizon-gap',
    'heavy-swarm-drone',
    'perceptual-camera-and-hud',
    'vector-thruster-feedback',
    'charge-hud-patch',
  ]) assert.match(source, new RegExp(artifact));
});

test('browser-game references encode final HUD audio readiness and shipping lessons', () => {
  const gameplay = read('references/gameplay-ui-and-persistence.md');
  const audio = read('references/assets-audio-and-licensing.md');
  const matrix = read('references/testing-and-environment-matrix.md');
  const shipping = read('references/release-and-production-proof.md');

  for (const term of ['reveal threshold', 'stable semantic order', 'coordinates']) {
    assert.match(gameplay, new RegExp(term, 'i'));
  }
  for (const term of ['single owner', 'priority table', 'shared graph', 'ownership predicate']) {
    assert.match(audio, new RegExp(term, 'i'));
  }
  assert.match(audio, /preferred.*fallback.*equivalent/i);
  assert.match(matrix, /condition-based readiness/i);
  assert.match(matrix, /platform-independent/i);
  assert.match(matrix, /platform-only/i);
  for (const term of ['merge', 'deployment', 'tag', 'Release', 'artifact']) {
    assert.match(shipping, new RegExp(term));
  }
  assert.match(shipping, /ordinary canonical URL/i);
  assert.match(shipping, /cache-busted/i);
});

test('the repository skill stays self-contained and points to every reference', () => {
  const entrypoint = read('SKILL.md');
  for (const relativePath of [
    'references/scope-and-design-gates.md',
    'references/gameplay-ui-and-persistence.md',
    'references/assets-audio-and-licensing.md',
    'references/testing-and-environment-matrix.md',
    'references/release-and-production-proof.md',
    'references/skyroads-case-study.md',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
    assert.match(entrypoint, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(entrypoint, /cross-engine/i);
  assert.match(entrypoint, /repository-specific contracts override/i);
});

test('public skill content contains no private environment references', () => {
  const files = [
    'SKILL.md',
    'references/scope-and-design-gates.md',
    'references/gameplay-ui-and-persistence.md',
    'references/assets-audio-and-licensing.md',
    'references/testing-and-environment-matrix.md',
    'references/release-and-production-proof.md',
    'references/skyroads-case-study.md',
  ];
  const source = files.map(read).join('\n');
  for (const forbidden of [
    /\/home\/shanshuo/,
    /10\.\d+\.\d+\.\d+/,
    /code\.byted/i,
    /git\.byted/i,
    /larkoffice/i,
    /feishu/i,
    /bnpm/i,
  ]) assert.doesNotMatch(source, forbidden);
});
