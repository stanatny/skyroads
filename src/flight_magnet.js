'use strict';

// 磁吸展示复用真实收集实体；燃料结算仍由游戏负责，不因动画重复入账。
(function attachFlightMagnet(scope) {
  /** 计算晶体在移动世界中的牵引轨迹；result 接收坐标，不分配逐帧对象。 */
  function trajectory(pull, state, world, lanes, target, result, progress = pull.t) {
    const t = Math.max(0, Math.min(1, progress));
    const k = t * t * (3 - 2 * t);
    const x = (pull.lane - (lanes - 1) / 2) * world.laneWidth;
    const y = pull.height * world.heightScale;
    // 捕获后晶体随磁场纵向前行；高速推进也不会让它先掉到追尾相机背后再折返。
    const origin = Number.isFinite(pull.capturePosition) ? pull.capturePosition : state.position;
    const z = -(pull.segment - origin) * world.segmentDepth;
    result.set(x + (target.x - x) * k, y + (target.y - y) * k + Math.sin(t * Math.PI) * 1.1,
      z + (target.z - z) * k);
    return result;
  }

  /** 创建池化磁场和晶体尾迹；addFuel 使用场景已有水晶模型和实例批次。 */
  function create({ THREE, own, makeBatch, world, config, addFuel }) {
    const glow = own(new THREE.MeshBasicMaterial({ color: 0x76ffdd, transparent: true,
      opacity: 0.68, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const fieldMaterial = own(new THREE.MeshBasicMaterial({ color: 0x4ccfe9, transparent: true,
      opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const arc = own(new THREE.TorusGeometry(1, 0.022, 5, 48, Math.PI * 1.35));
    const trailGeometry = own(new THREE.CylinderGeometry(1, 1, 1, 6));
    trailGeometry.rotateX(Math.PI / 2);
    const sparkle = own(new THREE.OctahedronGeometry(1));
    const field = makeBatch('magnet_flux_arcs', arc, fieldMaterial, 4);
    const trails = makeBatch('magnet_crystal_filaments', trailGeometry, glow, 96 * 6);
    const sparks = makeBatch('magnet_collection_sparks', sparkle, glow, 96);
    const target = new THREE.Vector3();
    const point = new THREE.Vector3();
    const previous = new THREE.Vector3();
    const pose = new THREE.Object3D();
    let active = false;
    let visiblePulls = 0;
    let lastPosition = null;

    function update(state, time, shipGroup) {
      active = (state.mode === 'PLAYING' || state.mode === 'PAUSED') && state.magnetT > 0;
      visiblePulls = 0;
      lastPosition = null;
      if (state.mode !== 'PLAYING' && state.mode !== 'PAUSED') return;
      if (shipGroup) {
        shipGroup.updateWorldMatrix(true, false);
        target.set(0, 0.64, 0.12).applyMatrix4(shipGroup.matrixWorld);
      } else target.set(((state.movement?.lanePosition || 0) - (config.LANES - 1) / 2) * world.laneWidth,
        ((state.groundHeight || 0) + (state.playerY || 0)) * world.heightScale + 0.64, 0.12);
      if (active) {
        // 两道错开的细磁力弧留出前方视线；降动态时保留静态磁场身份。
        const phase = state.reducedMotion ? 0 : time * 1.7;
        field.add(target.x, target.y - 0.26, target.z, 1.15, 1.15, 1.15, Math.PI / 2, 0, phase);
        field.add(target.x, target.y - 0.12, target.z, 1.28, 1.28, 1.28, Math.PI / 2, 0, -phase + Math.PI);
      }
      const pulls = state.magnetPulls || [];
      for (const pull of pulls) {
        if (visiblePulls >= 96 || !(pull.t >= 0 && pull.t < 1)
          || !Number.isFinite(pull.lane) || !Number.isFinite(pull.segment) || !Number.isFinite(pull.height)) continue;
        visiblePulls += 1;
        if (state.reducedMotion) {
          if (visiblePulls === 1) sparks.add(target.x, target.y, target.z, 0.18, 0.18, 0.18);
          continue;
        }
        trajectory(pull, state, world, config.LANES, target, point);
        const size = 0.95 * (1 - Math.pow(pull.t, 5)) + 0.06;
        if (addFuel) addFuel(point.x, point.y, point.z, time, pull.segment + pull.lane, size);
        if (visiblePulls === 1) lastPosition = { x: point.x, y: point.y, z: point.z };
        for (let index = 0; index < 6; index += 1) {
          const age = pull.t - index * 0.036;
          if (age <= 0) break;
          trajectory(pull, state, world, config.LANES, target, point, age);
          trajectory(pull, state, world, config.LANES, target, previous, Math.max(0, age - 0.036));
          pose.position.copy(point).add(previous).multiplyScalar(0.5);
          pose.lookAt(previous);
          const radius = 0.028 * (1 - index / 7) * (1 - pull.t * 0.5);
          trails.add(pose.position.x, pose.position.y, pose.position.z, radius, radius,
            point.distanceTo(previous) + 0.015, pose.rotation.x, pose.rotation.y, pose.rotation.z);
        }
        if (pull.t > 0.76) {
          const radius = Math.sin((pull.t - 0.76) / 0.24 * Math.PI) * 0.19;
          sparks.add(target.x, target.y, target.z, radius, radius, radius);
        }
      }
    }
    return { update, getDiagnostics: () => ({ active, visiblePulls, lastPosition, capacity: 96 }) };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightMagnet = Object.freeze({ create, trajectory });
}(globalThis));
