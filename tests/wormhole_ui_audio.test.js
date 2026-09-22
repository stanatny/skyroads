'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cockpitUi = require('../src/cockpit_ui.js');
const { createTranslator } = require('../src/i18n.js');
const wormholeAudio = require('../src/flight_wormhole_audio.js');

// 仅模拟本模块使用的 DOM 能力；真实视口与布局另由浏览器验收。
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {};
    this.hidden = false; this.className = ''; this.textContent = '';
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  insertBefore(node, before) { node.parentNode = this; this.children.splice(this.children.indexOf(before), 0, node); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
}
function uiHarness(locale = 'en') {
  const document = { body: new Element('body'), createElement: tag => new Element(tag) };
  const ui = cockpitUi.create({ document }); ui.setAvailable(true);
  const state = { mode: 'PLAYING', runId: 'hud-run', time: 1, fuel: 9, speed: 12, position: 100,
    translator: createTranslator(locale), movement: { lanePosition: 3 }, track: [], wormhole: null };
  const node = className => {
    const visit = parent => parent.className.split(' ').includes(className) ? parent : parent.children.map(visit).find(Boolean);
    return visit(document.body);
  };
  const update = () => ui.update(state, { DISTANCE_PER_SEGMENT: 10, FUEL_MAX: 100 });
  return { document, ui, state, node, update };
}

test('bilingual wormhole preview follows actual gate distance and high-route direction', () => {
  for (const locale of ['en', 'zh-CN']) {
    const h = uiHarness(locale);
    h.state.wormhole = { gate: { id: 'gate', segment: 180, lane: 0 }, active: false };
    h.update();
    assert.equal(h.node('cockpit-wormhole').hidden, false);
    assert.match(h.node('cockpit-wormhole-value').textContent, /800/);
    assert.match(h.node('cockpit-wormhole-detail').textContent, locale === 'en' ? /LEFT.*APEX/ : /左侧高架.*近顶点再跳/);
    h.state.wormhole.gate.lane = 6; h.state.time += 0.1; h.update();
    assert.match(h.node('cockpit-wormhole-detail').textContent, locale === 'en' ? /RIGHT/ : /右侧/);
    h.state.wormhole.gate.segment = 201; h.state.time += 0.1; h.update();
    assert.equal(h.node('cockpit-wormhole').hidden, true);
    h.state.wormhole.gate.segment = 99; h.state.time += 0.1; h.update();
    assert.equal(h.node('cockpit-wormhole').hidden, true);
  }
});

test('warp phases bypass HUD throttling, protect energy feedback and show progress without changing STATE', () => {
  const h = uiHarness('zh-CN');
  h.state.wormhole = { active: true, elapsed: 0.1, eventId: 1, lastRewardMeters: 6000 };
  h.update();
  for (const [elapsed, phase] of [[0.1, '引力捕获'], [0.3, '撕开空间'], [1.2, '时空穿梭'], [2.2, '返回航道']]) {
    h.state.wormhole.elapsed = elapsed;
    const before = JSON.stringify(h.state); h.update();
    assert.equal(h.node('cockpit-wormhole-title').textContent, phase);
    assert.equal(h.node('cockpit-warning').hidden, true);
    assert.equal(h.node('cockpit-systems').dataset.fuel, 'protected');
    assert.match(h.node('cockpit-wormhole-detail').textContent, /能量零消耗.*增益计时暂停/);
    assert.equal(JSON.stringify(h.state), before);
  }
  h.state.time += 0.1; h.state.wormhole.elapsed = 1.2; h.update();
  assert.equal(h.node('cockpit-wormhole-meter').getAttribute('aria-valuenow'), '50');
  h.state.mode = 'PAUSED'; h.update();
  assert.equal(h.node('cockpit-wormhole-title').textContent, '时空穿梭');
  assert.equal(h.node('cockpit-wormhole-meter').getAttribute('aria-valuenow'), '50');
});

