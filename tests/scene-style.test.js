'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCENE_STYLE,
  contrastRatio,
  semanticRoleFor,
} = require('../src/scene-style.js');

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('semantic roles reserve independent player structure hostile and gap colors', () => {
  assert.equal(semanticRoleFor('player'), 'player');
  assert.equal(semanticRoleFor('wallHigh'), 'structure');
  assert.equal(semanticRoleFor('corridorMedium'), 'structure');
  assert.equal(semanticRoleFor('drone'), 'hostile');
  assert.equal(semanticRoleFor('turret'), 'hostile');
  assert.equal(semanticRoleFor('gap'), 'gap');
  assert.equal(semanticRoleFor('fuel'), 'pickup');
  assert.equal(semanticRoleFor('unknown'), 'neutral');
  assert.notEqual(SCENE_STYLE.player.identity, SCENE_STYLE.structure.signal);
  assert.notEqual(SCENE_STYLE.structure.signal, SCENE_STYLE.hostile.signal);
  assert.notEqual(SCENE_STYLE.hostile.signal, SCENE_STYLE.gap.warningPrimary);
});

test('Heavy Swarm drones reserve graphite armor and concentrated crimson signals', () => {
  assert.deepEqual(SCENE_STYLE.hostile.drone, {
    armorShadow: '#070a10',
    armorMid: '#171d26',
    armorHighlight: '#8f9baa',
    podRecess: '#0b0f16',
    energy: '#c70f48',
    core: '#ff315f',
    warningLight: '#ff3b4f',
  });
  assert.deepEqual({
    shadow: SCENE_STYLE.hostile.shadow,
    mid: SCENE_STYLE.hostile.mid,
    signal: SCENE_STYLE.hostile.signal,
    warning: SCENE_STYLE.hostile.warning,
    cue: SCENE_STYLE.hostile.cue,
  }, {
    shadow: '#23142f',
    mid: '#7b285f',
    signal: '#ff4fa3',
    warning: '#ff4f63',
    cue: '#fff4f7',
  });
  for (const distinctColor of [
    SCENE_STYLE.player.identity,
    SCENE_STYLE.structure.signal,
    SCENE_STYLE.gap.warningPrimary,
    SCENE_STYLE.gap.warningSecondary,
    SCENE_STYLE.background.upper,
    SCENE_STYLE.background.horizon,
  ]) {
    assert.notEqual(SCENE_STYLE.hostile.drone.core, distinctColor);
    assert.notEqual(SCENE_STYLE.hostile.drone.energy, distinctColor);
  }
  assert.ok(contrastRatio(
    SCENE_STYLE.hostile.drone.armorHighlight,
    SCENE_STYLE.background.upper,
  ) >= 5);
  assert.ok(contrastRatio(
    SCENE_STYLE.hostile.drone.core,
    SCENE_STYLE.background.horizon,
  ) >= 4.5);
  assert.equal(Object.isFrozen(SCENE_STYLE.hostile.drone), true);
});

test('event horizon tokens keep warning contrast and separate decorative rings', () => {
  assert.deepEqual(SCENE_STYLE.gap, {
    well: '#03040a',
    core: '#000005',
    innerRing: '#5de8ff',
    middleRing: '#6091ff',
    fringe: '#a05dff',
    sideFracture: '93,232,255',
    warningPrimary: '#ff6b4d',
    warningSecondary: '#ffb24c',
  });
  for (const warning of [
    SCENE_STYLE.gap.warningPrimary,
    SCENE_STYLE.gap.warningSecondary,
  ]) {
    assert.ok(contrastRatio(warning, SCENE_STYLE.road.deckA) >= 4.5);
    assert.ok(contrastRatio(warning, SCENE_STYLE.road.deckB) >= 4.5);
  }
  assert.notEqual(SCENE_STYLE.gap.innerRing, SCENE_STYLE.player.identity);
  assert.notEqual(SCENE_STYLE.gap.fringe, SCENE_STYLE.hostile.signal);
});

test('scene contract is recursively frozen', () => {
  assertDeepFrozen(SCENE_STYLE);
});
