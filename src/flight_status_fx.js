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
    const graceDuration = Math.max(0, config.FUEL_BURST_GRACE ?? 1);
    // 主动爆发到期会自动接续保护；把这段时间纳入同一次倒计时，交接时不闪断或重填进度条。
    const burstProtection = Math.max(grace, burst > 0 ? burst + graceDuration : 0);
    const remaining = Math.max(boost, burstProtection);
    const duration = remaining <= 0 ? 0 : boost >= burstProtection
      ? (config.BOOST_DURATION || 5) : (config.FUEL_BURST_DURATION || 3) + graceDuration;
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
    const shieldMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: `varying vec3 surfaceNormal; varying vec3 viewDirection;
        void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
          surfaceNormal = normalize(normalMatrix * normal); viewDirection = -view.xyz;
          gl_Position = projectionMatrix * view; }`,
      fragmentShader: `uniform float strength; varying vec3 surfaceNormal; varying vec3 viewDirection;
        void main() { float rim = pow(1.0 - abs(dot(normalize(surfaceNormal), normalize(viewDirection))), 2.4);
          gl_FragColor = vec4(mix(vec3(0.12, 0.48, 1.0), vec3(0.46, 0.91, 1.0), rim),
            strength * (0.018 + rim * 0.52)); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    }));
    const shell = mesh(keep(new THREE.SphereGeometry(1, 36, 24)), shieldMaterial, shield);
    shell.name = 'ship_grace_shield_shell';
    shell.scale.set(1.46, 0.88, 1.62);
    const latticeMaterial = additive(0x60cfff);
    latticeMaterial.wireframe = true;
    const lattice = mesh(sphere, latticeMaterial, shield);
    lattice.name = 'ship_grace_shield_lattice';
    lattice.scale.copy(shell.scale).multiplyScalar(1.002);
    const shieldRimMaterial = additive(0x83e6ff);
    const shieldRim = mesh(ring, shieldRimMaterial, shield);
    shieldRim.name = 'ship_grace_shield_equator';
    shieldRim.rotation.x = Math.PI / 2;
    shieldRim.scale.set(1.46, 1.62, 1);
    const meridian = mesh(ring, shieldRimMaterial, shield);
    meridian.name = 'ship_grace_shield_meridian';
    meridian.rotation.y = Math.PI / 2;
    meridian.scale.set(1.62, 0.88, 1);
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
      fire.count = debris.count = embers.count = 0;
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
      if (!shield.visible) return;
      shipGroup.updateWorldMatrix(true, false);
      shipGroup.localToWorld(point.set(0, 0.59, 0.06));
      shield.position.copy(point);
      shipGroup.getWorldQuaternion(shield.quaternion);
      if (!state.reducedMotion) shieldPhase += step;
      const remainingRatio = Math.min(1, shieldRemaining / Math.max(0.001, config.FUEL_BURST_GRACE || 1));
      // 末段逐步收敛，但无敌计时仍为正时保留可辨识的壳体与边线。
      shieldOpacity = 0.38 + 0.62 * Math.min(1, remainingRatio / 0.32);
      shieldMaterial.uniforms.strength.value = shieldOpacity;
      latticeMaterial.opacity = shieldOpacity * 0.09;
      shieldRimMaterial.opacity = shieldOpacity * 0.61;
      const size = 0.975 + 0.025 * Math.min(1, remainingRatio / 0.32);
      shield.scale.setScalar(size);
      lattice.rotation.y = state.reducedMotion ? 0 : shieldPhase * 0.30;
    }

    function getDiagnostics() {
      return { explosion: { active, age, triggerCount, position: explosion.position.toArray(), particles: visibleParticles },
        shield: { active: shield.visible, remaining: shieldRemaining, opacity: shieldOpacity }, resources: resources.size };
    }
    return { group, update, getDiagnostics };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightStatusFx = Object.freeze({ create, protection });
})(globalThis);
