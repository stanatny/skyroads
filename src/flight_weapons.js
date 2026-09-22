'use strict';

// 三维武器展示读取真实弹道及世界事件；模型、尾迹和爆炸均复用固定资源池。
(function attachFlightWeapons(scope) {
  /** 创建武器展示；接收 Three.js、父场景和资源登记器，返回逐帧更新与诊断接口。 */
  function create({ THREE, parent, own, world, config }) {
    const group = new THREE.Group();
    group.name = 'flight_weapons';
    parent.add(group);
    const resources = new Set();
    const keep = (resource) => { resources.add(resource); return own(resource); };
    const bodyMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xd0d8d6, roughness: 0.36, metalness: 0.62 }));
    const darkMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x30434e, roughness: 0.42, metalness: 0.78 }));
    const goldMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xb99558, roughness: 0.30, metalness: 0.70 }));
    const flameMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffa73f, transparent: true,
      opacity: 0.70, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const coreMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffeed1, toneMapped: false }));
    const chargeMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffc575, transparent: true,
      opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const sphere = keep(new THREE.IcosahedronGeometry(1, 1));
    const ring = keep(new THREE.TorusGeometry(1, 0.035, 6, 40));
    const cylinder = keep(new THREE.CylinderGeometry(0.16, 0.19, 1.28, 14));
    cylinder.rotateX(Math.PI / 2);
    cylinder.translate(0, 0, 0.99);
    const nose = keep(new THREE.ConeGeometry(0.16, 0.46, 14));
    nose.rotateX(-Math.PI / 2);
    nose.translate(0, 0, 0.23);
    const collar = keep(new THREE.CylinderGeometry(0.205, 0.205, 0.14, 14));
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0, 1.52);
    const exhaust = keep(new THREE.ConeGeometry(0.21, 2.0, 12));
    exhaust.rotateX(Math.PI / 2);
    exhaust.translate(0, 0, 1.0);
    const finGeometry = keep(makeFins());
    const missiles = Array.from({ length: config.MAX_MISSILE_SHOTS || 4 }, makeMissile);
    const shotSlots = new Map();
    const activeShots = new Set();
    const position = new THREE.Vector3();
    const missilePosition = new THREE.Vector3();
    const attachments = scope.Skyroads.flightDimensions.attachments;
    const muzzleOffset = new THREE.Vector3(...attachments.muzzle);
    const reactorOffset = new THREE.Vector3(...attachments.chargeReactor);
    const chargeMuzzle = makeCharge(false);
    const chargeReactor = makeCharge(true);
    let chargeRatio = 0;
    let lastEvent = 0;
    let previousRun = null;
    let previousPosition = null;
    let disposed = false;
    let smokeCursor = 0;
    let burstCursor = 0;
    let visibleMissiles = 0;
    let visibleParticles = 0;
    let visibleBursts = 0;
    const particleCapacity = 512;
    const particles = Array.from({ length: particleCapacity }, () => ({ life: 0 }));
    const particlePositions = new Float32Array(particleCapacity * 3);
    const particleColors = new Float32Array(particleCapacity * 3);
    const particleSizes = new Float32Array(particleCapacity);
    const particleOpacities = new Float32Array(particleCapacity);
    const particleGeometry = keep(new THREE.BufferGeometry());
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    particleGeometry.setAttribute('tint', new THREE.BufferAttribute(particleColors, 3).setUsage(THREE.DynamicDrawUsage));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1).setUsage(THREE.DynamicDrawUsage));
    particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(particleOpacities, 1).setUsage(THREE.DynamicDrawUsage));
    const particleMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 650 } },
      vertexShader: `attribute vec3 tint; attribute float size; attribute float alpha;
        uniform float pixelScale; varying vec3 particleTint; varying float particleAlpha;
        void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
          particleTint = tint; particleAlpha = alpha;
          gl_PointSize = clamp(size * pixelScale / max(1.0, -view.z), 1.0, 74.0);
          gl_Position = projectionMatrix * view; }`,
      fragmentShader: `varying vec3 particleTint; varying float particleAlpha;
        void main() { float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float edge = pow(max(0.0, 1.0 - radius * radius), 2.0);
          gl_FragColor = vec4(particleTint, particleAlpha * edge); }`,
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    const points = new THREE.Points(particleGeometry, particleMaterial);
    points.name = 'missile_smoke_and_impact_particles';
    points.frustumCulled = false;
    group.add(points);
    const bursts = Array.from({ length: 6 }, makeBurst);

    function mesh(geometry, material, target = group) {
      const result = new THREE.Mesh(geometry, material);
      target.add(result);
      return result;
    }

    function makeFins() {
      // 四片折展尾翼共用一组封闭几何，按发射年龄展开，不逐帧重建网格。
      const shape = new THREE.Shape();
      shape.moveTo(0.13, 1.00); shape.lineTo(0.50, 1.42);
      shape.lineTo(0.47, 1.75); shape.lineTo(0.13, 1.58); shape.closePath();
      const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
      blade.rotateX(Math.PI / 2);
      blade.translate(0, 0.0225, 0);
      const positions = [];
      const normals = [];
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < 4; index += 1) {
        const copy = blade.clone();
        matrix.makeRotationZ(index * Math.PI / 2);
        copy.applyMatrix4(matrix);
        positions.push(...copy.attributes.position.array);
        normals.push(...copy.attributes.normal.array);
        copy.dispose();
      }
      blade.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.computeBoundingSphere();
      return geometry;
    }

    function makeMissile() {
      const craft = new THREE.Group();
      craft.name = 'guided_missile';
      group.add(craft);
      mesh(cylinder, bodyMaterial, craft);
      mesh(nose, goldMaterial, craft);
      mesh(collar, darkMaterial, craft);
      const fins = mesh(finGeometry, darkMaterial, craft);
      const plume = mesh(exhaust, flameMaterial, craft);
      plume.position.z = 1.67;
      const core = mesh(exhaust, coreMaterial, craft);
      core.position.z = 1.64;
      core.scale.set(0.45, 0.45, 0.60);
      craft.visible = false;
      return { group: craft, fins, plume, core, shot: null, lastSeg: 0, lastY: 0, smokeDebt: 0 };
    }

    function makeCharge(reactor) {
      const charge = new THREE.Group();
      charge.name = reactor ? 'missile_charge_capacitor' : 'missile_charge_muzzle';
      const core = mesh(sphere, chargeMaterial, charge);
      core.scale.setScalar(reactor ? 0.10 : 0.09);
      const outer = mesh(ring, chargeMaterial, charge);
      outer.scale.setScalar(reactor ? 0.34 : 0.22);
      if (reactor) outer.rotation.x = Math.PI / 2;
      const inner = mesh(ring, chargeMaterial, charge);
      inner.scale.setScalar(reactor ? 0.23 : 0.15);
      if (reactor) inner.rotation.x = Math.PI / 2;
      charge.visible = false;
      group.add(charge);
      return { group: charge, core, outer, inner, reactor };
    }

    function makeBurst() {
      const flashMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffc66f, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const shockMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffdd92, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const flash = mesh(sphere, flashMaterial);
      const shock = mesh(ring, shockMaterial);
      shock.rotation.x = Math.PI / 2;
      flash.visible = shock.visible = false;
      return { flash, shock, life: 0, maxLife: 0, seg: 0, x: 0, y: 0, launch: false, super: false };
    }

    function laneX(lane) { return (lane - ((config.LANES || 7) - 1) / 2) * world.laneWidth; }
    function segmentZ(segment, state) { return -(segment - state.position) * world.segmentDepth; }

    function emitParticle(x, y, seg, kind, phase, reducedMotion) {
      const particle = particles[smokeCursor++ % particleCapacity];
      const spark = kind === 'spark';
      particle.x = x; particle.y = y; particle.seg = seg;
      particle.life = particle.maxLife = reducedMotion ? 0.24 : spark ? 0.65 : 0.92;
      particle.vx = reducedMotion ? 0 : spark ? Math.cos(phase) * (3 + phase % 3) : Math.sin(phase) * 0.10;
      particle.vy = reducedMotion ? 0 : spark ? 1.2 + Math.sin(phase * 2.7) * 3.8 : 0.20;
      particle.vs = reducedMotion ? 0 : spark ? Math.sin(phase) * 0.7 : 0;
      particle.size = spark ? 0.16 : 0.38;
      particle.spark = spark;
    }

    function activateEvent(event, state) {
      const burst = bursts[burstCursor++ % bursts.length];
      burst.life = burst.maxLife = event.kind === 'launch' ? 0.18 : state.reducedMotion ? 0.24 : 0.70;
      burst.launch = event.kind === 'launch'; burst.super = Boolean(event.super);
      burst.x = laneX(event.lanePosition); burst.y = event.y * world.heightScale; burst.seg = event.seg;
      if (!burst.launch) {
        const count = state.reducedMotion ? 6 : burst.super ? 34 : 22;
        for (let index = 0; index < count; index += 1) {
          emitParticle(burst.x, burst.y, burst.seg, 'spark', index * 2.399, state.reducedMotion);
        }
      }
    }

    function reset() {
      shotSlots.clear(); activeShots.clear(); lastEvent = 0;
      visibleMissiles = visibleParticles = visibleBursts = 0;
      for (const slot of missiles) { slot.shot = null; slot.group.visible = false; slot.smokeDebt = 0; }
      for (const particle of particles) particle.life = 0;
      for (const burst of bursts) { burst.life = 0; burst.flash.visible = burst.shock.visible = false; }
    }

    /** update 只读状态；暂停冻结粒子年龄，reducedMotion 缩短爆炸并停用烟轨扩散。 */
    function update(state, { dt = 0, time = 0, shipGroup = null, viewportHeight = 900 } = {}) {
      if (disposed) return;
      if (previousRun !== state.runId || (previousPosition !== null && state.position < previousPosition)) reset();
      previousRun = state.runId; previousPosition = state.position;
      const elapsed = state.mode === 'PLAYING' ? Math.max(0, Math.min(0.05, dt)) : 0;
      const animatedTime = state.reducedMotion ? 0 : time;
      chargeRatio = state.mode === 'PLAYING' || state.mode === 'PAUSED'
        ? Math.min(1, Math.max(0, (state.chargeT || 0) / config.CHARGE_TIME)) : 0;
      if (shipGroup) shipGroup.updateMatrixWorld(true);
      for (const charge of [chargeMuzzle, chargeReactor]) {
        charge.group.visible = chargeRatio > 0 && state.chargeT >= (config.CHARGE_HUD_DELAY || 0.5)
          && Boolean(shipGroup);
        if (!charge.group.visible) continue;
        position.copy(charge.reactor ? reactorOffset : muzzleOffset);
        shipGroup.localToWorld(position);
        charge.group.position.copy(position);
        charge.group.quaternion.copy(shipGroup.quaternion);
        const scale = 0.35 + 0.65 * chargeRatio;
        charge.group.scale.setScalar(scale);
        charge.core.scale.setScalar((charge.reactor ? 0.10 : 0.09) + chargeRatio * 0.12);
        charge.inner.rotation.z = animatedTime * 2.0;
        charge.outer.rotation.z = -animatedTime * 1.3;
      }
      activeShots.clear();
      for (const shot of state.shots || []) if (shot.kind === 'missile') activeShots.add(shot);
      for (const [shot, slot] of shotSlots) {
        if (activeShots.has(shot)) continue;
        slot.group.visible = false; slot.shot = null; shotSlots.delete(shot);
      }
      visibleMissiles = 0;
      for (const shot of activeShots) {
        let slot = shotSlots.get(shot);
        const absoluteY = ((shot.groundY || 0) + (shot.y || 0)) * world.heightScale;
        if (!slot) {
          slot = missiles.find((candidate) => !candidate.shot);
          if (!slot) break;
          slot.shot = shot; slot.lastSeg = shot.seg; slot.lastY = absoluteY; slot.smokeDebt = 0;
          shotSlots.set(shot, slot);
        }
        const z = segmentZ(shot.seg, state);
        slot.group.visible = z < 3 && z > -520;
        if (!slot.group.visible) continue;
        visibleMissiles += 1;
        slot.group.position.set(laneX(shot.lanePosition), absoluteY, z);
        slot.group.rotation.x = Number.isFinite(shot.pitch) ? shot.pitch : 0;
        const deployment = state.reducedMotion ? 1 : Math.min(1, (shot.age || 0) / 0.12);
        slot.fins.scale.set(0.40 + 0.60 * deployment, 0.40 + 0.60 * deployment, 1);
        slot.plume.scale.z = state.reducedMotion ? 1 : 1.0 + Math.sin(animatedTime * 38) * 0.10;
        if (elapsed > 0 && !state.reducedMotion) {
          const distance = (shot.seg - slot.lastSeg) * world.segmentDepth;
          const count = Math.min(10, Math.max(1, Math.ceil(distance / 0.35)));
          for (let index = 0; index < count; index += 1) {
            const fraction = index / count;
            emitParticle(slot.group.position.x, slot.lastY + (absoluteY - slot.lastY) * fraction,
              slot.lastSeg + (shot.seg - slot.lastSeg) * fraction - 0.40,
              'smoke', shot.seg + index * 2.4, false);
          }
        }
        slot.lastSeg = shot.seg; slot.lastY = absoluteY;
      }
      for (const event of state.weaponEvents || []) {
        if (event.id <= lastEvent) continue;
        lastEvent = event.id;
        activateEvent(event, state);
      }
      visibleParticles = 0;
      for (const particle of particles) {
        if (particle.life <= 0) continue;
        particle.life -= elapsed;
        if (particle.life <= 0) continue;
        if (!state.reducedMotion) {
          particle.x += particle.vx * elapsed;
          particle.y += particle.vy * elapsed;
          particle.seg += particle.vs * elapsed;
        }
        if (particle.spark && !state.reducedMotion) particle.vy -= elapsed * 5;
        const remaining = particle.life / particle.maxLife;
        const offset = visibleParticles * 3;
        particlePositions[offset] = particle.x;
        particlePositions[offset + 1] = particle.y;
        particlePositions[offset + 2] = segmentZ(particle.seg, state);
        particleColors[offset] = particle.spark ? 1 : 0.64;
        particleColors[offset + 1] = particle.spark ? 0.58 + remaining * 0.28 : 0.69;
        particleColors[offset + 2] = particle.spark ? 0.18 : 0.72;
        particleSizes[visibleParticles] = particle.size + (1 - remaining) * (particle.spark ? 0.15 : 0.72);
        particleOpacities[visibleParticles] = remaining * (particle.spark ? 0.92 : 0.34);
        visibleParticles += 1;
      }
      particleGeometry.setDrawRange(0, visibleParticles);
      for (const attribute of Object.values(particleGeometry.attributes)) attribute.needsUpdate = true;
      particleMaterial.uniforms.pixelScale.value = viewportHeight * 0.72;
      visibleBursts = 0;
      for (const burst of bursts) {
        burst.life -= elapsed;
        burst.flash.visible = burst.shock.visible = burst.life > 0;
        if (burst.life <= 0) continue;
        visibleBursts += 1;
        const progress = 1 - burst.life / burst.maxLife;
        const radius = burst.launch ? 0.24 + progress * 0.60 : (burst.super ? 1.45 : 0.95) + progress * (burst.super ? 6 : 3.8);
        missilePosition.set(burst.x, burst.y, segmentZ(burst.seg, state));
        burst.flash.position.copy(missilePosition);
        burst.shock.position.copy(missilePosition);
        burst.flash.scale.setScalar(radius * (burst.launch ? 0.55 : 0.63));
        burst.shock.scale.setScalar(radius);
        burst.flash.material.opacity = Math.max(0, (1 - progress * 2)) * (state.reducedMotion ? 0.24 : 0.66);
        burst.shock.material.opacity = (1 - progress) * (state.reducedMotion ? 0.35 : 0.90);
      }
    }

    /** 返回池使用量与展示状态，便于真实输入测试核对蓄力、导弹和爆炸。 */
    function getDiagnostics() {
      return { chargeRatio, chargeVisible: chargeMuzzle.group.visible || chargeReactor.group.visible,
        missiles: visibleMissiles, particles: visibleParticles, bursts: visibleBursts,
        particleCapacity, missileCapacity: missiles.length, resources: resources.size,
        lastEvent, disposed };
    }

    /** 从场景移除展示；几何和材质由传入 own 的统一登记器释放。 */
    function dispose() { if (disposed) return; disposed = true; reset(); parent.remove(group); group.clear(); }
    return { group, update, getDiagnostics, dispose };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightWeapons = Object.freeze({ create });
}(globalThis));
