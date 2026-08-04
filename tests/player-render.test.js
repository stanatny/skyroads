'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function makeCanvasContext() {
  const gradient = { addColorStop() {} };
  const stateStack = [];
  let currentPath = [];
  const target = {
    events: [],
    drawImageCalls: 0,
    fillCalls: 0,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    drawImage(image) { this.drawImageCalls += 1; this.lastImageId = image && image.id; },
    save() {
      stateStack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
        globalAlpha: this.globalAlpha,
      });
    },
    restore() { Object.assign(this, stateStack.pop() || {}); },
    beginPath() { currentPath = []; },
    moveTo(...args) { currentPath.push(['moveTo', ...args]); },
    lineTo(...args) { currentPath.push(['lineTo', ...args]); },
    quadraticCurveTo(...args) { currentPath.push(['quadraticCurveTo', ...args]); },
    closePath() { currentPath.push(['closePath']); },
    arc(...args) { currentPath.push(['arc', ...args]); },
    ellipse(...args) { currentPath.push(['ellipse', ...args]); },
    fill() {
      this.fillCalls += 1;
      this.events.push({
        type: 'fill',
        style: this.fillStyle,
        path: currentPath.map((part) => [...part]),
      });
    },
    stroke() {
      this.events.push({
        type: 'stroke',
        style: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
        path: currentPath.map((part) => [...part]),
      });
    },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      const noOp = () => {};
      object[property] = noOp;
      return noOp;
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

function executeRealRender({
  loadedFrames,
  mode = 'glide',
  reducedMotion = true,
  time = 1,
} = {}) {
  const context = makeCanvasContext();
  const sandbox = {
    console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    window: { innerWidth: 960, innerHeight: 600, addEventListener() {} },
    document: { querySelector() { return null; } },
    requestAnimationFrame() {},
    __renderContext: context,
  };
  vm.createContext(sandbox);
  for (const file of [
    'src/input.js',
    'src/presentation.js',
    'src/world-art.js',
    'src/obstacles.js',
    'src/gap-regions.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const gameSource = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  const visualAssets = loadedFrames
    ? `{
        shipFramesReady: true,
        assets: { ship: {
          neutral: { loaded: true, element: { id: 'neutral-frame' } },
          thrust: { loaded: true, element: { id: 'thrust-frame' } },
        }, world: {
          droneScout: { loaded: true, element: { id: 'drone-scout-atlas' } },
        } },
      }`
    : 'null';
  const gliding = mode === 'glide' || mode === 'super-glide' || mode === 'boost';
  const boostActive = mode === 'boost';
  const superActive = mode === 'triple' || mode === 'super-glide';
  const burstTier = mode === 'triple' ? 3 : mode === 'double' ? 2 : 0;
  const burstDuration = burstTier === 3 ? 0.18 : burstTier === 2 ? 0.15 : 0;
  vm.runInContext(`${gameSource}
    STATE.mode = 'PLAYING';
    STATE.width = 960;
    STATE.height = 600;
    STATE.time = ${time};
    STATE.reducedMotion = ${reducedMotion};
    STATE.playerY = 500;
    STATE.playerVY = ${gliding ? -100 : 7500};
    STATE.tripleT = ${superActive ? 10 : 0};
    STATE.boostT = ${boostActive ? 4 : 0};
    STATE.gliding = ${gliding};
    STATE.jumpBurst = ${burstDuration};
    STATE.jumpBurstTier = ${burstTier};
    STATE.trail = [];
    STATE.visualAssets = ${visualAssets};
    Math.random = () => 0.5;
    renderPlayer(__renderContext);
  `, sandbox, { filename: loadedFrames ? 'game-loaded.js' : 'game-fallback.js' });
  context.trailSnapshot = JSON.parse(vm.runInContext('JSON.stringify(STATE.trail)', sandbox));
  return context;
}

test('real renderPlayer draws loaded super frames without losing shared geometry scope', () => {
  const context = executeRealRender({ loadedFrames: true, mode: 'super-glide' });
  assert.equal(context.drawImageCalls, 1);
  assert.equal(context.lastImageId, 'thrust-frame');
  assert.ok(context.fillCalls > 0);
});

test('real renderPlayer draws fallback super frames without losing shared geometry scope', () => {
  const context = executeRealRender({ loadedFrames: false, mode: 'super-glide' });
  assert.equal(context.drawImageCalls, 0);
  assert.ok(context.fillCalls > 0);
});

function feedbackEvents(context) {
  return context.events.filter((event) => (
    typeof event.style === 'string'
      && (
        event.style.startsWith('rgba(255,101,46,')
        || event.style.startsWith('rgba(255,190,72,')
        || event.style.startsWith('rgba(55,188,255,')
        || event.style.startsWith('rgba(122,232,255,')
        || event.style.startsWith('rgba(255,226,132,')
        || event.style.startsWith('rgba(255,246,210,')
        || event.style.startsWith('rgba(144,242,255,')
        || event.style.startsWith('rgba(255,170,51,')
      )
  ));
}

function maximumPathY(events) {
  return Math.max(...events.flatMap((event) => event.path.flatMap((part) => (
    part.slice(1).filter((_, index) => index % 2 === 1)
  ))));
}

test('loaded and fallback ships share the same second-jump twin ignition geometry', () => {
  const loaded = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'double' }));
  const fallback = feedbackEvents(executeRealRender({ loadedFrames: false, mode: 'double' }));
  const outer = loaded.filter((event) => event.style.startsWith('rgba(255,101,46,'));
  const arcs = loaded.filter((event) => event.style.startsWith('rgba(122,232,255,'));
  assert.equal(outer.length, 2);
  assert.equal(arcs.length, 1);
  assert.deepEqual(loaded, fallback);
});

