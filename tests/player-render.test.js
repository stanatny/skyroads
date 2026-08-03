'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function makeCanvasContext() {
  const gradient = { addColorStop() {} };
  const target = {
    drawImageCalls: 0,
    fillCalls: 0,
    drawImage(image) { this.drawImageCalls += 1; this.lastImageId = image && image.id; },
    fill() { this.fillCalls += 1; },
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

function executeRealSuperRender({ loadedFrames }) {
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
  for (const file of ['src/input.js', 'src/presentation.js', 'src/world-art.js']) {
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
  vm.runInContext(`${gameSource}
    STATE.mode = 'PLAYING';
    STATE.width = 960;
    STATE.height = 600;
    STATE.time = 1;
    STATE.tripleT = 10;
    STATE.gliding = true;
    STATE.visualAssets = ${visualAssets};
    renderPlayer(__renderContext);
  `, sandbox, { filename: loadedFrames ? 'game-super-loaded.js' : 'game-super-fallback.js' });
  return context;
}

test('real renderPlayer draws loaded super frames without losing shared geometry scope', () => {
  const context = executeRealSuperRender({ loadedFrames: true });
  assert.equal(context.drawImageCalls, 1);
  assert.equal(context.lastImageId, 'thrust-frame');
  assert.ok(context.fillCalls > 0);
});

test('real renderPlayer draws fallback super frames without losing shared geometry scope', () => {
  const context = executeRealSuperRender({ loadedFrames: false });
  assert.equal(context.drawImageCalls, 0);
  assert.ok(context.fillCalls > 0);
});