test('completion shows the real reward, then clears on expiry or menu while ordinary low-fuel warnings return', () => {
  const h = uiHarness();
  h.state.wormhole = { active: false, elapsed: 2.4, completedT: 2.8, graceT: 2, lastRewardMeters: 6000 };
  h.update();
  assert.equal(h.node('cockpit-wormhole-title').textContent, 'WARP COMPLETE');
  assert.match(h.node('cockpit-wormhole-value').textContent, /\+6,000 M/);
  assert.equal(h.node('cockpit-warning').hidden, false);
  assert.doesNotMatch(h.node('cockpit-wormhole-detail').textContent, /NO DRAIN/);
  h.state.wormhole.completedT = 0; h.state.time += 0.1; h.update();
  assert.equal(h.node('cockpit-wormhole').hidden, true);
  h.state.wormhole.active = true; h.state.mode = 'MENU'; h.update();
  assert.equal(h.node('cockpit-wormhole').hidden, true);
  for (const locale of ['en', 'zh-CN']) {
    const translator = createTranslator(locale);
    for (const key of ['capture', 'tear', 'tunnel', 'exit', 'complete', 'noDrain']) {
      assert.ok(!translator.t(`wormhole.${key}`).startsWith('['), `missing fallback label ${locale}/${key}`);
    }
  }
  h.ui.dispose(); assert.equal(h.document.body.children.length, 0);
});

test('the same warp number counts every frame and settles the actual reward without replaying', () => {
  const h = uiHarness();
  h.state.width = 1440; h.state.height = 900;
  h.state.wormhole = { active: true, elapsed: 1.2, eventId: 8, completedT: 0 };
  h.update();
  const value = h.node('cockpit-wormhole-value');
  assert.match(value.textContent, /3,000/);
  h.state.wormhole.elapsed = 1.216; h.update();
  assert.match(value.textContent, /3,040/, 'counting must not wait for the ordinary HUD throttle');
  Object.assign(h.state.wormhole, { active: false, elapsed: 2.4, completedT: 2.8, graceT: 2, lastRewardMeters: 5890 });
  h.update();
  const panel = h.node('cockpit-wormhole');
  assert.equal(h.node('cockpit-wormhole-value'), value);
  assert.match(value.textContent, /\+5,890 M/);
  assert.match(h.node('cockpit-wormhole-detail').textContent, /TOTAL DISTANCE.*2\.0s/);
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 21);
  h.state.wormhole.completedT = 2.42; h.update();
  assert.ok(Number.parseFloat(panel.style['--warp-value-size']) > 60);
  h.state.wormhole.completedT = 1.8; h.update();
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 60);
  assert.ok(Number.parseFloat(panel.style['--warp-settle-x']) > 400);
  const frozen = JSON.stringify(panel.style);
  h.state.mode = 'PAUSED'; h.state.time += 30; h.update();
  assert.equal(JSON.stringify(panel.style), frozen);
  h.state.mode = 'PLAYING'; h.state.translator = createTranslator('zh-CN'); h.update();
  assert.equal(JSON.stringify(panel.style), frozen, 'locale or pause changes must not restart settlement');
  h.state.wormhole.completedT = 0.15; h.update();
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 21);
  h.state.wormhole.completedT = 2.8; h.update();
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 21, 'the same event cannot replay');
  h.state.runId = 'next-run'; h.state.wormhole.eventId = 1; h.update();
  h.state.wormhole.completedT = 1.8; h.update();
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 60);
});

test('reduced motion uses a static readable settlement and menu or a new warp clears it', () => {
  const h = uiHarness('zh-CN'); h.state.reducedMotion = true; h.state.width = 390; h.state.height = 844;
  h.state.wormhole = { active: false, elapsed: 2.4, completedT: 2.8, graceT: 2, eventId: 1, lastRewardMeters: 6000 };
  const before = JSON.stringify(h.state); h.update(); assert.equal(JSON.stringify(h.state), before);
  const panel = h.node('cockpit-wormhole');
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 48);
  assert.equal(Number.parseFloat(panel.style['--warp-settle-x']), 0);
  const frozen = JSON.stringify(panel.style);
  h.state.wormhole.completedT = 0.4; h.update();
  assert.equal(JSON.stringify(panel.style), frozen);
  h.state.mode = 'MENU'; h.update();
  assert.equal(panel.hidden, true);
  assert.equal(h.node('cockpit-interface').dataset.warpSettling, 'false');
  h.state.mode = 'PLAYING'; h.state.wormhole = { active: true, elapsed: 0.2, eventId: 2 }; h.update();
  assert.equal(panel.dataset.settlement, 'off');
  assert.equal(Number.parseFloat(panel.style['--warp-value-size']), 19);
  assert.match(h.node('cockpit-wormhole-detail').textContent, /增益计时暂停/);
});

