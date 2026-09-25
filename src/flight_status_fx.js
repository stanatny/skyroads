'use strict';

// 飞船毁伤与无敌状态的场景反馈独立于机体，结算时隐藏机体也不会中断爆炸。
(function attachFlightStatusFx(scope) {
  /** protection 读取加速与缓冲保护计时，返回是否无敌、连续保护剩余秒数及进度条总时长。 */
  function protection(state = {}, config = {}) {
    if (state.mode !== 'PLAYING' && state.mode !== 'PAUSED') {
      return { active: false, remaining: 0, duration: 0 };
    }
    const boost = Math.max(0, state.boostT || 0);
    const burst = Math.max(0, state.fuelBurstT || 0);
    const grace = Math.max(0, state.fuelBurstGraceT || 0);
    const graceDuration = Math.max(0, config.FUEL_BURST_GRACE ?? 2);
    const boostGraceDuration = Math.max(0, config.BOOST_GRACE ?? 1.5);
    const boostProtection = Math.max(state.boostGraceT || 0, boost > 0 ? boost + boostGraceDuration : 0);
    // 主动爆发到期会自动接续保护；把这段时间纳入同一次倒计时，交接时不闪断或重填进度条。
    const burstProtection = Math.max(grace, burst > 0 ? burst + graceDuration : 0);
    const warp = state.wormhole;
    const warpTuning = scope.Skyroads && scope.Skyroads.wormhole && scope.Skyroads.wormhole.TUNING;
    const warpDuration = warpTuning ? warpTuning.duration : 2.4;
    const warpGraceDuration = warpTuning ? warpTuning.graceDuration : 2;
    const warpProtection = warp ? Math.max(warp.graceT || 0,
      // 既有保护倒计时被冻结，连续保护剩余时长应加上未走完的折跃，而不是取两者较大值。
      warp.active ? Math.max(0, warpDuration - (warp.elapsed || 0)) + Math.max(warpGraceDuration, boostProtection, burstProtection) : 0) : 0;
    const remaining = Math.max(boostProtection, burstProtection, warpProtection);
    const duration = remaining <= 0 ? 0 : warpProtection >= Math.max(boostProtection, burstProtection)
      ? warpDuration + Math.max(warpGraceDuration, boostProtection > 0 ? (config.BOOST_DURATION || 5) + boostGraceDuration : 0,
        burstProtection > 0 ? (config.FUEL_BURST_DURATION || 3) + graceDuration : 0) : boostProtection >= burstProtection
      ? (config.BOOST_DURATION || 5) + boostGraceDuration : (config.FUEL_BURST_DURATION || 3) + graceDuration;
    return { active: remaining > 0, remaining, duration };
  }

  /** 创建状态特效；接收 Three.js 和资源登记器，返回场景组、只读更新与诊断接口。 */
  function create({ THREE, own }) {
    const group = new THREE.Group();
    group.name = 'flight_status_fx';
    const resources = new Set();
    const keep = (resource) => { resources.add(resource); return own(resource); };
    const explosion = new THREE.Group();
    explosion.name = 'ship_destruction';
    explosion.visible = false;
    group.add(explosion);
    const shield = new THREE.Group();
    shield.name = 'ship_grace_shield';
    shield.visible = false;
    group.add(shield);
    const transform = new THREE.Object3D();
    const point = new THREE.Vector3();
    const worldRotation = new THREE.Quaternion();
    const sphere = keep(new THREE.IcosahedronGeometry(1, 2));
    const ring = keep(new THREE.TorusGeometry(1, 0.025, 6, 80));
    const glowPixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        const offset = (y * 64 + x) * 4;
        glowPixels[offset] = glowPixels[offset + 1] = glowPixels[offset + 2] = 255;
        glowPixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - radius * radius), 2.4) * 255);
      }
    }
    const glowTexture = keep(new THREE.DataTexture(glowPixels, 64, 64));
    glowTexture.needsUpdate = true;
    function additive(color, opacity = 0) {
      return keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    }
    function mesh(geometry, material, parent) {
      const object = new THREE.Mesh(geometry, material);
      parent.add(object);
      return object;
    }
    const fireMaterial = additive(0xff6c23);
    const coreMaterial = additive(0xffe5ac);
    const shockMaterial = additive(0xffcf75);
    const glowMaterial = keep(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff8734,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      // 墙面碰撞时保留局部柔光，避免整个反馈被相交建筑遮住。
      depthTest: false, toneMapped: false }));
    const glow = new THREE.Sprite(glowMaterial);
    glow.name = 'ship_destruction_glow';
    glow.renderOrder = 12;
    explosion.add(glow);
    const core = mesh(sphere, coreMaterial, explosion);
    core.name = 'ship_destruction_core';
    const fire = keep(new THREE.InstancedMesh(sphere, fireMaterial, 7));
    fire.name = 'ship_destruction_fire';
    fire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fire.frustumCulled = false;
    fire.count = 0;
    explosion.add(fire);
    const shock = mesh(ring, shockMaterial, explosion);
    shock.name = 'ship_destruction_shock';
    shock.rotation.x = Math.PI / 2;
    const debrisMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xee4935, roughness: 0.44,
      metalness: 0.38, emissive: 0xab2d08, emissiveIntensity: 0.5, transparent: true, opacity: 0 }));
    const debrisGeometry = keep(new THREE.TetrahedronGeometry(0.22));
    debrisGeometry.scale(1.6, 0.35, 1);
    const debris = keep(new THREE.InstancedMesh(debrisGeometry, debrisMaterial, 18));
    debris.name = 'ship_destruction_armor';
    debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    debris.frustumCulled = false;
    debris.count = 0;
    explosion.add(debris);
    const emberMaterial = additive(0xffbb4f);
    const embers = keep(new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.055, 5, 4)), emberMaterial, 36));
    embers.name = 'ship_destruction_embers';
    embers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    embers.frustumCulled = false;
    embers.count = 0;
    explosion.add(embers);
    const smokeMaterial = keep(new THREE.SpriteMaterial({ map: glowTexture, color: 0x536171,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const smoke = Array.from({ length: 8 }, (_, index) => {
      const puff = new THREE.Sprite(smokeMaterial);
      puff.name = 'ship_destruction_smoke';
      puff.renderOrder = 1;
      explosion.add(puff);
      return { puff, phase: index * 2.39996, seed: 0.42 + (index % 3) * 0.22 };
    });
    // 六边网格与扫描能量在片元阶段计算，护盾中心保持通透，不用厚实白球遮住机体。
    const shieldMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 }, shieldTime: { value: 0 } },
      vertexShader: `varying vec3 surfaceNormal; varying vec3 viewDirection; varying vec2 shieldUv;
        void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
          surfaceNormal = normalize(normalMatrix * normal); viewDirection = -view.xyz; shieldUv = uv;
          gl_Position = projectionMatrix * view; }`,
      fragmentShader: `uniform float strength; uniform float shieldTime;
        varying vec3 surfaceNormal; varying vec3 viewDirection; varying vec2 shieldUv;
        void main() {
          float facing = abs(dot(normalize(surfaceNormal), normalize(viewDirection)));
          float rim = pow(1.0 - facing, 2.35);
          vec2 cellSize = vec2(1.0, 1.7320508);
          vec2 p = shieldUv * vec2(32.0, 14.0);
          vec2 cellA = mod(p, cellSize) - cellSize * 0.5;
          vec2 cellB = mod(p - cellSize * 0.5, cellSize) - cellSize * 0.5;
          vec2 cell = dot(cellA, cellA) < dot(cellB, cellB) ? cellA : cellB;
          vec2 edgePoint = abs(cell);
          float edgeDistance = max(edgePoint.x, dot(edgePoint, vec2(0.5, 0.8660254)));
          float lineWidth = max(fwidth(edgeDistance) * 1.20, 0.026);
          float grid = smoothstep(0.5 - lineWidth, 0.5, edgeDistance);
          float scanPosition = abs(fract(shieldUv.y - shieldTime * 0.19) - 0.5);
          float scan = pow(max(0.0, 1.0 - scanPosition * 24.0), 2.0);
          float aurora = 0.5 + 0.5 * sin(shieldUv.x * 13.0 + shieldUv.y * 9.0 - shieldTime * 1.5);
          vec3 edgeColor = mix(vec3(0.23, 0.43, 1.0), vec3(0.22, 0.98, 1.0), aurora);
          vec3 color = mix(vec3(0.10, 0.35, 0.88), edgeColor, min(1.0, rim + grid * 0.38));
          color = mix(color, vec3(0.63, 0.98, 1.0), scan * 0.64);
          float opacity = 0.009 + rim * 0.36 + grid * (0.065 + rim * 0.18) + scan * 0.12;
          gl_FragColor = vec4(color, strength * opacity);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.FrontSide, toneMapped: false,
    }));
    const shell = mesh(keep(new THREE.SphereGeometry(1, 48, 32)), shieldMaterial, shield);
    shell.name = 'ship_grace_shield_shell';
    shell.scale.set(1.46, 0.88, 1.62);
    // 分段轨道在原有包络上流动；留出明显缺口，避免完整亮环盖住道路与飞机。
    const shieldRimMaterial = additive(0x6fddff);
    const shieldVioletMaterial = additive(0x867fff);
    const orbitGeometry = keep(new THREE.TorusGeometry(1, 0.012, 5, 28, Math.PI * 0.36));
    const shieldRim = new THREE.Group();
    shieldRim.name = 'ship_grace_shield_equator';
    shieldRim.rotation.x = Math.PI / 2;
    shieldRim.scale.set(1.46, 1.62, 1);
    shield.add(shieldRim);
    const meridian = new THREE.Group();
    meridian.name = 'ship_grace_shield_meridian';
    meridian.rotation.y = Math.PI / 2;
    meridian.scale.set(1.62, 0.88, 1);
    shield.add(meridian);
    const shieldArcs = [];
    for (let index = 0; index < 3; index += 1) {
      const phase = index * Math.PI * 2 / 3;
      const equatorial = mesh(orbitGeometry, shieldRimMaterial, shieldRim);
      equatorial.name = 'ship_shield_equatorial_arc';
      equatorial.rotation.z = phase;
      shieldArcs.push({ object: equatorial, phase, speed: 0.42 });
      const vertical = mesh(orbitGeometry, shieldVioletMaterial, meridian);
      vertical.name = 'ship_shield_meridian_arc';
      vertical.rotation.z = phase + 0.72;
      shieldArcs.push({ object: vertical, phase: phase + 0.72, speed: -0.31 });
    }
    const shieldNodeMaterial = additive(0xb5faff);
    const shieldNodes = keep(new THREE.InstancedMesh(
      keep(new THREE.IcosahedronGeometry(0.042, 0)), shieldNodeMaterial, 6));
    shieldNodes.name = 'ship_shield_orbit_nodes';
    shieldNodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shieldNodes.frustumCulled = false;
    shieldNodes.count = 0;
    shield.add(shieldNodes);
    let previousRun = null;
    let deathHandled = false;
    let age = 0;
    let duration = 1.45;
    let triggerCount = 0;
    let active = false;
    let shieldRemaining = 0;
    let shieldOpacity = 0;
    let shieldPhase = 0;
    let visibleParticles = 0;

    function reset() {
      active = false;
      deathHandled = false;
      age = 0;
      shieldPhase = 0;
      shieldRemaining = shieldOpacity = visibleParticles = 0;
      explosion.visible = shield.visible = false;
      fire.count = debris.count = embers.count = shieldNodes.count = 0;
      shieldMaterial.uniforms.strength.value = 0;
      shieldMaterial.uniforms.shieldTime.value = 0;
    }

    function trigger(state, shipGroup) {
      deathHandled = true;
      if (!shipGroup) return;
      shipGroup.updateWorldMatrix(true, false);
      shipGroup.localToWorld(point.set(0, 0.60, 0.08));
      explosion.position.copy(point);
      shipGroup.getWorldQuaternion(worldRotation);
      explosion.quaternion.copy(worldRotation);
      duration = state.reducedMotion ? 0.65 : 1.45;
      age = 0;
      active = true;
      triggerCount += 1;
    }

    function renderExplosion(reducedMotion) {
      explosion.visible = active;
      if (!active) { visibleParticles = 0; fire.count = debris.count = embers.count = 0; return; }
      const fraction = age / duration;
      if (reducedMotion) {
        glow.scale.setScalar(2.8);
        glow.position.set(0, 0.13, 0.24);
        glowMaterial.opacity = 0.34 * (1 - fraction);
        core.visible = shock.visible = false;
        fire.count = debris.count = embers.count = 0;
        smokeMaterial.opacity = 0;
        visibleParticles = 0;
        return;
      }
      const fireFade = Math.max(0, 1 - age / 0.64);
      const whiteFade = Math.max(0, 1 - age / 0.30);
      core.visible = true;
      core.scale.setScalar(0.30 + Math.min(0.24, age) * 3.7);
      coreMaterial.opacity = whiteFade * 0.88;
      glow.scale.setScalar(3.0 + Math.min(age, 0.5) * 5.5);
      glow.position.set(0, 0.13, 0.24);
      glowMaterial.opacity = fireFade * 0.68;
      fire.count = fireFade > 0 ? 7 : 0;
      fireMaterial.opacity = fireFade * 0.56;
      for (let index = 0; index < fire.count; index += 1) {
        const phase = index * 2.39996;
        const expansion = 0.16 + age * (0.75 + index % 3 * 0.22);
        transform.position.set(Math.cos(phase) * expansion, 0.08 + age * (0.4 + index % 3 * 0.28),
          Math.sin(phase) * expansion * 0.7 + age * 0.6);
        transform.rotation.set(index, phase + age * 0.5, phase);
        transform.scale.setScalar(0.34 + age * (0.8 + (index % 3) * 0.2));
        transform.updateMatrix();
        fire.setMatrixAt(index, transform.matrix);
      }
      fire.instanceMatrix.needsUpdate = true;
      shock.visible = age < 0.75;
      shock.scale.setScalar(0.48 + age * 5.0);
      shockMaterial.opacity = Math.max(0, 1 - age / 0.75) * 0.70;
      debris.count = age < 1.18 ? 18 : 0;
      debrisMaterial.opacity = Math.max(0, Math.min(1, (1.18 - age) * 3));
      debrisMaterial.emissiveIntensity = fireFade * 0.9;
      for (let index = 0; index < debris.count; index += 1) {
        const phase = index * 2.39996;
        const speed = 1.7 + (index % 5) * 0.42;
        // 向上与机尾侧喷出的碎片让贴墙碰撞仍具有清楚的空间层次。
        transform.position.set(Math.cos(phase) * (0.16 + age * speed),
          0.05 + (2.1 + index % 4 * 0.65) * age - 3.4 * age * age,
          Math.sin(phase) * age * speed * 0.66 + age * 1.7);
        transform.rotation.set(phase + age * 4.5, index + age * 6.2, phase * 2 + age * 3.1);
        transform.scale.setScalar(0.45 + (index % 4) * 0.19);
        transform.updateMatrix();
        debris.setMatrixAt(index, transform.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      embers.count = age < 1.32 ? 36 : 0;
      emberMaterial.opacity = Math.max(0, 1 - age / 1.32) * 0.9;
      for (let index = 0; index < embers.count; index += 1) {
        const phase = index * 2.39996;
        const speed = 1.8 + (index % 7) * 0.42;
        transform.position.set(Math.cos(phase) * age * speed,
          0.08 + (1.1 + index % 5 * 0.45) * age - 2.1 * age * age,
          Math.sin(phase) * age * speed * 0.65 + age * 1.8);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1 + index % 3, 1);
        transform.updateMatrix();
        embers.setMatrixAt(index, transform.matrix);
      }
      embers.instanceMatrix.needsUpdate = true;
      smokeMaterial.opacity = Math.min(1, age / 0.24) * Math.max(0, 1 - fraction) * 0.27;
      for (const cloud of smoke) {
        const radius = 0.16 + age * cloud.seed;
        cloud.puff.position.set(Math.cos(cloud.phase) * radius,
          0.15 + age * (0.6 + cloud.seed), Math.sin(cloud.phase) * radius + age * 0.5);
        cloud.puff.scale.setScalar(0.9 + age * (1.0 + cloud.seed));
      }
      visibleParticles = debris.count + embers.count + smoke.length;
    }

    /** update 只读取游戏状态；暂停冻结，死亡后仍以渲染时钟推进，重开立即移除余效。 */
    function update(state, config, { dt = 0, shipGroup = null } = {}) {
      if (previousRun !== state.runId || state.mode === 'MENU') reset();
      previousRun = state.runId;
      const step = state.mode === 'PAUSED' ? 0 : Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
      let triggered = false;
      if (state.mode === 'GAMEOVER' && !deathHandled) {
        trigger(state, shipGroup);
        triggered = active;
      }
      if (active && !triggered) {
        age = Math.min(duration, age + step);
        if (age >= duration) active = false;
      }
      renderExplosion(Boolean(state.reducedMotion));
      shieldRemaining = protection(state, config).remaining;
      shield.visible = shieldRemaining > 0 && Boolean(shipGroup);
      shieldOpacity = 0;
      if (!shield.visible) {
        shieldNodes.count = 0;
        shieldMaterial.uniforms.strength.value = 0;
        return;
      }
      shipGroup.updateWorldMatrix(true, false);
      shipGroup.localToWorld(point.set(0, 0.59, 0.06));
      shield.position.copy(point);
      shipGroup.getWorldQuaternion(shield.quaternion);
      if (!state.reducedMotion) shieldPhase += step;
      const remainingRatio = Math.min(1, shieldRemaining / Math.max(0.001, config.FUEL_BURST_GRACE || 1));
      // 末段逐步收敛，但无敌计时仍为正时保留可辨识的壳体与边线。
      shieldOpacity = 0.38 + 0.62 * Math.min(1, remainingRatio / 0.32);
      const effectTime = state.reducedMotion ? 0 : shieldPhase;
      shieldMaterial.uniforms.strength.value = shieldOpacity;
      shieldMaterial.uniforms.shieldTime.value = effectTime;
      shieldRimMaterial.opacity = shieldOpacity * 0.76;
      shieldVioletMaterial.opacity = shieldOpacity * 0.58;
      shieldNodeMaterial.opacity = shieldOpacity * 0.85;
      const size = 0.975 + 0.025 * Math.min(1, remainingRatio / 0.32);
      shield.scale.setScalar(size);
      for (const arc of shieldArcs) arc.object.rotation.z = arc.phase + effectTime * arc.speed;
      shieldNodes.count = 6;
      for (let index = 0; index < shieldNodes.count; index += 1) {
        const phase = index % 3 * Math.PI * 2 / 3;
        if (index < 3) {
          const angle = phase + effectTime * 0.42 + Math.PI * 0.36;
          transform.position.set(Math.cos(angle) * 1.46, 0, Math.sin(angle) * 1.62);
        } else {
          const angle = phase + 0.72 - effectTime * 0.31 + Math.PI * 0.36;
          transform.position.set(0, Math.sin(angle) * 0.88, -Math.cos(angle) * 1.62);
        }
        transform.rotation.set(0, effectTime * 0.7, 0);
        transform.scale.setScalar(1);
        transform.updateMatrix();
        shieldNodes.setMatrixAt(index, transform.matrix);
      }
      shieldNodes.instanceMatrix.needsUpdate = true;
    }

    function getDiagnostics() {
      return { explosion: { active, age, triggerCount, position: explosion.position.toArray(), particles: visibleParticles },
        shield: { active: shield.visible, remaining: shieldRemaining, opacity: shieldOpacity,
          phase: shieldMaterial.uniforms.shieldTime.value,
          orbitSegments: shield.visible ? shieldArcs.length : 0, nodes: shieldNodes.count }, resources: resources.size };
    }
    return { group, update, getDiagnostics };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightStatusFx = Object.freeze({ create, protection });
})(globalThis);