test('third-jump ignition is longer and adds two gold-white angular strokes', () => {
  const second = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'double' }));
  const third = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'triple' }));
  const secondOuter = second.filter((event) => event.style.startsWith('rgba(255,101,46,'));
  const thirdOuter = third.filter((event) => event.style.startsWith('rgba(255,190,72,'));
  const angular = third.filter((event) => event.style.startsWith('rgba(255,246,210,'));
  assert.equal(thirdOuter.length, 2);
  assert.equal(angular.length, 2);
  assert.ok(maximumPathY(thirdOuter) > maximumPathY(secondOuter));
});

test('glide keeps two sustained cyan jets for loaded and fallback ships', () => {
  const loaded = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'glide' }));
  const fallback = feedbackEvents(executeRealRender({ loadedFrames: false, mode: 'glide' }));
  const jets = loaded.filter((event) => event.style.startsWith('rgba(55,188,255,'));
  const airflow = loaded.filter((event) => event.style.startsWith('rgba(144,242,255,'));
  assert.equal(jets.length, 2);
  assert.equal(airflow.length, 4);
  assert.deepEqual(loaded, fallback);
});

test('BOOST jets remain longer than ordinary glide jets', () => {
  const glide = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'glide' }));
  const boost = feedbackEvents(executeRealRender({ loadedFrames: true, mode: 'boost' }));
  const glideOuter = glide.filter((event) => event.style.startsWith('rgba(55,188,255,'));
  const boostOuter = boost.filter((event) => event.style.startsWith('rgba(255,170,51,'));
  assert.equal(boostOuter.length, 2);
  assert.ok(maximumPathY(boostOuter) > maximumPathY(glideOuter));
});

test('reduced motion freezes sustained jets while normal glide breathes', () => {
  const reducedA = feedbackEvents(executeRealRender({
    loadedFrames: true, mode: 'glide', reducedMotion: true, time: 1,
  }));
  const reducedB = feedbackEvents(executeRealRender({
    loadedFrames: true, mode: 'glide', reducedMotion: true, time: 2,
  }));
  const normalA = feedbackEvents(executeRealRender({
    loadedFrames: true, mode: 'glide', reducedMotion: false, time: 1,
  }));
  const normalB = feedbackEvents(executeRealRender({
    loadedFrames: true, mode: 'glide', reducedMotion: false, time: 2,
  }));
  assert.deepEqual(reducedA, reducedB);
  assert.notDeepEqual(normalA, normalB);
});

test('normal glide adds two nozzle-aligned trail particles while reduced motion adds none', () => {
  const normal = executeRealRender({
    loadedFrames: true,
    mode: 'glide',
    reducedMotion: false,
  });
  const reduced = executeRealRender({
    loadedFrames: true,
    mode: 'glide',
    reducedMotion: true,
  });
  const normalGlideTrail = normal.trailSnapshot.filter((particle) => particle.glideJet);
  const reducedGlideTrail = reduced.trailSnapshot.filter((particle) => particle.glideJet);
  assert.equal(normalGlideTrail.length, 2);
  assert.deepEqual(normalGlideTrail.map((particle) => Math.sign(particle.engineSide)), [-1, 1]);
  assert.ok(normalGlideTrail.every((particle) => particle.life <= 0.24));
  assert.equal(reducedGlideTrail.length, 0);
});
