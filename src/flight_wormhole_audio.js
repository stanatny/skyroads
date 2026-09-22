'use strict';

// 虫洞声音复用宿主 SFX 总线；所有阶段由物理 elapsed 驱动，不创建或解锁 AudioContext。
(function attachFlightWormholeAudio(scope) {
  const DURATION = 2.4;
  const RELEASE_SECONDS = 0.065;
  const STAGES = ['capture', 'tear', 'tunnel', 'exit'];
  const STAGE_STARTS = [0, 0.25, 0.45, 2.05];

  /** create 接收现有 context/destination，返回状态更新、淡出停止、释放和只读诊断接口。 */
  function create({ context, destination } = {}) {
    let current = null;
    let retiring = null;
    let noiseBuffer = null;
    let disposed = false;
    let previousKey = null;
    let seenStages = 0;
    let failedKey = null;
    let failureCount = 0;
    let startCount = 0;
    let cueCount = 0;
    let lastPhase = 'off';
    let lastElapsed = 0;
    let lastTargets = null;
    const now = () => Number.isFinite(context && context.currentTime) ? context.currentTime : 0;

    function cleanup(graph) {
      if (!graph || graph.cleaned) return;
      graph.cleaned = true;
      for (const source of graph.sources) {
        source.onended = null;
        if (!graph.stopped && graph.started.has(source)) {
          try { source.stop(now()); } catch (_) {}
        }
      }
      for (const node of graph.nodes) { try { node.disconnect(); } catch (_) {} }
      if (current === graph) current = null;
      if (retiring === graph) retiring = null;
    }

    // 最多保留一份淡出尾音；静音和暂停不清除已消费的阶段标记。
    function stop() {
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
        for (const source of graph.sources) source.stop(time + RELEASE_SECONDS);
        graph.stopped = true;
      } catch (_) { cleanup(graph); }
    }

    function getNoise() {
      if (noiseBuffer) return noiseBuffer;
      const rate = context.sampleRate;
      if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new Error('Unsupported audio sample rate');
      const buffer = context.createBuffer(1, Math.floor(rate * 2), rate);
      const samples = buffer.getChannelData(0);
      let seed = 0x57415250;
      let previous = 0;
      for (let index = 0; index < samples.length; index += 1) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        previous = ((seed >>> 0) / 2147483648 - 1) * 0.71 + previous * 0.29;
        samples[index] = previous;
      }
      noiseBuffer = buffer;
      return buffer;
    }

    function smooth(parameter, value, time, first) {
      parameter.cancelScheduledValues(time);
      if (first) parameter.setValueAtTime(value, time);
      else if (typeof parameter.setTargetAtTime === 'function') parameter.setTargetAtTime(value, time, 0.018);
      else { parameter.setValueAtTime(parameter.value, time); parameter.linearRampToValueAtTime(value, time + 0.035); }
    }

    function retarget(graph, targets, first) {
      const time = now();
      for (const [parameter, value] of [
        [graph.air.gain, targets.airGain], [graph.pressure.gain, targets.pressureGain],
        [graph.bassGain.gain, targets.bassGain], [graph.whineGain.gain, targets.whineGain],
        [graph.airFilter.frequency, targets.airFrequency], [graph.lowFilter.frequency, targets.lowFrequency],
        [graph.bass.frequency, targets.bassFrequency], [graph.whine.frequency, targets.whineFrequency],
        [graph.noise.playbackRate, targets.playbackRate],
      ]) smooth(parameter, value, time, first);
    }

    function start(key, elapsed, targets) {
      const graph = { nodes: [], sources: [], started: new Set(), stopped: false, cleaned: false, elapsed };
      const keep = node => { graph.nodes.push(node); return node; };
      const source = node => { keep(node); graph.sources.push(node); return node; };
      try {
        const buffer = getNoise();
        graph.noise = source(context.createBufferSource());
        graph.noise.buffer = buffer; graph.noise.loop = true;
        graph.airFilter = keep(context.createBiquadFilter());
        graph.airFilter.type = 'bandpass'; graph.airFilter.Q.value = 0.6;
        graph.lowFilter = keep(context.createBiquadFilter());
        graph.lowFilter.type = 'lowpass'; graph.lowFilter.Q.value = 0.5;
        graph.air = keep(context.createGain()); graph.pressure = keep(context.createGain());
        graph.bass = source(context.createOscillator()); graph.bass.type = 'sine';
        graph.bassGain = keep(context.createGain());
        graph.whine = source(context.createOscillator()); graph.whine.type = 'triangle';
        graph.whineGain = keep(context.createGain());
        graph.accent = source(context.createOscillator()); graph.accent.type = 'sine';
        graph.accentGain = keep(context.createGain()); graph.accentGain.gain.value = 0;
        graph.impact = keep(context.createGain()); graph.impact.gain.value = 0;
        graph.output = keep(context.createGain());
        graph.output.gain.setValueAtTime(0, now());
        graph.output.gain.linearRampToValueAtTime(0.78, now() + 0.035);
        graph.noise.connect(graph.airFilter); graph.noise.connect(graph.lowFilter);
        graph.airFilter.connect(graph.air); graph.airFilter.connect(graph.impact);
        graph.lowFilter.connect(graph.pressure);
        graph.bass.connect(graph.bassGain); graph.whine.connect(graph.whineGain); graph.accent.connect(graph.accentGain);
        for (const gain of [graph.air, graph.pressure, graph.bassGain, graph.whineGain, graph.accentGain, graph.impact]) gain.connect(graph.output);
        graph.output.connect(destination);
        retarget(graph, targets, true);
        graph.noise.onended = () => cleanup(graph);
        for (const node of graph.sources) {
          if (node === graph.noise) node.start(now(), elapsed % 2);
          else node.start(now());
          graph.started.add(node);
        }
        current = graph;
        startCount += 1;
        return graph;
      } catch (_) {
        failureCount += 1; failedKey = key; cleanup(graph);
        return null;
      }
    }

    function accent(graph, stage) {
      const cue = stage === 0 ? [42, 84, 0.052, 0.034, 0.22]
        : stage === 1 ? [170, 720, 0.038, 0.13, 0.17]
          : stage === 3 ? [660, 1320, 0.082, 0.055, 0.28] : null;
      if (!cue) return;
      const time = now();
      const [startHz, endHz, tone, impact, duration] = cue;
      graph.accent.frequency.cancelScheduledValues(time);
      graph.accent.frequency.setValueAtTime(startHz, time);
      graph.accent.frequency.exponentialRampToValueAtTime(endHz, time + duration);
      for (const [parameter, peak] of [[graph.accentGain.gain, tone], [graph.impact.gain, impact]]) {
        parameter.cancelScheduledValues(time);
        parameter.setValueAtTime(0.0001, time);
        parameter.linearRampToValueAtTime(peak, time + 0.015);
        parameter.exponentialRampToValueAtTime(0.0001, time + duration);
      }
      cueCount += 1;
    }

    /** update 每帧读取 STATE；enabled 表示 SFX 未静音且拥有音频输出权，暂停时仍需调用以记住阶段。 */
    function update(state = {}, { enabled = true } = {}) {
      if (disposed) return;
      const warp = state.wormhole || {};
      const key = `${state.runId == null ? '' : state.runId}:${warp.eventId == null ? '' : warp.eventId}`;
      if (key !== previousKey) {
        stop(); previousKey = key; seenStages = 0; failedKey = null;
      }
      const elapsed = Number(warp.elapsed);
      lastElapsed = Number.isFinite(elapsed) ? elapsed : 0;
      if (!warp.active || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= DURATION) {
        lastPhase = 'off'; stop(); return;
      }
      const stage = elapsed < 0.25 ? 0 : elapsed < 0.45 ? 1 : elapsed < 2.05 ? 2 : 3;
      lastPhase = STAGES[stage];
      const firstStageFrame = !(seenStages & (1 << stage));
      // 静音或暂停时也消费阶段；恢复不会补播已错过的捕获、撕裂或到达重音。
      seenStages |= (1 << (stage + 1)) - 1;
      const audible = enabled && state.mode === 'PLAYING' && context && context.state === 'running' && destination;
      if (!audible) { stop(); return; }
      if (failedKey === key) return;
      if (current && current.elapsed === elapsed && !firstStageFrame) return;
      const targets = targetsForElapsed(elapsed);
      lastTargets = targets;
      try {
        const graph = current || start(key, elapsed, targets);
        if (!graph) return;
        retarget(graph, targets, false);
        graph.elapsed = elapsed;
        if (firstStageFrame && elapsed - STAGE_STARTS[stage] <= 0.12) accent(graph, stage);
      } catch (_) {
        failureCount += 1; failedKey = key; cleanup(current);
      }
    }

    function dispose() {
      if (disposed) return;
      disposed = true; cleanup(current); cleanup(retiring); noiseBuffer = null;
    }
    function getDiagnostics() {
      return { active: !!current, disposed, phase: lastPhase, elapsed: lastElapsed,
        eventKey: previousKey, startCount, cueCount, failureCount,
        liveGraphs: Number(!!current) + Number(!!retiring),
        liveNodes: (current ? current.nodes.length : 0) + (retiring ? retiring.nodes.length : 0),
        gain: current && lastTargets ? lastTargets.gain : 0,
        noiseSamples: noiseBuffer ? noiseBuffer.length : 0, releaseSeconds: RELEASE_SECONDS };
    }
    return { update, stop, dispose, getDiagnostics };
  }

  function targetsForElapsed(elapsed) {
    const capture = Math.min(1, elapsed / 0.25);
    const tear = Math.max(0, Math.min(1, (elapsed - 0.25) / 0.20));
    const tunnel = Math.max(0, Math.min(1, (elapsed - 0.45) / 1.60));
    const exit = Math.max(0, Math.min(1, (elapsed - 2.05) / 0.35));
    const airGain = elapsed < 0.25 ? 0.015 + capture * 0.028 : (0.105 - tunnel * 0.022) * (1 - exit);
    const pressureGain = (elapsed < 0.25 ? 0.022 + capture * 0.014 : 0.032 - tunnel * 0.009) * (1 - exit);
    const bassGain = (elapsed < 0.25 ? 0.050 + capture * 0.030 : 0.061 - tunnel * 0.017) * (1 - exit);
    const whineGain = (elapsed < 0.25 ? capture * 0.009 : 0.021) * (1 - exit);
    return { airGain, pressureGain, bassGain, whineGain,
      gain: (airGain + pressureGain + bassGain + whineGain) * 0.78,
      airFrequency: elapsed < 0.25 ? 460 + capture * 1250 : 3200 + tear * 1800 - tunnel * 1700 - exit * 2400,
      lowFrequency: 105 + capture * 80 - tunnel * 45,
      bassFrequency: elapsed < 0.25 ? 34 + capture * 40 : 98 - tunnel * 35 + exit * 25,
      whineFrequency: elapsed < 0.25 ? 180 + capture * 280 : 660 + tear * 620 - tunnel * 330 + exit * 440,
      playbackRate: 0.80 + capture * 0.20 + tear * 0.20 - tunnel * 0.15 };
  }
  const api = Object.freeze({ create });
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightWormholeAudio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
