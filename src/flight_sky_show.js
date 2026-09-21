'use strict';

// 天空演出只有展示时钟和预建网格，不接触轨道、碰撞、奖励或游戏随机数。
(function attachFlightSkyShow(scope) {
  const SCHEDULE = Object.freeze({ heroDistanceMeters: 5000, heroDuration: 8.5,
    meteorFirst: 2, meteorStagger: 2.3, meteorPeriod: 7, meteorPeriodStep: 1.7, meteorDuration: 1.35 });
  const hash = (value) => {
    const wave = Math.sin(value * 127.1 + 311.7) * 43758.5453;
    return wave - Math.floor(wave);
  };

  /** 创建纯背景彩蛋；update 读取状态与相机，资源由调用方统一登记和释放。 */
  function create({ THREE, own, parent }) {
    const group = new THREE.Group();
    group.name = 'sky_easter_eggs';
    parent.add(group);
    const tailGeometry = own(new THREE.PlaneGeometry(1, 1));
    tailGeometry.translate(-0.5, 0, 0);
    const glowGeometry = own(new THREE.PlaneGeometry(1, 1));
    const vertexShader = `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const meteors = Array.from({ length: 3 }, (_, index) => {
      const material = own(new THREE.ShaderMaterial({
        uniforms: { strength: { value: 0 } }, vertexShader,
        fragmentShader: `varying vec2 vUv; uniform float strength;
          void main() {
            float width = 0.035 + 0.46 * pow(vUv.x, 0.65);
            float edge = 1.0 - smoothstep(width * 0.18, width, abs(vUv.y - 0.5));
            float fade = pow(vUv.x, 1.65) * edge;
            vec3 color = mix(vec3(0.19,0.47,0.84), vec3(0.87,0.97,1.0), pow(vUv.x, 3.0));
            gl_FragColor = vec4(color, fade * strength);
          }`, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      }));
      const headMaterial = own(new THREE.ShaderMaterial({
        uniforms: material.uniforms, vertexShader,
        fragmentShader: `varying vec2 vUv; uniform float strength;
          void main() { float r = length(vUv - 0.5) * 2.0;
            float core = exp(-r*r*34.0) + 0.22 * pow(max(0.0,1.0-r),3.0);
            gl_FragColor = vec4(vec3(0.83,0.95,1.0), core * strength); }`,
        transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      }));
      const node = new THREE.Group();
      node.name = `distant_meteor_${index}`;
      const tail = new THREE.Mesh(tailGeometry, material);
      const head = new THREE.Mesh(glowGeometry, headMaterial);
      node.add(tail, head);
      group.add(node);
      return { node, tail, head, material };
    });
    const hero = scope.Skyroads.flightSkyHero ? scope.Skyroads.flightSkyHero.create({ THREE, own }) : null;
    if (hero) group.add(hero.group);
    const heroBounds = hero ? new THREE.Box3().setFromObject(hero.group) : null;
    if (heroBounds) heroBounds.expandByScalar(0.20);
    const heroFx = hero && scope.Skyroads.flightSkyHeroFx
      ? scope.Skyroads.flightSkyHeroFx.create({ THREE, own, parent: group }) : null;
    const effectBounds = new THREE.Box3(new THREE.Vector3(-17, -2, -2), new THREE.Vector3(-1.6, 2, 2));
    const localBounds = new THREE.Box3();
    const worldBounds = new THREE.Box3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const down = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const rollAxis = new THREE.Vector3(1, 0, 0);
    const orientation = new THREE.Matrix4();
    const worldTransform = new THREE.Matrix4();
    const roll = new THREE.Quaternion();
    const point = new THREE.Vector3();
    const worldPosition = new THREE.Vector3();
    let elapsed = 0;
    let previousRun = null;
    let heroMilestone = 0;
    let heroStartElapsed = null;
    let visibleMeteors = 0;
    let heroVisible = false;
    let audioCue = { active: false };
    group.visible = false;

    /** 仅进行中的正常动态时间推进演出；暂停重绘保持姿态，菜单和重开不会提前消耗彩蛋。 */
    function update(state, { dt = 0, camera, minimumWorldY = 0 } = {}) {
      const changedRun = previousRun !== state.runId;
      if (changedRun) {
        elapsed = 0; previousRun = state.runId;
        heroMilestone = 0; heroStartElapsed = null;
      }
      if (state.mode === 'PLAYING' && !state.reducedMotion && !changedRun) elapsed += Math.max(0, Math.min(0.05, dt));
      // 使用 HUD 的实际累计米数；每个五公里节点只消费一次，不因等待、重绘或距离回抖重复播放。
      const distance = Number(state.distanceMeters);
      const milestone = Number.isFinite(distance) ? Math.floor(Math.max(0, distance) / SCHEDULE.heroDistanceMeters) : 0;
      if (state.mode === 'PLAYING' && milestone > heroMilestone) {
        heroMilestone = milestone;
        // 减少动态时跳过已经经过的节点，恢复设置后不集中补播。
        heroStartElapsed = state.reducedMotion ? null : elapsed;
      }
      group.visible = (state.mode === 'PLAYING' || state.mode === 'PAUSED') && !state.reducedMotion;
      visibleMeteors = 0;
      heroVisible = false;
      audioCue = { active: false, runId: state.runId };
      for (const meteor of meteors) meteor.node.visible = false;
      if (hero) hero.group.visible = false;
      if (heroFx) heroFx.hide();
      if (!group.visible || !camera) return;
      // 使用独立远景层，跟随相机位置和朝向；任何高架/跳跃都保持在上方天空带。
      camera.updateWorldMatrix(true, false);
      camera.getWorldPosition(group.position);
      camera.getWorldQuaternion(group.quaternion);
      group.updateMatrixWorld(true);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      for (let index = 0; index < meteors.length; index += 1) {
        const local = elapsed - SCHEDULE.meteorFirst - index * SCHEDULE.meteorStagger;
        const period = SCHEDULE.meteorPeriod + index * SCHEDULE.meteorPeriodStep;
        const phase = local >= 0 ? local % period / SCHEDULE.meteorDuration : 2;
        if (phase > 1) continue;
        const seed = Math.floor(local / period) * 7.3 + index * 13.1;
        const direction = hash(seed) > 0.5 ? 1 : -1;
        const depth = 270 + index * 27;
        const halfHeight = depth * tangent;
        const halfWidth = halfHeight * camera.aspect;
        const x = direction * (0.90 - phase * 1.2) * halfWidth;
        const y = (0.83 - phase * 0.27 + hash(seed + 1) * 0.04) * halfHeight;
        worldPosition.set(x, y, -depth).applyMatrix4(group.matrixWorld);
        if (worldPosition.y - 2 < minimumWorldY) continue;
        const meteor = meteors[index];
        meteor.node.visible = true;
        meteor.node.position.set(x, y, -depth);
        meteor.node.rotation.z = Math.atan2(-0.27 * halfHeight, -direction * 1.2 * halfWidth);
        meteor.tail.scale.set(halfHeight * 0.19, halfHeight * 0.008, 1);
        meteor.head.scale.setScalar(halfHeight * 0.015);
        meteor.material.uniforms.strength.value = Math.sin(phase * Math.PI) * 0.95;
        visibleMeteors += 1;
      }
      const phase = heroStartElapsed === null ? 2 : (elapsed - heroStartElapsed) / SCHEDULE.heroDuration;
      if (!hero || phase > 1) return;
      const cycle = heroMilestone - 1;
      const side = cycle % 2 === 0 ? -1 : 1;
      // 从相机后上方追上来，再加速飞向前方深空；尺寸固定，由真实透视自然缩小。
      const depth = -24 + 450 * (0.55 * phase + 0.45 * phase * phase);
      const depthRate = 450 * (0.55 + 0.90 * phase);
      const x = side * (6 + 26 * (1 - phase));
      const y = 22 + depth * 0.28;
      const scale = 3.4;
      hero.group.position.set(x, y, -depth);
      hero.group.scale.setScalar(scale);
      forward.set(-side * 26, depthRate * 0.28, -depthRate).normalize();
      right.crossVectors(forward, up).normalize();
      down.crossVectors(forward, right).normalize();
      // 本地 +X 对准切线，胸口朝下，背披风朝上；轻微侧倾露出立体轮廓。
      orientation.makeBasis(forward, right, down);
      hero.group.quaternion.setFromRotationMatrix(orientation);
      roll.setFromAxisAngle(rollAxis, side * (0.34 + Math.sin(phase * Math.PI * 2) * 0.10));
      hero.group.quaternion.multiply(roll);
      hero.update(elapsed);
      hero.group.updateMatrix();
      if (!safeEnvelope(heroBounds, hero.group.matrix, tangent, minimumWorldY)) return;
      heroVisible = true;
      hero.group.visible = true;
      audioCue = { active: state.mode === 'PLAYING', runId: state.runId,
        eventId: `${state.runId}:${cycle}`, phase, side };
      if (heroFx && safeEnvelope(effectBounds, hero.group.matrix, tangent, minimumWorldY)) {
        heroFx.update({ phase, time: elapsed, position: hero.group.position,
          quaternion: hero.group.quaternion, scale });
      }
    }

    // 整个模型／尾迹都必须离开相机近裁剪面并处于天空，避免超车时出现亮面闪屏。
    function safeEnvelope(bounds, matrix, tangent, minimumWorldY) {
      localBounds.copy(bounds).applyMatrix4(matrix);
      if (localBounds.max.z > -12) return false;
      worldTransform.multiplyMatrices(group.matrixWorld, matrix);
      worldBounds.copy(bounds).applyMatrix4(worldTransform);
      if (worldBounds.min.y < minimumWorldY) return false;
      for (let corner = 0; corner < 8; corner += 1) {
        point.set(corner & 1 ? localBounds.max.x : localBounds.min.x,
          corner & 2 ? localBounds.max.y : localBounds.min.y,
          corner & 4 ? localBounds.max.z : localBounds.min.z);
        if (point.y / (-point.z * tangent) < 0.38) return false;
      }
      return true;
    }

    return { group, update, getAudioCue: () => ({ ...audioCue }), getDiagnostics: () => ({ elapsed, active: group.visible,
      visibleMeteors, heroVisible, heroMilestone, heroStartElapsed, schedule: SCHEDULE,
      heroPosition: hero ? hero.group.position.toArray() : null,
      heroScale: hero ? hero.group.scale.x : null,
      heroFx: heroFx ? heroFx.getDiagnostics() : null,
      hero: hero ? hero.getDiagnostics() : null }) };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightSkyShow = Object.freeze({ create, SCHEDULE });
}(globalThis));
