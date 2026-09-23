'use strict';

(function attachCockpitUi(root) {
  /*********************************************
   * Public API
   ********************************************/

  // create 创建追尾视角的飞行 HUD；document 为宿主文档，返回只读状态更新、可用性与清理接口。
  function create({ document: documentObject = root.document } = {}) {
    if (!documentObject || !documentObject.body) throw new TypeError('A document with a body is required');
    const refs = {};
    const labels = [];
    const interfaceNode = element('div', 'cockpit-interface');
    interfaceNode.id = 'cockpit-interface';
    interfaceNode.hidden = true;
    interfaceNode.dataset.mode = 'MENU';
    interfaceNode.setAttribute('aria-label', 'Flight instruments');
    const masthead = element('div', 'cockpit-masthead');
    masthead.append(element('span', 'cockpit-wordmark', 'NC'), element('span', 'cockpit-edition', 'NEBULA CRUISE'));
    refs.status = element('div', 'cockpit-flight-status');
    masthead.append(refs.status);
    // 飞行状态固定在屏幕信息区，不再放在远处场景或瞄准点上。
    const modeReadout = element('div', 'cockpit-mode-readout');
    refs.flightMode = element('span', 'cockpit-flight-mode');
    modeReadout.append(label('cockpit-mode-label', 'flightState'), refs.flightMode);
    masthead.append(modeReadout);
    interfaceNode.append(masthead);

    const briefing = element('aside', 'cockpit-briefing');
    const sector = element('div', 'cockpit-sector');
    sector.append(element('span', 'cockpit-sector-label', 'SECTOR'), element('strong', '', '07'));
    const missionMap = element('div', 'cockpit-mission-map');
    missionMap.setAttribute('aria-hidden', 'true');
    for (let lane = 0; lane < ROUTE_LANES; lane += 1) missionMap.append(element('i'));
    briefing.append(label('cockpit-overline', 'briefing'), sector, missionMap, label('cockpit-briefing-copy', 'mission'), label('cockpit-briefing-detail', 'missionDetail'));
    const briefingFooter = element('div', 'cockpit-briefing-footer');
    briefingFooter.append(element('span', '', 'NC—07'), label('', 'chaseView'));
    briefing.append(briefingFooter);
    interfaceNode.append(briefing);

    refs.warning = element('div', 'cockpit-warning');
    refs.warning.setAttribute('role', 'status');
    refs.warning.setAttribute('aria-live', 'polite');
    refs.warning.hidden = true;

    refs.tutorial = element('div', 'cockpit-tutorial');
    refs.tutorial.hidden = true;
    refs.tutorialPhase = element('span', 'cockpit-tutorial-phase');
    refs.tutorialText = element('span');
    refs.tutorial.append(refs.tutorialPhase, refs.tutorialText);
    // 窄屏将教学、告警和限时状态按实际高度排列，避免同时出现时互相遮挡。
    const contextNode = element('div', 'cockpit-context');
    refs.wormhole = element('section', 'cockpit-wormhole');
    refs.wormhole.hidden = true;
    refs.wormholeHeading = element('span', 'cockpit-wormhole-heading');
    refs.wormholeTitle = element('strong', 'cockpit-wormhole-title');
    refs.wormholeTitle.setAttribute('role', 'status');
    refs.wormholeTitle.setAttribute('aria-live', 'polite');
    refs.wormholeValue = element('span', 'cockpit-wormhole-value');
    refs.wormholeDetail = element('span', 'cockpit-wormhole-detail');
    refs.wormholeMeter = meter('cockpit-wormhole-meter');
    refs.wormhole.append(refs.wormholeHeading, refs.wormholeTitle, refs.wormholeValue,
      refs.wormholeMeter.track, refs.wormholeDetail);
    contextNode.append(refs.wormhole, refs.tutorial, refs.warning);
    interfaceNode.append(contextNode);

    const consoleNode = element('section', 'cockpit-console');
    const systems = instrument('cockpit-systems', '01', 'reactor');
    const fuelReadout = element('div', 'cockpit-fuel-readout');
    fuelReadout.append(label('cockpit-label', 'fuel'));
    refs.fuel = element('strong', 'cockpit-fuel-value', '100');
    fuelReadout.append(refs.fuel, element('span', 'cockpit-unit', '%'));
    refs.fuelBar = meter('cockpit-fuel-bar', 'fuel');
    const jumpRow = element('div', 'cockpit-jump-row');
    jumpRow.append(label('cockpit-label', 'jumps'));
    refs.jumps = element('span', 'cockpit-jump-values');
    const jumpIndicators = Array.from({ length: 3 }, () => element('i'));
    refs.jumps.append(...jumpIndicators);
    jumpRow.append(refs.jumps);
    refs.burstStatus = element('span', 'cockpit-burst-status');
    const burstRow = element('div', 'cockpit-burst-row');
    burstRow.append(element('kbd', '', 'W / ↑'), refs.burstStatus);
    refs.burstBar = meter('cockpit-burst-bar', 'burst');
    const fuelModule = element('div', 'cockpit-fuel-module');
    fuelModule.append(fuelReadout, refs.fuelBar.track);
    const mobility = element('div', 'cockpit-mobility');
    mobility.append(jumpRow, burstRow, refs.burstBar.track);
    systems.append(fuelModule, mobility);

    const flight = instrument('cockpit-navigation', '02', 'navigation');
    const readings = element('div', 'cockpit-flight-readings');
    const speedReadout = element('div', 'cockpit-speed-readout');
    speedReadout.append(label('cockpit-label', 'speed'));
    refs.speed = element('strong', 'cockpit-speed-value', '000');
    speedReadout.append(refs.speed, element('span', 'cockpit-unit', 'M/S'));
    const altitudeReadout = element('div', 'cockpit-altitude-readout');
    altitudeReadout.append(label('cockpit-label', 'altitude'));
    refs.altitude = element('strong', 'cockpit-altitude-value', '0.0');
    altitudeReadout.append(refs.altitude, element('span', 'cockpit-unit', 'M'));
    refs.lane = element('span', 'cockpit-lane-id');
    altitudeReadout.append(refs.lane);
    readings.append(speedReadout, altitudeReadout);
    refs.route = element('div', 'cockpit-route');
    refs.route.setAttribute('role', 'img');
    const routeCells = Array.from({ length: ROUTE_ROWS * ROUTE_LANES }, () => {
      const cell = element('i', 'cockpit-route-cell');
      refs.route.append(cell);
      return cell;
    });
    const routeFooter = element('div', 'cockpit-route-footer');
    routeFooter.append(label('', 'route'));
    refs.routeRange = element('span');
    routeFooter.append(refs.routeRange);
    systems.insertBefore(readings, fuelModule);
    flight.append(refs.route, routeFooter);

    const tactical = instrument('cockpit-tactical', '03', 'tactical');
    const weaponRow = element('div', 'cockpit-weapon-row');
    weaponRow.append(label('cockpit-label', 'weapon'), element('kbd', '', 'J'));
    refs.weapon = element('strong', 'cockpit-weapon-state');
    refs.weaponBar = meter('cockpit-weapon-bar', 'weapon');
    const stats = element('div', 'cockpit-stats');
    refs.score = stat(stats, 'score', '00000');
    refs.distance = stat(stats, 'distance', '0 M');
    refs.elapsed = stat(stats, 'time', '00:00');
    tactical.append(weaponRow, refs.weapon, refs.weaponBar.track, flight);
    consoleNode.append(systems, tactical);
    interfaceNode.append(consoleNode);

    refs.effects = element('div', 'cockpit-effects');
    const effectEntries = EFFECTS.map((definition) => {
      const node = element('div', 'cockpit-effect');
      node.hidden = true;
      node.dataset.effect = definition.id;
      const name = label('', definition.id);
      const time = element('strong');
      node.append(name, time);
      refs.effects.append(node);
      return { ...definition, node, time };
    });
    contextNode.append(refs.effects);

    const controlRail = element('div', 'cockpit-control-rail');
    [['A / D', 'steer'], ['K / SPACE', 'jumpGlide'], ['J', 'fireCharge'], ['P', 'pause']].forEach(([key, id]) => {
      const control = element('span');
      control.append(element('kbd', '', key), label('', id));
      controlRail.append(control);
    });
    const statusRail = element('footer', 'cockpit-status-rail');
    statusRail.append(stats, controlRail);
    interfaceNode.append(statusRail);
    documentObject.body.append(interfaceNode);
    let available = false;
    let disposed = false;
    let previousLocale = '';
    let previousMode = '';
    let lastUpdate = -Infinity;
    let previousProtection = false;
    let previousChargeStage = 0;
    let previousSuperActive = false;
    let previousWormholeStage = '';
    let settlementKey = '';
    let settlementAge = 0;
    let lastSettlementFrame = '';

    // update 从 STATE / CONFIG 读取仪表真值；不改变游戏状态或输入，返回 undefined。
    function update(state = {}, config = {}) {
      if (disposed || !available) return;
      const locale = state.translator && state.translator.locale === 'zh-CN' ? 'zh-CN' : 'en';
      const mode = state.mode || 'MENU';
      const now = numeric(state.time) * 1000;
      const protection = root.Skyroads && root.Skyroads.flightStatusFx
        ? root.Skyroads.flightStatusFx.protection(state, config) : { active: false, remaining: 0, duration: 1 };
      const protectedNow = protection.active;
      const chargeRatio = clamp(numeric(state.chargeT) / positive(config.CHARGE_TIME, 1.5));
      const revealCharge = numeric(state.chargeT) >= positive(config.CHARGE_HUD_DELAY, 0.5);
      const chargeStage = chargeRatio >= 1 ? 2 : revealCharge ? 1 : 0;
      const superActive = state.tripleT > 0;
      const warp = state.wormhole || {};
      const missionActive = mode === 'PLAYING' || mode === 'PAUSED';
      const warping = missionActive && Boolean(warp.active);
      const warpElapsed = Math.max(0, numeric(warp.elapsed));
      const gateDistance = warp.gate ? (numeric(warp.gate.segment) - numeric(state.position))
        * positive(config.DISTANCE_PER_SEGMENT, 10) : -1;
      const warpPhase = !missionActive ? 'off' : warping ? (warpElapsed < 0.25 ? 'capture'
        : warpElapsed < 0.45 ? 'tear' : warpElapsed < 2.05 ? 'tunnel' : 'exit')
        : numeric(warp.completedT) > 0 ? 'complete' : warp.gate && gateDistance >= 0 && gateDistance <= 1000 ? 'preview' : 'off';
      const warpStage = `${warpPhase}:${warp.eventId || ''}:${warp.gate && warp.gate.id || ''}`;
      const messages = MESSAGES[locale];
      // 里程累计和结算跟随物理帧；其余仪表仍按原频率更新，暂停时没有独立动画时钟。
      updateWormhole(state, config, warp, warpPhase, warpElapsed, warping, gateDistance, messages, locale);
      // 状态切换立即同步，避免节流显示旧的保护提示或不可拾取的变身奖励。
      if (mode === previousMode && locale === previousLocale && protectedNow === previousProtection
        && chargeStage === previousChargeStage && superActive === previousSuperActive && warpStage === previousWormholeStage
        && now >= lastUpdate && now - lastUpdate < 70) return;
      previousProtection = protectedNow;
      previousChargeStage = chargeStage;
      previousSuperActive = superActive;
      previousWormholeStage = warpStage;
      lastUpdate = now;
      if (locale !== previousLocale) {
        labels.forEach(({ node, id }) => setText(node, messages[id] || id));
        interfaceNode.setAttribute('aria-label', messages.instruments);
        interfaceNode.dataset.locale = locale;
        previousLocale = locale;
      }
      previousMode = mode;
      interfaceNode.dataset.mode = mode;
      interfaceNode.dataset.reducedMotion = state.reducedMotion ? 'true' : 'false';
      interfaceNode.dataset.warping = warping ? 'true' : 'false';
      setText(refs.status, messages[mode] || mode);
      const fuel = Math.max(0, numeric(state.fuel));
      const fuelRatio = clamp(fuel / positive(config.FUEL_MAX, 100));
      setText(refs.fuel, String(Math.ceil(fuelRatio * 100)).padStart(2, '0'));
      setMeter(refs.fuelBar, fuelRatio, messages.fuel);
      systems.dataset.fuel = warping ? 'protected' : fuelRatio <= 0.15 ? 'critical' : fuelRatio <= 0.3 ? 'low' : 'normal';
      const maxJumps = state.tripleT > 0 ? 3 : positive(config.MAX_JUMPS, 2);
      const jumpsRemaining = Math.max(0, maxJumps - numeric(state.jumpsUsed));
      jumpIndicators.forEach((indicator, index) => {
        indicator.hidden = index >= maxJumps;
        indicator.dataset.available = index < jumpsRemaining ? 'true' : 'false';
      });
      refs.jumps.setAttribute('aria-label', `${messages.jumps}: ${jumpsRemaining}/${maxJumps}`);
      const burstReady = fuel >= positive(config.FUEL_BURST_MIN, 70) && numeric(state.playerY) <= 0
        && numeric(state.playerVY) <= 0 && !state.boostT && !state.fuelBurstT;
      setText(refs.burstStatus, state.fuelBurstT > 0 ? messages.burstActive : state.fuelBurstChargeT > 0 ? messages.charging : burstReady ? messages.burstReady : messages.burstMinimum);
      refs.burstStatus.dataset.ready = burstReady ? 'true' : 'false';
      setMeter(refs.burstBar, numeric(state.fuelBurstChargeT) / positive(config.FUEL_BURST_CHARGE_TIME, 1), messages.burst);

      const speed = numeric(state.speed) * positive(config.DISTANCE_PER_SEGMENT, 10);
      setText(refs.speed, String(Math.round(speed)).padStart(3, '0'));
      // 高度与距离使用同一世界单位换算，避免仪表沿用旧版段/秒的无量纲值。
      const metersPerUnit = positive(config.DISTANCE_PER_SEGMENT, 10) / positive(config.SEGMENT_LENGTH, 50);
      setText(refs.altitude, (Math.max(0, numeric(state.playerY)) * metersPerUnit).toFixed(1));
      const currentLane = Math.max(0, Math.min(ROUTE_LANES - 1, Math.round(numeric(state.movement && state.movement.lanePosition, 3))));
      setText(refs.lane, `${messages.lane} ${String(currentLane + 1).padStart(2, '0')} / 07`);
      const terrain = state.terrainEnabled && root.Skyroads && root.Skyroads.flightTerrain;
      const surface = terrain ? terrain.sample(numeric(state.position), currentLane) : null;
      const groundMode = surface && surface.raised ? messages.terrace
        : surface && surface.kind === 'ramp_up' ? messages.rampUp
          : surface && surface.kind === 'ramp_down' ? messages.rampDown : messages.ground;
      setText(refs.flightMode, warping ? messages[`wormhole_${warpPhase}`]
        : state.gliding ? messages.gliding : numeric(state.playerY) > 0 ? messages.airborne : groundMode);
      setText(refs.routeRange, `+${ROUTE_ROWS * ROUTE_STEP * positive(config.DISTANCE_PER_SEGMENT, 10)} M`);
      updateRoute(state, currentLane);
      refs.route.setAttribute('aria-label', `${messages.route}, ${messages.lane} ${currentLane + 1}/7`);

      setText(refs.weapon, chargeRatio >= 1 ? messages.missileReady : revealCharge ? `${messages.charging} ${Math.round(chargeRatio * 100)}%` : messages.weaponReady);
      tactical.dataset.charged = chargeRatio >= 1 ? 'true' : 'false';
      setMeter(refs.weaponBar, revealCharge ? chargeRatio : 0, messages.weapon);
      const leaderboard = root.Skyroads && root.Skyroads.leaderboard;
      const liveScore = leaderboard && typeof leaderboard.calculateScore === 'function'
        ? leaderboard.calculateScore(state) : numeric(state.score);
      setText(refs.score, String(Math.max(0, Math.floor(liveScore))).padStart(5, '0'));
      setText(refs.distance, `${Math.floor(numeric(state.distanceMeters)).toLocaleString(locale)} M`);
      const totalSeconds = Math.floor(Math.max(0, numeric(state.elapsedMs)) / 1000);
      setText(refs.elapsed, `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`);
      effectEntries.forEach(({ node, time, id, field, warning }) => {
        const remaining = id === 'shield' ? protection.remaining : Math.max(0, numeric(state[field]));
        node.hidden = remaining <= 0;
        node.dataset.warning = remaining > 0 && remaining <= warning ? 'true' : 'false';
        const displayTime = id === 'shield' ? Math.ceil(remaining * 10) / 10 : remaining;
        setText(time, `${displayTime.toFixed(1)}s`);
        if (id === 'shield') {
          node.style.setProperty('--protection-left', clamp(remaining / positive(protection.duration, 1)));
        }
      });
      const warningText = mode === 'PLAYING' && !warping && fuelRatio <= 0.15 ? messages.fuelCritical : '';
      refs.warning.hidden = !warningText;
      setText(refs.warning, warningText);
      const tutorial = state.tutorial;
      const phase = tutorial && tutorial.active && tutorial.phases && tutorial.phases[tutorial.phaseIndex];
      refs.tutorial.hidden = mode !== 'PLAYING' || !phase;
      interfaceNode.dataset.training = !refs.tutorial.hidden ? 'true' : 'false';
      if (phase && state.translator) {
        setText(refs.tutorialPhase, `${messages.training} ${tutorial.phaseIndex + 1}/${tutorial.phases.length}`);
        setText(refs.tutorialText, state.translator.t(phase.hintKey));
      }
    }

    // 同一数字节点先累计，再随卡片移到上方中央结算；只读取计时，禁止重启 CSS 动画。
    function updateWormhole(state, config, warp, phase, elapsed, active, gateDistance, messages, locale) {
      const complete = phase === 'complete';
      const tuning = root.Skyroads && root.Skyroads.wormhole && root.Skyroads.wormhole.TUNING;
      const targetReward = positive(tuning && tuning.distanceMeters, 6000);
      const reward = complete ? positive(warp.lastRewardMeters, targetReward) : targetReward;
      const progress = clamp(elapsed / positive(tuning && tuning.duration, 2.4));
      const number = value => Math.round(value).toLocaleString(locale);
      refs.wormhole.hidden = phase === 'off';
      refs.wormhole.dataset.phase = phase;
      refs.wormholeValue.setAttribute('aria-live', complete ? 'polite' : 'off');
      refs.wormholeMeter.track.hidden = !active;
      interfaceNode.dataset.warpSettling = complete ? 'true' : 'false';
      if (phase !== 'off') {
        setText(refs.wormholeHeading, complete ? messages.wormhole_reward : messages.wormhole_heading);
        setText(refs.wormholeTitle, messages[`wormhole_${phase}`]);
        if (phase === 'preview') {
          setText(refs.wormholeValue, `${number(Math.ceil(gateDistance / 10) * 10)} M`);
          const side = numeric(warp.gate.lane, 3) < 3 ? messages.wormhole_left : messages.wormhole_right;
          setText(refs.wormholeDetail, `${side} · ${messages.wormhole_jump}`);
        } else if (complete) {
          setText(refs.wormholeValue, `+${number(reward)} M`);
          const protection = numeric(warp.graceT) > 0
            ? ` · ${messages.wormhole_protection} ${numeric(warp.graceT).toFixed(1)}s` : '';
          setText(refs.wormholeDetail, `${messages.wormhole_credited}${protection}`);
        } else {
          setText(refs.wormholeValue, `${number(Math.floor(reward * progress / 10) * 10)} / ${number(reward)} M`);
          setText(refs.wormholeDetail, messages.wormhole_noDrain);
          setMeter(refs.wormholeMeter, progress, messages.wormhole_progress);
        }
      }
      const key = `${state.runId == null ? '' : state.runId}:${warp.eventId == null ? '' : warp.eventId}`;
      const changedEvent = key !== settlementKey;
      if (changedEvent) { settlementKey = key; settlementAge = 0; }
      if (complete && (state.mode !== 'PAUSED' || changedEvent)) {
        // 同一事件的完成计时只能前进；切换语言、恢复画面或重复状态不能重新放大一次。
        settlementAge = Math.max(settlementAge, Math.max(0, 2.8 - numeric(warp.completedT)));
      }
      const width = positive(state.width, positive(root.innerWidth, 1440));
      const height = positive(state.height, positive(root.innerHeight, 900));
      const narrow = width <= 760;
      const margin = width <= 460 ? 12 : narrow ? 16 : Math.max(20, Math.min(40, width * 0.025));
      const baseWidth = narrow ? width - margin * 2 : 272;
      const targetWidth = narrow ? baseWidth : Math.min(430, width - margin * 2);
      const baseSize = narrow ? 19 : 21;
      const targetSize = narrow ? (height < 600 ? 38 : Math.min(48, (baseWidth - 32) / 5.5)) : 60;
      const reduced = Boolean(state.reducedMotion);
      const age = settlementAge;
      const entrance = 1 - Math.pow(1 - clamp(age / 0.46), 3);
      const pop = clamp(age / 0.56) - 1;
      const sizeEntrance = 1 + 2.15 * pop * pop * pop + 1.15 * pop * pop;
      const returnT = clamp((age - 2.05) / 0.55);
      const returning = returnT * returnT * (3 - 2 * returnT);
      const travel = complete ? reduced ? 1 : entrance * (1 - returning) : 0;
      const size = complete ? reduced ? 1 : sizeEntrance * (1 - returning) : 0;
      const opacity = complete && !reduced ? 1 - clamp((age - 2.62) / 0.18) : 1;
      refs.wormhole.dataset.settlement = !complete ? 'off' : reduced ? 'static'
        : age < 0.56 ? 'lifting' : age < 2.05 ? 'hold' : age < 2.62 ? 'returning' : 'fade';
      const frame = `${width}:${height}:${travel}:${size}:${opacity}`;
      if (frame !== lastSettlementFrame) {
        lastSettlementFrame = frame;
        const style = refs.wormhole.style;
        style.setProperty('--warp-panel-width', `${(baseWidth + (targetWidth - baseWidth) * travel).toFixed(3)}px`);
        style.setProperty('--warp-value-size', `${(baseSize + (targetSize - baseSize) * size).toFixed(3)}px`);
        style.setProperty('--warp-settle-x', `${(narrow ? 0 : ((width - targetWidth) / 2 - margin) * travel).toFixed(3)}px`);
        style.setProperty('--warp-settle-y', `${(narrow ? 0 : -18 * travel).toFixed(3)}px`);
        style.setProperty('--warp-settle-strength', travel.toFixed(4));
        style.setProperty('--warp-settle-opacity', opacity.toFixed(4));
      }
    }

    // setAvailable 在 3D 渲染初始化成功时展示仪表，失败时隐藏，返回 undefined。
    function setAvailable(value) {
      if (disposed) return;
      available = Boolean(value);
      interfaceNode.hidden = !available;
      lastUpdate = -Infinity;
    }

    // dispose 移除飞行 HUD 节点；不清理其它 UI 或修改全局渲染模式，返回 undefined。
    function dispose() {
      if (disposed) return;
      disposed = true;
      interfaceNode.remove();
    }

    return Object.freeze({ update, setAvailable, dispose });

    /*********************************************
     * Private Helper Functions
     ********************************************/

    function element(tag, className = '', text = '') {
      const node = documentObject.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    }

    function label(className, id) {
      const node = element('span', className);
      labels.push({ node, id });
      return node;
    }

    function instrument(className, index, title) {
      const node = element('div', `cockpit-instrument ${className}`);
      const heading = element('div', 'cockpit-instrument-heading');
      heading.append(label('', title), element('span', 'cockpit-instrument-index', index));
      node.append(heading);
      return node;
    }

    function meter(className) {
      const track = element('div', `cockpit-meter ${className}`);
      const fill = element('i');
      track.setAttribute('role', 'meter');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.append(fill);
      return { track, fill };
    }

    function stat(parent, id, initialValue) {
      const container = element('div', `cockpit-stat cockpit-stat-${id}`);
      const value = element('strong', '', initialValue);
      container.append(label('cockpit-label', id), value);
      parent.append(container);
      return value;
    }

    function updateRoute(state, currentLane) {
      const track = state.track || [];
      const position = Math.floor(numeric(state.position));
      routeCells.forEach((cell, index) => {
        const row = Math.floor(index / ROUTE_LANES);
        const lane = index % ROUTE_LANES;
        const segmentIndex = position + (ROUTE_ROWS - 1 - row) * ROUTE_STEP;
        const segment = track[segmentIndex];
        const type = segment && segment.lanes && segment.lanes[lane];
        // 每格覆盖两段：任一段有缺口或障碍都保留告警，避免跳采样漏掉单段危险。
        const nextSegment = track[segmentIndex + 1];
        const nextType = nextSegment && nextSegment.lanes && nextSegment.lanes[lane];
        const kinds = [routeType(type, state.tripleT > 0), routeType(nextType, state.tripleT > 0)];
        const kind = kinds.includes('wall') ? 'wall' : kinds.includes('gap') ? 'gap' : kinds.includes('fuel') ? 'fuel' : kinds.includes('pickup') ? 'pickup' : kinds[0];
        const player = row === ROUTE_ROWS - 1 && lane === currentLane;
        const className = `cockpit-route-cell is-${kind}${player ? ' is-player' : ''}`;
        if (cell.className !== className) cell.className = className;
        const terrain = state.terrainEnabled && root.Skyroads && root.Skyroads.flightTerrain;
        const raised = terrain && terrain.sample(segmentIndex, lane).raised;
        cell.dataset.elevation = raised ? 'raised' : 'base';
      });
    }
  }

  /*********************************************
   * Constants and Private Helpers
   ********************************************/

  const ROUTE_LANES = 7;
  const ROUTE_ROWS = 5;
  const ROUTE_STEP = 2;
  const EFFECTS = Object.freeze([
    { id: 'boost', field: 'boostT', warning: 1.5 },
    { id: 'burst', field: 'fuelBurstT', warning: 1 },
    { id: 'super', field: 'tripleT', warning: 3 },
    { id: 'magnet', field: 'magnetT', warning: 1.5 },
    { id: 'shield', field: 'fuelBurstGraceT', warning: 0.3 },
  ]);
  const MESSAGES = Object.freeze({
    en: Object.freeze({
      instruments: 'Flight telemetry', briefing: 'FLIGHT PLAN', mission: 'Read the road ahead.', missionDetail: 'Lift over breaks. Follow the high route. Charge your weapons to clear a path.', chaseView: '7-LANE FLIGHT', flightState: 'FLIGHT MODE',
      reactor: 'FLIGHT TELEMETRY', navigation: 'TERRAIN SCAN', tactical: 'TACTICAL', fuel: 'FUEL CELL', jumps: 'LIFT CHARGES', burst: 'FUEL BURST', burstReady: 'BURST READY', burstActive: 'BURST ACTIVE', burstMinimum: 'BURST ≥ 70%', charging: 'CHARGING',
      speed: 'VELOCITY', altitude: 'ALTITUDE', lane: 'LANE', route: 'TERRAIN SCAN', weapon: 'WEAPONS', weaponReady: 'PULSE CANNON ONLINE', missileReady: 'MISSILE READY', score: 'SCORE', distance: 'DISTANCE', time: 'FLIGHT TIME',
      steer: 'STEER', jumpGlide: 'LIFT / GLIDE', fireCharge: 'FIRE / CHARGE', pause: 'PAUSE', boost: 'OVERDRIVE', super: 'SUPER FORM', magnet: 'MAGNET', shield: 'INVULNERABLE',
      MENU: 'SYSTEMS READY', PLAYING: 'FLIGHT ACTIVE', PAUSED: 'FLIGHT HOLD', GAMEOVER: 'SIGNAL LOST', gliding: 'GLIDE', airborne: 'LIFT', ground: 'TERRAIN FOLLOW', fuelCritical: 'LOW FUEL — COLLECT ENERGY CELLS', training: 'TRAINING',
      terrace: 'ELEVATED ROUTE', rampUp: 'ASCENDING RAMP', rampDown: 'DESCENDING RAMP',
      wormhole_heading: 'ROUTE ANOMALY', wormhole_preview: 'HIGH-ALTITUDE WORMHOLE',
      wormhole_left: 'LEFT HIGH ROUTE', wormhole_right: 'RIGHT HIGH ROUTE', wormhole_jump: 'LIFT · JUMP AGAIN NEAR APEX',
      wormhole_capture: 'CAPTURE', wormhole_tear: 'SPACE TEAR', wormhole_tunnel: 'IN TRANSIT',
      wormhole_exit: 'RE-ENTRY', wormhole_complete: 'WARP COMPLETE', wormhole_noDrain: 'NO DRAIN · POWER-UP TIMERS PAUSED',
      wormhole_reward: 'DISTANCE GAIN', wormhole_credited: 'ADDED TO TOTAL DISTANCE',
      wormhole_progress: 'WARP PROGRESS', wormhole_protection: 'EXIT PROTECTION', wormhole_arrived: 'NEW SECTOR REACHED',
    }),
    'zh-CN': Object.freeze({
      instruments: '飞行遥测', briefing: '航行计划', mission: '看清前路，掌握节奏。', missionDetail: '跃升越过断层，沿高架支路前进，蓄力清除前方障碍。', chaseView: '七航道飞行', flightState: '飞行模式',
      reactor: '飞行遥测', navigation: '前方地形', tactical: '战术系统', fuel: '燃料储量', jumps: '跃升次数', burst: '燃料爆发', burstReady: '爆发就绪', burstActive: '爆发推进中', burstMinimum: '爆发需要 ≥ 70%', charging: '蓄力中',
      speed: '航行速度', altitude: '相对高度', lane: '航道', route: '前方地形', weapon: '武器系统', weaponReady: '脉冲炮就绪', missileReady: '导弹就绪 · 松手发射', score: '任务得分', distance: '航行距离', time: '飞行时间',
      steer: '变道', jumpGlide: '跃升 / 滑翔', fireCharge: '射击 / 蓄力', pause: '暂停', boost: '超级加速', super: '超级形态', magnet: '磁力吸附', shield: '无敌保护',
      MENU: '系统就绪', PLAYING: '正在航行', PAUSED: '航行暂停', GAMEOVER: '信号中断', gliding: '滑翔', airborne: '跃升', ground: '贴地巡航', fuelCritical: '燃料不足 · 请拾取能量晶体', training: '飞行教学',
      terrace: '高架支路', rampUp: '上坡航段', rampDown: '下坡航段',
      wormhole_heading: '异常航线', wormhole_preview: '高空虫洞',
      wormhole_left: '左侧高架', wormhole_right: '右侧高架', wormhole_jump: '跃起后，近顶点再跳',
      wormhole_capture: '引力捕获', wormhole_tear: '撕开空间', wormhole_tunnel: '时空穿梭',
      wormhole_exit: '返回航道', wormhole_complete: '折跃完成', wormhole_noDrain: '能量零消耗 · 增益计时暂停',
      wormhole_reward: '额外航程', wormhole_credited: '已计入总航程',
      wormhole_progress: '折跃进度', wormhole_protection: '出场保护', wormhole_arrived: '已抵达新航段',
    }),
  });

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setMeter(meter, value, label) {
    const ratio = clamp(value);
    const percent = String(Math.round(ratio * 100));
    if (meter.track.getAttribute('aria-valuenow') !== percent) {
      meter.track.setAttribute('aria-valuenow', percent);
      meter.fill.style.transform = `scaleX(${ratio.toFixed(3)})`;
    }
    if (meter.track.getAttribute('aria-label') !== label) meter.track.setAttribute('aria-label', label);
  }

  function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positive(value, fallback) {
    return numeric(value) > 0 ? numeric(value) : fallback;
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, numeric(value)));
  }

  function routeType(type, superActive = false) {
    if (typeof type !== 'string') return 'empty';
    if (type.startsWith('WALL_')) return 'wall';
    if (type === 'GAP') return 'gap';
    if (type === 'FUEL') return 'fuel';
    return type === 'ROAD' || (type === 'TRIPLE' && superActive) ? 'road' : 'pickup';
  }

  const api = Object.freeze({ create });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.cockpitUi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