function audioHarness(options = {}) {
  const calls = { nodes: [], starts: [], buffers: [], resume: 0 };
  const context = { state: 'running', currentTime: 4, sampleRate: 48000,
    resume() { calls.resume += 1; },
    createBuffer(channels, length, rate) { const samples = new Float32Array(length); const buffer = { length, sampleRate: rate, getChannelData: () => samples }; calls.buffers.push(buffer); return buffer; },
    advance(dt) { this.currentTime += dt; calls.nodes.forEach(n => { if (n.stopTime <= this.currentTime && !n.ended) { n.ended = true; if (n.onended) n.onended(); } }); },
  };
  const parameter = value => ({ value, cancelScheduledValues() {},
    setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
  const node = kind => {
    if (calls.nodes.length + 1 === options.failAllocationAt) throw new Error('Node creation failed');
    const n = { kind, disconnected: false, connect() {}, disconnect() { this.disconnected = true; },
      start(time, offset) { this.started = true; calls.starts.push({ node: this, time, offset }); },
      stop(time = context.currentTime) { this.stopTime = time; },
    }; calls.nodes.push(n); return n;
  };
  context.createGain = () => Object.assign(node('gain'), { gain: parameter(1) });
  context.createBiquadFilter = () => Object.assign(node('filter'), { frequency: parameter(350), Q: parameter(1) });
  context.createBufferSource = () => Object.assign(node('noise'), { playbackRate: parameter(1) });
  context.createOscillator = () => Object.assign(node('oscillator'), { frequency: parameter(100), detune: parameter(0) });
  const sound = wormholeAudio.create({ context, destination: { existingSfxBus: true } });
  const state = { mode: 'PLAYING', runId: 'audio-run', wormhole: { active: true, elapsed: 0, eventId: 1 } };
  const update = (elapsed, enabled = true) => { state.wormhole.elapsed = elapsed; sound.update(state, { enabled }); };
  return { sound, state, update, calls, context };
}

test('synthesised warp uses one graph and one deterministic buffer through all four stages', () => {
  const h = audioHarness(); h.update(0);
  const allocated = h.calls.nodes.length;
  for (let frame = 1; frame < 144; frame += 1) h.update(frame / 60);
  assert.equal(h.calls.nodes.length, allocated);
  assert.equal(h.calls.buffers.length, 1);
  assert.equal(h.calls.resume, 0);
  assert.equal(h.sound.getDiagnostics().cueCount, 3, 'capture, tear and exit accents play once each');
  assert.ok(h.sound.getDiagnostics().gain <= 0.4);
  const other = audioHarness(); other.update(0);
  assert.deepEqual(h.calls.buffers[0].getChannelData(0), other.calls.buffers[0].getChannelData(0));
  h.state.wormhole.active = false; h.sound.update(h.state); h.context.advance(0.1);
  assert.equal(h.sound.getDiagnostics().liveNodes, 0);
});

test('muting and pausing consume phase cues without replaying an impact on resume', () => {
  const h = audioHarness(); h.update(0);
  h.update(0.3); assert.equal(h.sound.getDiagnostics().cueCount, 2);
  h.update(0.3, false); h.context.advance(0.1); h.update(0.3, true);
  assert.equal(h.sound.getDiagnostics().cueCount, 2);
  h.state.mode = 'PAUSED'; h.update(0.3); h.context.advance(0.1);
  assert.equal(h.sound.getDiagnostics().active, false);
  h.state.mode = 'PLAYING'; h.update(0.3);
  assert.equal(h.sound.getDiagnostics().cueCount, 2);
  h.update(2.1, false); h.context.advance(0.1); h.update(2.1, true);
  assert.equal(h.sound.getDiagnostics().cueCount, 2, 'muted exit must not become a late exit burst');
  assert.ok(h.sound.getDiagnostics().liveGraphs <= 2);
});

test('restart resets event identity and disposal or failed audio allocation never leaks graphs', () => {
  const h = audioHarness(); h.update(0); h.update(0.3);
  h.state.runId = 'new-run'; h.update(0);
  assert.equal(h.sound.getDiagnostics().cueCount, 3);
  h.sound.dispose(); h.sound.dispose();
  assert.equal(h.sound.getDiagnostics().liveNodes, 0);
  assert.equal(h.sound.getDiagnostics().noiseSamples, 0);
  assert.ok(h.calls.nodes.every(n => n.disconnected));
  const count = h.calls.nodes.length; h.update(1); assert.equal(h.calls.nodes.length, count);
  const broken = audioHarness({ failAllocationAt: 4 });
  for (let frame = 0; frame < 80; frame += 1) broken.update(frame / 60);
  assert.equal(broken.sound.getDiagnostics().failureCount, 1);
  assert.ok(broken.calls.nodes.every(n => n.disconnected));
  assert.equal(broken.sound.getDiagnostics().liveNodes, 0);
});
