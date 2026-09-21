'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(options = {}) {
  const calls = { nodes: [], buffers: [], starts: [], automation: [], resumes: 0 };
  let allocation = 0;
  let connection = 0;
  const context = {
    state: 'running', currentTime: 10, sampleRate: 48000,
    resume() { calls.resumes += 1; throw new Error('Unexpected audio resume'); },
    advance(seconds) {
      this.currentTime += seconds;
      for (const node of calls.nodes) {
        if (node.stopTime != null && node.stopTime <= this.currentTime && !node.ended) {
          node.ended = true;
          if (node.onended) node.onended();
        }
      }
    },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      const buffer = { length, sampleRate, numberOfChannels: channels, getChannelData: () => data };
      calls.buffers.push(buffer);
      return buffer;
    },
  };
  function parameter(kind, initial = 0) {
    return {
      value: initial,
      cancelScheduledValues(time) { calls.automation.push(['cancel', kind, time]); },
      setValueAtTime(value, time) { this.value = value; calls.automation.push(['set', kind, value, time]); },
      linearRampToValueAtTime(value, time) { this.value = value; calls.automation.push(['ramp', kind, value, time]); },
      setTargetAtTime(value, time, constant) {
        if (options.automationFailure) throw new Error('Automation failed');
        this.value = value; calls.automation.push(['target', kind, value, time, constant]);
      },
    };
  }
  function node(kind) {
    allocation += 1;
    if (allocation === options.failAllocationAt) throw new Error('Node allocation failed');
    const result = {
      kind, disconnected: false, connections: [],
      connect(destination) {
        connection += 1;
        if (connection === options.failConnectionAt) throw new Error('Node connection failed');
        this.connections.push(destination);
      },
      disconnect() { this.disconnected = true; this.connections = []; },
    };
    calls.nodes.push(result);
    return result;
  }
  context.createGain = () => ({ ...node('gain'), gain: parameter('gain', 1) });
  context.createBiquadFilter = () => ({ ...node('filter'), frequency: parameter('frequency'), Q: parameter('Q') });
  context.createStereoPanner = () => {
    if (options.brokenStereo) throw new Error('Stereo panning unavailable');
    return { ...node('panner'), pan: parameter('pan') };
  };
  context.createBufferSource = () => {
    const source = node('source');
    Object.assign(source, {
      playbackRate: parameter('rate', 1),
      start(time, offset) {
        if (options.startFailure) throw new Error('Source start failed');
        this.started = true;
        calls.starts.push({ source: this, time, offset });
      },
      stop(time = context.currentTime) {
        if (!this.started) throw new Error('Source not started');
        this.stopTime = time;
      },
    });
    return source;
  };
  // 节点记录必须保留真实实例，以检查完整断连而不是浅拷贝状态。
  for (const name of ['createGain', 'createBiquadFilter', 'createStereoPanner']) {
    const factory = context[name];
    context[name] = () => {
      const created = factory();
      calls.nodes[calls.nodes.length - 1] = created;
      return created;
    };
  }
  if (options.mono) delete context.createStereoPanner;
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => { throw new Error('Gameplay random must not be consumed'); };
  const sandbox = { Math: deterministicMath };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/flight_sky_audio.js'), 'utf8'), sandbox);
  const destination = { name: 'existing_sfx_master' };
  const sound = sandbox.Skyroads.flightSkyAudio.create({ context, destination });
  const cue = (phase, eventId = 'run:0', side = -1) => ({ active: true, phase, eventId, side });
  return { sound, context, destination, calls, cue };
}

test('flyby reuses one deterministic noise buffer and one graph across duplicate frame updates', () => {
  const h = harness();
  h.sound.update(h.cue(0.16));
  const initialNodes = h.calls.nodes.length;
  for (let frame = 0; frame < 900; frame += 1) {
    const cue = h.cue(0.17 + frame / 1500);
    h.sound.update(cue);
    const automation = h.calls.automation.length;
    h.sound.update(cue);
    assert.equal(h.calls.automation.length, automation);
  }
  assert.equal(h.calls.nodes.length, initialNodes);
  assert.equal(initialNodes, 7);
  assert.equal(h.calls.starts.length, 1);
  assert.equal(h.calls.buffers.length, 1);
  assert.equal(h.calls.resumes, 0);
  assert.equal(h.sound.getDiagnostics().startCount, 1);
  const other = harness(); other.sound.update(other.cue(0.3));
  assert.deepEqual(h.calls.buffers[0].getChannelData(0), other.calls.buffers[0].getChannelData(0));
  assert.equal(h.calls.buffers[0].length, 96000);
  assert.ok(h.calls.buffers[0].getChannelData(0).some((value) => Math.abs(value) > 0.1));
});

test('near-pass swells once and becomes quieter darker and centered as it recedes', () => {
  const h = harness();
  h.sound.update(h.cue(0.18)); const approach = h.sound.getDiagnostics();
  h.sound.update(h.cue(0.28)); const peak = h.sound.getDiagnostics();
  h.sound.update(h.cue(0.78)); const tail = h.sound.getDiagnostics();
  assert.ok(approach.gain < peak.gain / 3);
  assert.ok(tail.gain < peak.gain / 8);
  assert.ok(tail.airFrequency < peak.airFrequency / 2);
  assert.ok(Math.abs(tail.pan) < Math.abs(peak.pan) / 4);
  for (let phase = 0.16; phase < 0.98; phase += 0.001) {
    h.sound.update(h.cue(phase));
    const diagnostics = h.sound.getDiagnostics();
    assert.ok(diagnostics.gain >= 0 && diagnostics.gain <= 0.24);
    assert.ok(Math.abs(diagnostics.pan) <= 0.72);
  }
  h.sound.update(h.cue(0.78, 'run:0', 1));
  assert.equal(h.sound.getDiagnostics().pan, -tail.pan);
  assert.equal(h.calls.starts.length, 1);
});

