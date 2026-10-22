'use strict';

// 所有实体在初始化时合并建模；逐帧仅更新实例，不分配几何、材质或临时向量。
(function attachFlightObjects(scope) {
  // v10 "Neon Void" 调色：敌机走冷灰 + 洋红，奖励色保持高饱和以便一眼分辨。
  // v13：敌机从"洋红"改到"警示朱橙"。背景整片是洋红/紫/电青，洋红涂装在高速下和星云
  // 糊成一片（视觉复核：颜色冲突、剪影不突出）；暖橙在深空背景里是唯一没被占用的色相，
  // 所以机体装甲、灯带、威胁环统一换到这一族，奖励色（翠绿/粉/紫/金/青）不受影响。
  const PALETTE = Object.freeze({
    titanium: 0xb9c0d8, ivory: 0xe8e4f2, graphite: 0x121422, recess: 0x06070e,
    cobalt: 0x3d2a72, crimson: 0x8e1f52, red: 0xff2f6d, emerald: 0x21d29a,
    mint: 0x8dffe0, amber: 0xff4fa8, gold: 0xffd373, violet: 0xc06bff, cyan: 0x35f0ff,
    hostile: 0xff713d, hostileGlow: 0xffa24a, rust: 0x6d2f16, gunmetal: 0x1d2129,
    // 语义色：转向箭头/威胁提示用它。测试按名字取色，美术换色相不会造成假失败。
    cue: 0xffa24a,
  });
  const PICKUP_COLORS = Object.freeze({
    FUEL: PALETTE.emerald, BOOST: PALETTE.amber, SLOW: PALETTE.violet,
    TRIPLE: PALETTE.gold, MAGNET: PALETTE.cyan,
  });

  /**
   * 创建有材质层次的敌机、炮台与奖励模型。
   * 参数为 Three.js、资源登记器、实例批次工厂、世界比例及游戏配置。
   * 返回实体提交方法和诊断；坡面位置变换、释放及物理状态仍由调用方负责。
   */
  function create({ THREE, own, makeBatch, world, config }) {
    const metal = own(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, metalness: 0.48, roughness: 0.35,
      emissive: 0x09131c, emissiveIntensity: 0.16,
    }));
    // v8：敌机/炮台独立一份材质，让 HF 生成的绯红涂装不污染语义化的奖励配色。
    const hostileMetal = own(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, metalness: 0.55, roughness: 0.30,
      emissive: 0x1a0a0c, emissiveIntensity: 0.22,
    }));
    const signal = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, toneMapped: false,
    }));
    // v10：奖励机体只借贴图的磨损/分缝亮度，颜色仍由 PICKUP_COLORS 决定（可读性优先）。
    // 敌机则由无人机涂装贴图接管固有色：枪灰装甲 + 洋红传感器 + 青色技术标记。
    const skins = scope.Skyroads && scope.Skyroads.artSkins;
    if (skins && typeof skins.paint === 'function') {
      skins.paint(metal, THREE, {
        key: 'pickup-shell',
        detail: { url: './assets/art/station-hull.webp', scale: 0.9, strength: 0.34, contrast: 2.3 },
      });
      // v11：无人机重新生成了一份"枪灰装甲 + 洋红单眼 + 密集紧固件"的涂装，固有色接管提到 0.90，
      // 贴图频率提到 0.75（原来 0.52，机身只有一小块区域，等于没细节），并给机体加了洋红边缘光——
      // 它必须一眼从满屏青色里分出来，否则玩家分不清"能撞的"和"能捡的"。
      // v13：上一版的问题是它分出来的方式是"更亮的洋红"，而背景整片就是洋红。这一版
      // 把贴图色往暖橙染（tint），固有色接管从 0.90 降到 0.72 让机体上的锈红/枪灰顶点色
      // 重新参与（顶点色是逐部件写的，被 0.90 的接管基本抹平了），自发光也换到警示橙。
      skins.paint(hostileMetal, THREE, {
        key: 'drone-shell',
        albedo: { url: './assets/art/drone-shell.webp', scale: 0.75, mix: 0.66, luma: 0.64, gain: 0.78, tint: 0xff9a5e },
        emissive: { url: './assets/art/wall-emissive.webp', scale: 0.62, color: 0xff713d, gain: 0.90 },
        bump: 0.7,
        rim: { color: 0xff8a4a, gain: 0.34, power: 2.4 },
        rough: 0.35,
      });
    }
    // 实体晶面保留环境反射及明暗面，内部亮面从分离的晶棱中透出。
    const crystal = own(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, metalness: 0.03, roughness: 0.055,
      clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.64,
      depthWrite: false, emissive: 0x063629, emissiveIntensity: 0.13,
    }));
    const beamMaterial = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: lightTexture(THREE, own, 'beam'), transparent: true,
      opacity: 0.52, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const groundMaterial = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: lightTexture(THREE, own, 'ring'), transparent: true,
      opacity: 0.68, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const particleMaterial = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, map: lightTexture(THREE, own, 'spark'), transparent: true,
      opacity: 0.78, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const capacity = (config.RENDER_DISTANCE || 120) * (config.LANES || 7);
    const diagnostics = {};
    const pickups = {};
    let batchCount = 0;

    function batch(name, builder, material, maximum = capacity, role = 'solid') {
      const geometry = own(builder.finish());
      const result = makeBatch(name, geometry, material, maximum);
      if (result.mesh) result.mesh.castShadow = material === metal || material === hostileMetal;
      const box = geometry.boundingBox;
      diagnostics[name] = {
        triangles: (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3,
        bounds: { min: box.min.toArray(), max: box.max.toArray() },
        capacity: maximum, role,
      };
      batchCount += 1;
      return result;
    }

    for (const type of Object.keys(PICKUP_COLORS)) {
      const body = builder(THREE);
      const lights = builder(THREE);
      if (type === 'FUEL') buildEnergyPrism(body, lights);
      else if (type === 'BOOST') buildBoost(body, lights);
      else if (type === 'SLOW') buildGyroscope(body, lights);
      else if (type === 'TRIPLE') buildTriple(body, lights);
      else buildMagnet(body, lights);
      // 高速磁吸时上一窗口的晶体仍在飞行，为共享实体批次预留整个吸附池。
      const maximum = capacity + (type === 'FUEL' ? 96 : 0);
      pickups[type] = {
        body: batch(`object_${type.toLowerCase()}_body`, body, metal, maximum),
        lights: batch(`object_${type.toLowerCase()}_signal`, lights, signal, maximum),
      };
    }
    const crystalShell = builder(THREE);
    // 单颗悬浮能量棱晶：上下收尖、双层肩面，取消底座与枝状副晶体。
    crystalShell.gem(0, 0, 0, 0.43, 1.80, 0x2bd9a3, 6, 0,
      [[-0.50, 0], [-0.28, 0.61], [0.13, 1], [0.32, 0.63], [0.50, 0]]);
    const crystalBatch = batch('object_fuel_facets', crystalShell, crystal, capacity + 96);
    const droneBody = builder(THREE);
    buildDrone(droneBody);
    const drone = batch('object_drone_interceptor', droneBody, hostileMetal);
    const turretBaseBody = builder(THREE);
    const turretHeadBody = builder(THREE);
    const turretHeight = (config.TURRET_HEIGHT || 1900) * world.heightScale;
    buildTurret(turretBaseBody, turretHeadBody, turretHeight);
    const turretBase = batch('object_turret_foundation', turretBaseBody, hostileMetal);
    const turretHead = batch('object_turret_azimuth_head', turretHeadBody, hostileMetal);
    const emitterBuilder = builder(THREE);
    emitterBuilder.gem(0, 0, 0, 1, 2, 0xffffff, 8);
    const emitter = batch('object_hostile_emitters', emitterBuilder, signal, capacity * 6);
    const ground = batch('object_pickup_floor_marks', planeBuilder(THREE), groundMaterial,
      capacity, 'effect');
    const beam = batch('object_pickup_light_columns', planeBuilder(THREE), beamMaterial,
      capacity * 3, 'effect');
    const sparks = batch('object_pickup_energy_sparks', planeBuilder(THREE), particleMaterial,
      capacity * 8, 'effect');
    const pickupHeight = (config.FUEL_BLOCK_HEIGHT || 450) * world.heightScale;
    const droneTop = (config.DRONE_HEIGHT || 500) * world.heightScale;

    /**
     * 只提交燃料实体，复用固定批次供磁吸轨迹调用。
     * x/y/z 是模型中心，y 不再叠加浮动；调用方负责清空坡面偏移后传入世界坐标。
     */
    function addFuel(x, y, z, time = 0, index = 0, scale = 1) {
      const turn = time * 0.34 + index * 0.71;
      const model = pickups.FUEL;
      model.body.add(x, y, z, scale, scale, scale, 0, turn);
      model.lights.add(x, y, z, scale, scale, scale, 0, turn);
      crystalBatch.add(x, y, z, scale, scale, scale, 0, turn);
    }

    function addPickup(type, x, z, time = 0, index = 0) {
      const model = pickups[type];
      if (!model) return;
      const phase = index * 0.71;
      const y = pickupHeight + Math.sin(time * 1.65 + phase) * 0.065;
      if (type === 'FUEL') addFuel(x, y, z, time, index);
      else {
        const turn = Math.sin(time * 0.82 + phase) * 0.22;
        model.body.add(x, y, z, 1, 1, 1, 0, turn);
        model.lights.add(x, y, z, 1, 1, 1, 0, turn);
      }
      addRewardSignal(type, x, z, y, time, phase);
    }

    function addRewardSignal(type, x, z, y, time, phase) {
      const tint = PICKUP_COLORS[type];
      const pulse = 0.96 + 0.04 * Math.sin(time * 1.8 + phase);
      // 同色光柱以加色渐变叠加，不写深度，实体和路线仍可透视辨认。
      // 两个交叉薄片形成体积感，细长中央束加强高速远距识别。
      beam.add(x, 4.55, z, 1.58 * pulse, 9.0, 1, 0, 0, 0, tint);
      beam.add(x, 4.55, z, 1.58 * pulse, 9.0, 1, 0, Math.PI / 2, 0, tint);
      beam.add(x, 5.55, z, 0.16, 11.0, 1, 0, 0, 0, tint);
      ground.add(x, 0.055, z, 1.95 * pulse, 1.95 * pulse, 1,
        -Math.PI / 2, 0, 0, tint);
      sparks.add(x, y + 0.04, z + 0.13, 0.84 * pulse, 0.84 * pulse, 1, 0, 0, 0, tint);
      // 固定相位和解析位置保证暂停/减少动态时稳定，不持有逐帧生成的粒子对象。
      for (let particle = 0; particle < 6; particle += 1) {
        const progress = ((time * 0.20 + particle / 6 + phase * 0.11) % 1 + 1) % 1;
        const angle = phase + particle * 2.399 + time * 0.18;
        const radius = 0.28 + (particle % 3) * 0.105;
        const size = (0.075 + 0.10 * Math.sin(progress * Math.PI)) * pulse;
        sparks.add(x + Math.cos(angle) * radius, 0.30 + progress * 5.6,
          z + Math.sin(angle) * radius, size, size * 1.9, 1, 0, 0, 0, tint);
      }
    }

    function addEnemy(enemy, x, z, time = 0) {
      if (enemy.type === 'turret') {
        const turn = Math.sin(time * 0.43 + (enemy.lane || 0)) * 0.07;
        const pivot = turretHeight * 0.63;
        turretBase.add(x, 0, z);
        turretHead.add(x, pivot, z, 1, 1, 1, 0, turn);
        const sine = Math.sin(turn);
        const cosine = Math.cos(turn);
        // 枪口跟随实际炮座转向；建模保持单车道净空，不改变原有敌人命中框。
        for (let side = -1; side <= 1; side += 2) {
          const localX = side * 0.46;
          emitter.add(x + localX * cosine + 1.67 * sine, turretHeight * 0.70,
            z + 1.67 * cosine - localX * sine, 0.095, 0.095, 0.028, Math.PI / 2, turn, 0, PALETTE.red);
        }
        emitter.add(x + 1.005 * sine, turretHeight * 0.89, z + 1.005 * cosine,
          0.15, 0.06, 0.026, 0, turn, 0, PALETTE.hostile);
        // v13：机身正下方贴一块暖橙"占位环"。远距离时敌机只有几十像素高，看不清机体朝向，
        // 但甲板上这一圈光能立刻说明"这个车道有东西"，而且它跟着真正的碰撞车道走。
        ground.add(x, 0.058, z, 2.05, 2.05, 1, -Math.PI / 2, 0, 0, PALETTE.hostile);
        return;
      }
      // 直接读取固定飞行高度；刚性机顶、灯和风扇保持同一高度，不另做升降动画。
      const altitude = Number.isFinite(enemy.altitude) ? Math.max(0, enemy.altitude) : 0;
      const y = droneTop - 0.49 + altitude * world.heightScale;
      drone.add(x, y, z);
      const intensity = enemy.state === 'warn' ? 0.62 + 0.38 * Math.abs(Math.sin(time * 8)) : 1;
      const red = Math.round(255 * intensity);
      const tint = (red << 16) | (Math.round(101 * intensity) << 8) | Math.round(78 * intensity);
      emitter.add(x, y + 0.18, z + 1.19, 0.15, 0.066, 0.032, 0, 0, 0, tint);
      ground.add(x, y - 0.30, z, 1.55, 1.55, 1, -Math.PI / 2, 0, 0, PALETTE.hostile);
      for (let side = -1; side <= 1; side += 2) {
        emitter.add(x + side * 0.96, y - 0.04, z - 0.49, 0.095, 0.095, 0.045,
          Math.PI / 2, 0, 0, PALETTE.hostile);
      }
      // v13：机体下方的暖橙威胁环。它必须跟随机体一起升到真实盘旋高度——敌人视觉
      // 一旦留在甲板上，玩家就会照着错误的高度判断能不能钻过去（tests/flight_objects
      // 的"所有附着灯跟随权威物理高度"就是保这条）。
      if (enemy.state === 'warn' || enemy.state === 'move') {
        const direction = Math.sign(enemy.toLane - enemy.fromLane);
        if (direction) {
          // 两段翼尖灯构成真实方向箭头；即使不依赖闪烁也能读出下一次横移。
          emitter.add(x + direction * 1.17, y + 0.22, z + 0.16,
            0.20, 0.035, 0.045, 0, 0, -direction * 0.55, PALETTE.cue);
          emitter.add(x + direction * 1.17, y + 0.06, z + 0.16,
            0.20, 0.035, 0.045, 0, 0, direction * 0.55, PALETTE.cue);
        }
      }
    }

    function getDiagnostics() {
      return { batchCount, capacity, droneTop, turretHeight, pickups: Object.keys(pickups), models: diagnostics };
    }
    return { addPickup, addFuel, addEnemy, getDiagnostics };
  }

  function buildEnergyPrism(body, lights) {
    // 细薄悬浮整流翼只占晶体中段，不再形成盆状托架。
    for (let fin = 0; fin < 3; fin += 1) {
      const angle = fin * Math.PI * 2 / 3;
      const x = Math.cos(angle) * 0.43;
      const z = Math.sin(angle) * 0.43;
      body.box(x, -0.11, z, 0.075, 0.40, 0.11, PALETTE.titanium, 0, -angle);
      body.box(x, -0.12, z, 0.084, 0.14, 0.12, PALETTE.graphite, 0, -angle);
      lights.rod([Math.cos(angle) * 0.435, -0.20, Math.sin(angle) * 0.435],
        [Math.cos(angle) * 0.435, 0.04, Math.sin(angle) * 0.435], 0.013, PALETTE.mint);
      // 折面边线逐段连接真实晶体肩面，保留透亮实体的深浅变化。
      const shoulder = [Math.cos(angle) * 0.432, 0.234, Math.sin(angle) * 0.432];
      const crown = [Math.cos(angle) * 0.274, 0.576, Math.sin(angle) * 0.274];
      lights.rod(shoulder, crown, 0.010, 0x83f5c6);
      lights.rod(crown, [0, 0.895, 0], 0.009, 0xd4ffe7);
      lights.rod([Math.cos(angle) * 0.264, -0.504, Math.sin(angle) * 0.264],
        [0, -0.895, 0], 0.009, 0x82f7cf);
    }
    lights.gem(0, 0.025, 0, 0.135, 1.32, 0xddffee, 6);
    lights.gem(0, 0.02, 0, 0.21, 0.43, 0x98ffd2, 6);
    body.gem(0, -0.86, 0, 0.055, 0.15, PALETTE.titanium, 6);
    body.gem(0, 0.86, 0, 0.052, 0.13, PALETTE.titanium, 6);
  }

  function buildBoost(body, lights) {
    body.cylinder(0, -0.28, 0, 0.34, 0.42, PALETTE.graphite, Math.PI / 2, 10);
    body.cylinder(0, -0.28, 0.24, 0.26, 0.10, PALETTE.titanium, Math.PI / 2, 10);
    lights.cylinder(0, -0.28, 0.30, 0.17, 0.025, PALETTE.amber, Math.PI / 2, 10);
    for (let step = 0; step < 2; step += 1) {
      const y = -0.12 + step * 0.48;
      body.prism([[-0.69, y - 0.02], [0, y + 0.52], [0.69, y - 0.02], [0.61, y - 0.18],
        [0, y + 0.21], [-0.61, y - 0.18]], 0.22, PALETTE.amber, 0, 0, -step * 0.10);
      lights.prism([[-0.54, y - 0.005], [0, y + 0.41], [0.54, y - 0.005], [0.47, y - 0.04],
        [0, y + 0.29], [-0.47, y - 0.04]], 0.015, PALETTE.gold, 0, 0, 0.12 - step * 0.10);
    }
    for (let side = -1; side <= 1; side += 2) {
      body.box(side * 0.43, -0.45, -0.10, 0.13, 0.44, 0.38, PALETTE.titanium, 0, 0, -side * 0.24);
      for (let slot = 0; slot < 3; slot += 1) {
        body.box(side * 0.44, -0.31 - slot * 0.10, 0.101, 0.15, 0.025, 0.015, PALETTE.graphite);
      }
    }
  }

  function buildGyroscope(body, lights) {
    body.ring(0, 0, 0, 0.65, 0.065, PALETTE.titanium, 0.25, 0.15);
    body.ring(0, 0, 0, 0.52, 0.055, PALETTE.violet, 0.45, 1.12);
    body.ring(0, 0, 0, 0.40, 0.05, PALETTE.graphite, 1.28, -0.35);
    for (let side = -1; side <= 1; side += 2) {
      body.box(side * 0.67, 0, 0, 0.15, 0.24, 0.28, PALETTE.graphite);
      body.cylinder(side * 0.67, 0, 0.16, 0.073, 0.06, PALETTE.gold, Math.PI / 2, 8);
      body.cylinder(0, side * 0.29, 0, 0.22, 0.055, PALETTE.titanium, 0, 8);
    }
    body.gem(0, 0.14, 0, 0.20, 0.28, PALETTE.violet, 6);
    body.gem(0, -0.14, 0, 0.20, 0.28, PALETTE.violet, 6);
    lights.gem(0, 0, 0, 0.105, 0.33, 0xd7baff, 6);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      lights.box(Math.sin(angle) * 0.63, Math.cos(angle) * 0.63, 0.05,
        0.055, index % 2 ? 0.055 : 0.11, 0.03, PALETTE.violet, 0, 0, -angle);
    }
  }

  function buildTriple(body, lights) {
    body.prism([[-0.58, -0.33], [-0.36, -0.60], [0.36, -0.60], [0.58, -0.33],
      [0.46, -0.11], [-0.46, -0.11]], 0.37, PALETTE.graphite);
    body.box(0, -0.38, 0.205, 0.60, 0.09, 0.025, PALETTE.gold);
    for (let index = -1; index <= 1; index += 1) {
      const x = index * 0.39;
      const y = index === 0 ? 0.15 : -0.01;
      const rotation = -index * 0.12;
      body.box(x, y, 0, 0.24, 0.91, 0.33, PALETTE.gold, 0, 0, rotation);
      body.box(x, y, 0.18, 0.14, 0.54, 0.03, PALETTE.graphite, 0, 0, rotation);
      lights.box(x, y + 0.04, 0.204, 0.07, 0.34, 0.014, 0xffefa7, 0, 0, rotation);
      body.cylinder(x, y + 0.48, 0, 0.115, 0.075, PALETTE.titanium, 0, 8);
      lights.gem(x, y + 0.56, 0, 0.09, 0.14, PALETTE.gold, 5);
    }
  }

  function buildMagnet(body, lights) {
    body.prism([[-0.66, 0.55], [-0.66, -0.26], [-0.47, -0.54], [-0.23, -0.65],
      [0.23, -0.65], [0.47, -0.54], [0.66, -0.26], [0.66, 0.55],
      [0.30, 0.55], [0.30, -0.22], [0.14, -0.34], [-0.14, -0.34],
      [-0.30, -0.22], [-0.30, 0.55]], 0.35, 0x177f97);
    lights.prism([[-0.36, 0.30], [-0.36, -0.22], [-0.16, -0.41], [0.16, -0.41],
      [0.36, -0.22], [0.36, 0.30], [0.32, 0.30], [0.32, -0.20],
      [0.145, -0.36], [-0.145, -0.36], [-0.32, -0.20], [-0.32, 0.30]],
    0.012, PALETTE.cyan, 0, 0, 0.183);
    for (let side = -1; side <= 1; side += 2) {
      body.box(side * 0.49, 0.43, 0, 0.37, 0.28, 0.39, PALETTE.ivory);
      lights.box(side * 0.49, 0.605, 0, 0.29, 0.05, 0.28, PALETTE.cyan);
      lights.box(side * 0.49, 0.43, 0.213, 0.27, 0.085, 0.021, PALETTE.cyan);
      for (let slot = 0; slot < 3; slot += 1) {
        body.box(side * 0.49, 0.17 - slot * 0.12, 0.19, 0.33, 0.029, 0.015, PALETTE.titanium);
      }
    }
    body.box(0, -0.52, 0.19, 0.35, 0.13, 0.08, PALETTE.graphite);
    lights.box(0, -0.52, 0.235, 0.18, 0.04, 0.012, PALETTE.cyan);
  }

  function buildDrone(b) {
    // 机身前端为红色盾形传感罩，后端分离双风道，避免一个扁平三角形代替整机。
    // v13：装甲从紫/洋红换成"枪灰 + 锈红"，机翼前缘用警示橙描边——机体不再和星云同色，
    // 而且远距离时那两条橙色前缘就是剪影本身。
    b.hull([[-0.24, -0.97], [0.24, -0.97], [0.43, 0.28], [0.28, 0.85],
      [0, 1.30], [-0.28, 0.85], [-0.43, 0.28]], 0.30, 0.00, PALETTE.graphite);
    b.hull([[-0.19, -0.76], [0.19, -0.76], [0.29, 0.41], [0, 1.14], [-0.29, 0.41]],
      0.21, 0.22, PALETTE.rust);
    b.hull([[-0.12, -0.49], [0.12, -0.49], [0.15, 0.28], [0, 0.67], [-0.15, 0.28]],
      0.15, 0.415, PALETTE.gunmetal);
    b.box(0, 0.185, 1.175, 0.36, 0.14, 0.045, PALETTE.recess);
    for (let side = -1; side <= 1; side += 2) {
      const mirror = (profile) => profile.map(([x, z]) => [side * x, z]);
      b.hull(mirror([[0.27, 0.45], [0.62, 0.57], [1.39, -0.45], [1.31, -0.94],
        [0.70, -0.69], [0.29, -0.50]]), 0.15, -0.06, PALETTE.gunmetal);
      b.hull(mirror([[0.54, 0.41], [0.67, 0.48], [1.29, -0.41], [1.22, -0.66],
        [0.84, -0.47]]), 0.09, 0.065, PALETTE.rust);
      b.hull(mirror([[0.54, 0.44], [0.60, 0.57], [1.38, -0.44], [1.33, -0.54]]),
        0.055, 0.10, PALETTE.hostileGlow);
      b.box(side * 0.58, 0.11, -0.27, 0.10, 0.08, 0.52, PALETTE.titanium, 0, side * 0.20);
      b.ring(side * 0.96, -0.04, -0.49, 0.27, 0.070, PALETTE.titanium);
      b.ring(side * 0.96, -0.04, -0.67, 0.29, 0.063, PALETTE.graphite);
      b.cylinder(side * 0.96, -0.04, -0.79, 0.265, 0.18, PALETTE.rust, Math.PI / 2, 12);
      b.cylinder(side * 0.96, -0.04, -0.495, 0.075, 0.14, PALETTE.recess, Math.PI / 2, 10);
      for (let vane = 0; vane < 5; vane += 1) {
        const angle = vane * Math.PI * 2 / 5;
        b.box(side * 0.96 + Math.cos(angle) * 0.13, -0.04 + Math.sin(angle) * 0.13,
          -0.51, 0.22, 0.035, 0.075, PALETTE.graphite, 0.15, 0, angle + 0.25);
      }
      b.hull(mirror([[0.35, -0.66], [0.49, -1.14], [0.55, -1.09], [0.49, -0.66]]),
        0.28, 0.13, PALETTE.rust);
      for (let vent = 0; vent < 3; vent += 1) {
        b.box(side * 0.21, 0.355, -0.38 + vent * 0.12, 0.075, 0.02, 0.045, PALETTE.titanium);
      }
    }
  }

  function buildTurret(base, head, height) {
    // v13：炮台和无人机共用一套敌意语言（枪灰结构 + 锈红装甲 + 暖橙描边），
    // 玩家不需要分别学习"这个是墙、那个是炮"。
    base.cylinder(0, height * 0.045, 0, 1.18, height * 0.09, PALETTE.graphite, 0, 8);
    base.cylinder(0, height * 0.13, 0, 0.88, height * 0.13, PALETTE.titanium, 0, 8);
    base.box(0, height * 0.33, 0, 1.35, height * 0.37, 1.64, PALETTE.gunmetal);
    base.cylinder(0, height * 0.53, 0, 0.88, height * 0.095, PALETTE.graphite, 0, 16);
    base.cylinder(0, height * 0.58, 0, 0.76, height * 0.045, PALETTE.titanium, 0, 16);
    for (let side = -1; side <= 1; side += 2) {
      base.box(side * 0.83, height * 0.20, 0, 0.29, height * 0.32, 1.76, PALETTE.graphite);
      base.box(side * 0.80, height * 0.12, 0.70, 0.39, height * 0.14, 0.36, PALETTE.rust);
      base.box(side * 0.48, height * 0.34, 0.84, 0.16, height * 0.28, 0.10, PALETTE.titanium);
      for (let slot = 0; slot < 4; slot += 1) {
        base.box(side * 0.39, height * (0.24 + slot * 0.047), 0.90, 0.23, 0.07, 0.06, PALETTE.recess);
      }
    }
    // 炮塔上体以转轴为原点，炮管和观察镜整体随方位角转动。
    head.box(0, height * 0.13, -0.11, 1.83, height * 0.33, 1.93, PALETTE.graphite);
    head.box(0, height * 0.31, -0.13, 1.39, height * 0.12, 1.55, PALETTE.gunmetal);
    head.box(0, height * 0.245, 0.88, 0.63, height * 0.10, 0.15, PALETTE.rust);
    head.box(0, height * 0.26, 0.967, 0.34, 0.16, 0.03, PALETTE.recess);
    for (let side = -1; side <= 1; side += 2) {
      head.box(side * 0.97, height * 0.11, -0.10, 0.31, height * 0.33, 1.92, PALETTE.rust);
      head.box(side * 1.00, height * 0.17, 0.89, 0.13, height * 0.22, 0.09, PALETTE.hostileGlow);
      head.cylinder(side * 0.46, height * 0.07, 1.04, 0.21, 0.94, PALETTE.titanium, Math.PI / 2, 10);
      head.cylinder(side * 0.46, height * 0.07, 1.55, 0.25, 0.27, PALETTE.graphite, Math.PI / 2, 8);
      head.ring(side * 0.46, height * 0.07, 1.69, 0.18, 0.028, PALETTE.rust);
      head.cylinder(side * 0.46, height * 0.07, 1.675, 0.135, 0.016, PALETTE.recess, Math.PI / 2, 10);
      for (let fin = 0; fin < 5; fin += 1) {
        head.box(side * 1.135, height * (0.012 + fin * 0.038), -0.21,
          0.025, 0.045, 1.27, PALETTE.titanium);
      }
      for (let band = 0; band < 3; band += 1) {
        head.box(side * 0.99 + (band - 1) * 0.07, -height * 0.025, 0.97, 0.029, 0.13, 0.03,
          PALETTE.amber, 0, 0, side * 0.3);
      }
    }
  }

  // 三张渐变纹理在初始化阶段生成并登记释放，不引入网络资源或 Canvas 依赖。
  function lightTexture(THREE, own, kind) {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = (x + 0.5) / size * 2 - 1;
        const v = (y + 0.5) / size;
        const dy = v * 2 - 1;
        const radius = Math.hypot(u, dy);
        let alpha;
        if (kind === 'beam') {
          const foot = Math.min(1, v * 14);
          alpha = Math.exp(-u * u * 9) * Math.pow(1 - v, 1.65) * foot;
        } else if (kind === 'ring') {
          const ring = Math.exp(-Math.pow((radius - 0.76) * 22, 2));
          const inner = Math.exp(-radius * radius * 5.0) * 0.24;
          const outer = Math.exp(-Math.pow((radius - 0.76) * 7, 2)) * 0.20;
          alpha = Math.min(1, ring + inner + outer) * Math.max(0, 1 - Math.pow(radius, 12));
        } else {
          const halo = Math.exp(-radius * radius * 5.5) * 0.42;
          const cross = Math.exp(-u * u * 160) * Math.exp(-dy * dy * 6)
            + Math.exp(-dy * dy * 160) * Math.exp(-u * u * 6);
          alpha = Math.min(1, halo + cross * 0.60) * Math.max(0, 1 - Math.pow(radius, 6));
        }
        const offset = (y * size + x) * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
      }
    }
    const texture = own(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function planeBuilder(THREE) {
    return { finish() {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    } };
  }

  // 建模器只在 create 阶段执行；临时零件合并后立即释放。
  function builder(THREE) {
    const parts = [];
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    function add(source, tint, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const geometry = source.index ? source.toNonIndexed() : source;
      if (geometry !== source) source.dispose();
      transform.position.set(x, y, z);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      if (!geometry.getAttribute('color')) {
        color.set(tint);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let offset = 0; offset < colors.length; offset += 3) {
          colors[offset] = color.r;
          colors[offset + 1] = color.g;
          colors[offset + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      parts.push(geometry);
    }
    function box(x, y, z, w, h, d, tint, rx = 0, ry = 0, rz = 0) {
      const edge = Math.min(w, h, d) * 0.12;
      const shape = new THREE.Shape();
      const hw = w / 2 - edge;
      const hh = h / 2 - edge;
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: d - edge * 2, bevelEnabled: true, bevelSize: edge, bevelThickness: edge,
        bevelSegments: 1, steps: 1,
      });
      geometry.translate(0, 0, -d / 2 + edge);
      add(geometry, tint, x, y, z, rx, ry, rz);
    }
    function prism(points, depth, tint, x = 0, y = 0, z = 0) {
      const shape = new THREE.Shape();
      points.forEach(([px, py], index) => { if (!index) shape.moveTo(px, py); else shape.lineTo(px, py); });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -depth / 2);
      add(geometry, tint, x, y, z);
    }
    function hull(points, thickness, y, tint) {
      const shape = new THREE.Shape();
      points.forEach(([x, z], index) => { if (!index) shape.moveTo(x, z); else shape.lineTo(x, z); });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: thickness, bevelEnabled: false, steps: 1,
      });
      geometry.translate(0, 0, -thickness / 2);
      geometry.rotateX(Math.PI / 2);
      add(geometry, tint, 0, y, 0);
    }
    function cylinder(x, y, z, radius, height, tint, rx = 0, segments = 12) {
      add(new THREE.CylinderGeometry(radius, radius, height, segments), tint, x, y, z, rx);
    }
    function ring(x, y, z, radius, tube, tint, rx = 0, ry = 0) {
      add(new THREE.TorusGeometry(radius, tube, 6, 24), tint, x, y, z, rx, ry);
    }
    function rod(from, to, radius, tint) {
      const start = new THREE.Vector3(...from);
      const end = new THREE.Vector3(...to);
      const geometry = new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 5);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), end.sub(start).normalize(),
      ));
      add(geometry, tint, midpoint.x, midpoint.y, midpoint.z);
    }
    function gem(x, y, z, radius, height, tint, sides = 6, rz = 0, profile) {
      const positions = [];
      const colors = [];
      const layers = profile ? profile.map(([level, width]) => [level * height, width * radius])
        : [[-height * 0.5, 0], [-height * 0.18, radius * 0.91],
          [height * 0.24, radius], [height * 0.5, 0]];
      const base = new THREE.Color(tint);
      const facet = new THREE.Color();
      function triangle(a, b, c, factor) {
        positions.push(...a, ...b, ...c);
        facet.copy(base).multiplyScalar(factor);
        for (let vertex = 0; vertex < 3; vertex += 1) colors.push(facet.r, facet.g, facet.b);
      }
      for (let layer = 0; layer < layers.length - 1; layer += 1) {
        for (let face = 0; face < sides; face += 1) {
          const angle = face / sides * Math.PI * 2;
          const next = (face + 1) / sides * Math.PI * 2;
          const low = layers[layer];
          const high = layers[layer + 1];
          const a = [Math.cos(angle) * low[1], low[0], Math.sin(angle) * low[1]];
          const b = [Math.cos(next) * low[1], low[0], Math.sin(next) * low[1]];
          const c = [Math.cos(next) * high[1], high[0], Math.sin(next) * high[1]];
          const d = [Math.cos(angle) * high[1], high[0], Math.sin(angle) * high[1]];
          const factor = 0.65 + ((face * 3 + layer * 2) % 5) * 0.10;
          if (low[1]) triangle(a, d, b, factor);
          if (high[1]) triangle(b, d, c, factor + 0.05);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      add(geometry, tint, x, y, z, 0, 0, rz);
    }
    function finish() {
      const geometry = new THREE.BufferGeometry();
      const count = parts.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
      for (const name of ['position', 'normal', 'color']) {
        const values = new Float32Array(count * 3);
        let offset = 0;
        for (const part of parts) {
          const source = part.getAttribute(name).array;
          values.set(source, offset);
          offset += source.length;
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
      }
      for (const part of parts) part.dispose();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    }
    return { box, prism, hull, cylinder, ring, rod, gem, finish };
  }

  scope.Skyroads = scope.Skyroads || {};
  // palette 一并导出：测试要断言"警示箭头用的就是警示色"，不该把某个十六进制值写死在测试里
  // （v8、v10 两次改色都因此把测试改成了假失败）。
  scope.Skyroads.flightObjects = Object.freeze({ create, palette: PALETTE });
})(globalThis);
