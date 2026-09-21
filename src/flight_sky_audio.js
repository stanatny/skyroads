'use strict';

// 天空英雄的声音只跟随显示阶段，不读取或消耗游戏随机数，也不自行解锁音频。
(function attachFlightSkyAudio(scope) {
  const RELEASE_SECONDS = 0.065;
  const NOISE_SECONDS = 2;
  const NOISE_SEED = 0x534b5948;

  /**
   * 创建飞掠音效控制器，context 和 destination 由现有音效系统提供。
   * update 接收可见性、完整飞行阶段 phase（0..1）、方向 side 和唯一 eventId；
   * 返回停止、释放及只读诊断接口，暂停后按当前阶段恢复，不重播掠过峰值。
   */
  function create({ context, destination } = {}) {
    let current = null;
    let retiring = null;
    let noiseBuffer = null;
    let disposed = false;
    let startCount = 0;
    let failureCount = 0;
    let failedEventId = null;
    let failedEvent = false;
    let lastPhase = null;
    let lastEventId = null;
    let lastTargets = null;

    function now() { return Number.isFinite(context && context.currentTime) ? context.currentTime : 0; }

    function cleanup(graph) {
      if (!graph || graph.cleaned) return;
      graph.cleaned = true;
      if (graph.source) {
        graph.source.onended = null;
        if (graph.started && !graph.stopped) {
          try { graph.source.stop(now()); } catch (_) {}
        }
      }
      for (const node of graph.nodes) {
        try { node.disconnect(); } catch (_) {}
      }
      if (current === graph) current = null;
      if (retiring === graph) retiring = null;
    }

    function stop() {
      // 停止的尾音最多保留一份；频繁静音/恢复或切换事件也不会堆积图节点。
      if (!current) {
        if (!context || context.state !== 'running') cleanup(retiring);
        return;
      }
      cleanup(retiring);
      const graph = current;
      current = null;
      if (!context || context.state !== 'running') { cleanup(graph); return; }
      retiring = graph;
      try {
        const time = now();
        graph.output.gain.cancelScheduledValues(time);
        graph.output.gain.setValueAtTime(graph.output.gain.value, time);
        graph.output.gain.linearRampToValueAtTime(0, time + RELEASE_SECONDS);
        graph.source.stop(time + RELEASE_SECONDS);
        graph.stopped = true;
      } catch (_) { cleanup(graph); }
    }

    function getNoise() {
      if (noiseBuffer) return noiseBuffer;
      const rate = context.sampleRate;
      if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) {
        throw new Error('Unsupported audio sample rate');
      }
      const buffer = context.createBuffer(1, Math.floor(rate * NOISE_SECONDS), rate);
      const samples = buffer.getChannelData(0);
      let seed = NOISE_SEED;
      let previous = 0;
      for (let index = 0; index < samples.length; index += 1) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const white = (seed >>> 0) / 2147483648 - 1;
        previous = white * 0.65 + previous * 0.35;
        samples[index] = previous;
      }
      noiseBuffer = buffer;
      return noiseBuffer;
    }

    function smooth(parameter, value, time) {
      parameter.cancelScheduledValues(time);
      if (typeof parameter.setTargetAtTime === 'function') {
        parameter.setTargetAtTime(value, time, 0.025);
      } else {
        parameter.setValueAtTime(parameter.value, time);
        parameter.linearRampToValueAtTime(value, time + 0.045);
      }
    }

    function retarget(graph, targets, first) {
      const time = now();
      const values = [
        [graph.air.gain, targets.airGain], [graph.pressure.gain, targets.pressureGain],
        [graph.airFilter.frequency, targets.airFrequency],
        [graph.pressureFilter.frequency, targets.pressureFrequency],
        [graph.source.playbackRate, targets.playbackRate],
      ];
      if (graph.panner) values.push([graph.panner.pan, targets.pan]);
      for (const [parameter, value] of values) {
        if (first) parameter.setValueAtTime(value, time);
        else smooth(parameter, value, time);
      }
    }

    function start(eventId, phase, side, targets) {
      const graph = { nodes: [], source: null, started: false, stopped: false, cleaned: false,
        eventId, phase, side, panner: null };
      const keep = (node) => { graph.nodes.push(node); return node; };
      try {
        const buffer = getNoise();
        graph.source = keep(context.createBufferSource());
        graph.source.buffer = buffer;
        graph.source.loop = true;
        graph.airFilter = keep(context.createBiquadFilter());
        graph.airFilter.type = 'bandpass'; graph.airFilter.Q.value = 0.55;
        graph.pressureFilter = keep(context.createBiquadFilter());
        graph.pressureFilter.type = 'lowpass'; graph.pressureFilter.Q.value = 0.5;
        graph.air = keep(context.createGain());
        graph.pressure = keep(context.createGain());
        graph.output = keep(context.createGain());
        graph.output.gain.setValueAtTime(0, now());
        graph.output.gain.linearRampToValueAtTime(1, now() + 0.045);
        // 老设备没有立体声节点时仍然保留完整的单声道掠过反馈。
        if (typeof context.createStereoPanner === 'function') {
          try { graph.panner = keep(context.createStereoPanner()); } catch (_) {}
        }
        graph.source.connect(graph.airFilter); graph.source.connect(graph.pressureFilter);
        graph.airFilter.connect(graph.air); graph.pressureFilter.connect(graph.pressure);
        graph.air.connect(graph.output); graph.pressure.connect(graph.output);
        if (graph.panner) { graph.output.connect(graph.panner); graph.panner.connect(destination); }
        else graph.output.connect(destination);
        retarget(graph, targets, true);
        graph.source.onended = () => cleanup(graph);
        graph.source.start(now(), (phase * 8.5) % NOISE_SECONDS);
        graph.started = true;
        startCount += 1;
        current = graph;
      } catch (_) {
        failureCount += 1;
        failedEvent = true;
        failedEventId = eventId;
        cleanup(graph);
      }
    }

    function update({ active = false, phase, side = 1, eventId = null } = {}) {
      if (disposed) return;
      lastPhase = Number.isFinite(phase) ? phase : null;
      lastEventId = eventId;
      if (!active || !Number.isFinite(phase) || phase < 0.16 || phase >= 0.98
        || !context || context.state !== 'running' || !destination) {
        stop(); return;
      }
      if (failedEvent && failedEventId === eventId) return;
      const direction = side < 0 ? -1 : 1;
      if (current && current.eventId !== eventId) stop();
      if (current && current.phase === phase && current.side === direction) return;
      const targets = targetsForPhase(phase, direction);
      lastTargets = targets;
      if (!current) { start(eventId, phase, direction, targets); return; }
      try {
        retarget(current, targets, false);
        current.phase = phase;
        current.side = direction;
      } catch (_) {
        failureCount += 1;
        failedEvent = true;
        failedEventId = eventId;
        cleanup(current);
      }
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      cleanup(current); cleanup(retiring);
      noiseBuffer = null;
    }

    function getDiagnostics() {
      return { active: !!current, disposed, startCount, failureCount, phase: lastPhase,
        eventId: lastEventId, liveGraphs: Number(!!current) + Number(!!retiring),
        liveNodes: (current ? current.nodes.length : 0) + (retiring ? retiring.nodes.length : 0),
        stereo: !!(current && current.panner), gain: current && lastTargets ? lastTargets.gain : 0,
        pan: current && lastTargets ? lastTargets.pan : 0,
        airFrequency: current && lastTargets ? lastTargets.airFrequency : 0,
        noiseSamples: noiseBuffer ? noiseBuffer.length : 0,
        releaseSeconds: RELEASE_SECONDS };
    }

    return { update, stop, dispose, getDiagnostics };
  }

  function smoothstep(start, end, value) {
    const progress = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return progress * progress * (3 - 2 * progress);
  }

  function targetsForPhase(phase, side) {
    const approach = smoothstep(0.16, 0.28, phase);
    const distance = Math.max(0, phase - 0.28);
    const strength = approach * Math.exp(-distance * 4.8) * (1 - smoothstep(0.80, 0.98, phase));
    const doppler = smoothstep(0.23, 0.48, phase);
    return { airGain: 0.195 * strength, pressureGain: 0.045 * strength, gain: 0.24 * strength,
      airFrequency: 900 + 2600 * (1 - doppler) + 300 * Math.exp(-distance * 4),
      pressureFrequency: 82 + 110 * (1 - doppler), playbackRate: 1.19 - 0.47 * doppler,
      pan: side * 0.72 * (1 - smoothstep(0.18, 0.92, phase)) };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightSkyAudio = { create };
})(typeof globalThis !== 'undefined' ? globalThis : window);