test('pause releases smoothly and resume uses current phase without replaying the near-pass peak', () => {
  const h = harness();
  h.sound.update(h.cue(0.28)); const peak = h.sound.getDiagnostics().gain;
  h.sound.update(h.cue(0.68)); const tail = h.sound.getDiagnostics().gain;
  const buffer = h.calls.starts[0].source.buffer;
  h.sound.stop();
  assert.equal(h.sound.getDiagnostics().active, false);
  assert.equal(h.sound.getDiagnostics().liveGraphs, 1);
  assert.equal(h.calls.starts[0].source.stopTime, 10.065);
  h.context.advance(0.07);
  assert.equal(h.sound.getDiagnostics().liveNodes, 0);
  assert.ok(h.calls.nodes.every((node) => node.disconnected));
  h.sound.update(h.cue(0.68));
  assert.equal(h.sound.getDiagnostics().gain, tail);
  assert.ok(tail < peak / 5);
  assert.equal(h.calls.starts[1].source.buffer, buffer);
  assert.equal(h.calls.starts[1].offset, (0.68 * 8.5) % 2);
  assert.equal(h.calls.buffers.length, 1);
});

test('event replacement and rapid stop/resume keep at most two graphs and dispose disconnects all', () => {
  const h = harness();
  for (let iteration = 0; iteration < 100; iteration += 1) {
    h.sound.update(h.cue(0.3, `run:${iteration}`));
    assert.ok(h.sound.getDiagnostics().liveGraphs <= 2);
    assert.ok(h.sound.getDiagnostics().liveNodes <= 14);
    if (iteration % 3 === 0) h.sound.stop();
  }
  h.sound.dispose(); h.sound.dispose();
  assert.equal(h.sound.getDiagnostics().liveGraphs, 0);
  assert.equal(h.sound.getDiagnostics().noiseSamples, 0);
  assert.ok(h.calls.nodes.every((node) => node.disconnected));
  const starts = h.calls.starts.length;
  h.sound.update(h.cue(0.3, 'new_run'));
  assert.equal(h.calls.starts.length, starts);
});

test('inactive invalid completed and suspended cues stop safely without creating or resuming a context', () => {
  const h = harness();
  for (const phase of [undefined, NaN, Infinity, -1, 0, 0.1, 0.98, 1, 2]) {
    h.sound.update(h.cue(phase));
    assert.equal(h.sound.getDiagnostics().active, false);
  }
  assert.equal(h.calls.nodes.length, 0);
  h.sound.update(h.cue(0.3));
  h.context.state = 'suspended';
  h.sound.update(h.cue(0.4));
  assert.equal(h.sound.getDiagnostics().liveNodes, 0);
  assert.ok(h.calls.nodes.every((node) => node.disconnected));
  h.context.state = 'running';
  h.sound.update(h.cue(0.7));
  assert.equal(h.sound.getDiagnostics().active, true);
  h.sound.update({ active: false, phase: 0.7 });
  h.context.advance(0.07);
  assert.equal(h.sound.getDiagnostics().liveNodes, 0);
  assert.equal(h.calls.resumes, 0);
});

test('missing or rejected stereo panners degrade to mono using the existing destination', () => {
  for (const options of [{ mono: true }, { brokenStereo: true }]) {
    const h = harness(options); h.sound.update(h.cue(0.3));
    assert.equal(h.sound.getDiagnostics().active, true);
    assert.equal(h.sound.getDiagnostics().stereo, false);
    assert.equal(h.sound.getDiagnostics().liveNodes, 6);
    assert.equal(h.calls.nodes.at(-1).connections[0], h.destination);
  }
});

test('partial allocation connection and source failures disconnect every constructed node and do not retry each frame', () => {
  const cases = [
    ...Array.from({ length: 6 }, (_, index) => ({ failAllocationAt: index + 1 })),
    ...Array.from({ length: 8 }, (_, index) => ({ failConnectionAt: index + 1 })),
    { startFailure: true },
  ];
  for (const options of cases) {
    const h = harness(options);
    h.sound.update(h.cue(0.3));
    assert.equal(h.sound.getDiagnostics().active, false, JSON.stringify(options));
    assert.equal(h.sound.getDiagnostics().liveNodes, 0);
    assert.ok(h.calls.nodes.every((node) => node.disconnected));
    const nodeCount = h.calls.nodes.length;
    for (let frame = 0; frame < 30; frame += 1) h.sound.update(h.cue(0.3 + frame / 100));
    assert.equal(h.calls.nodes.length, nodeCount);
    assert.equal(h.sound.getDiagnostics().failureCount, 1);
  }
});

test('automation failure cleans an already playing graph and ended callback clears released resources', () => {
  const h = harness({ automationFailure: true });
  h.sound.update(h.cue(0.3));
  assert.equal(h.sound.getDiagnostics().active, true);
  h.sound.update(h.cue(0.4));
  assert.equal(h.sound.getDiagnostics().active, false);
  assert.ok(h.calls.nodes.every((node) => node.disconnected));
  assert.equal(h.calls.starts[0].source.stopTime, 10);
  const clean = harness(); clean.sound.update(clean.cue(0.3)); clean.sound.stop();
  const source = clean.calls.starts[0].source;
  assert.equal(typeof source.onended, 'function');
  clean.context.advance(0.1);
  assert.equal(source.onended, null);
  assert.equal(clean.sound.getDiagnostics().liveNodes, 0);
});
