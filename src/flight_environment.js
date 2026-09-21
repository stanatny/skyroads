'use strict';

// 轨道枢纽是静态背景，建模时合并部件，运行时不增加逐帧对象或碰撞体。
(function attachFlightEnvironment(scope) {
  const PALETTE = Object.freeze({
    frame: 0x34485d,
    edge: 0xa8b8c3,
    ceramic: 0xc6cec9,
    armor: 0x33598d,
    shadow: 0x172b40,
    joint: 0x344c5a,
    copper: 0x9e815a,
    radiator: 0x334e64,
    glass: 0x235b72,
    cyan: 0x70b7c6,
    warm: 0xcdb27b,
  });

  /**
   * 创建分层转运环与侧向服务站。
   * 参数为 Three.js、背景父节点、共享材质表及资源登记器。
   * 返回模型根节点、随行程更新的 update 接口与诊断接口；own 登记器负责释放资源。
   */
  function create({ THREE, parent, materials, own }) {
    if (!THREE || !parent || typeof own !== 'function') {
      throw new Error('Flight environment requires Three.js, a parent, and a resource owner');
    }
    const station = new THREE.Group();
    station.name = 'aurelia_orbital_interchange';
    parent.add(station);
    const opaque = own(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.59, metalness: 0.48,
      emissive: 0x07121b, emissiveIntensity: 0.22, fog: false,
    }));
    const glazing = own(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.26, metalness: 0.58,
      emissive: 0x173747, emissiveIntensity: 0.24, fog: false,
    }));
    const lamps = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, toneMapped: false, fog: false,
    }));
    const builder = createBuilder(THREE);
    const center = new THREE.Vector3(-8, 23, -365);
    buildTransferRing(builder, center);
    buildServiceSpine(builder);
    buildCounterweight(builder);

    const batches = builder.finish();
    const counts = {};
    const materialByKind = { solid: opaque, glass: glazing, lights: lamps };
    for (const [kind, geometry] of Object.entries(batches)) {
      own(geometry);
      const mesh = new THREE.Mesh(geometry, materialByKind[kind]);
      mesh.name = `orbital_interchange_${kind}`;
      station.add(mesh);
      counts[kind] = geometry.getAttribute('position').count / 3;
    }

    // 航道外的服务平台提供近景视差；位置来自真实行程，暂停时自然冻结。
    const serviceBuilder = createBuilder(THREE);
    buildTracksidePlatform(serviceBuilder);
    const serviceGeometry = serviceBuilder.finish();
    const platformHalfDepth = Math.max(...Object.values(serviceGeometry).map((geometry) =>
      Math.max(Math.abs(geometry.boundingBox.min.z), Math.abs(geometry.boundingBox.max.z))));
    const movingBatches = [];
    let platformTriangles = 0;
    for (const [kind, geometry] of Object.entries(serviceGeometry)) {
      own(geometry);
      const instances = own(new THREE.InstancedMesh(geometry, materialByKind[kind], 8));
      instances.name = `orbital_service_platforms_${kind}`;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instances.frustumCulled = false;
      station.add(instances);
      movingBatches.push(instances);
      platformTriangles += geometry.getAttribute('position').count / 3;
    }
    const transform = new THREE.Object3D();
    const distanceColor = new THREE.Color();
    let previousPosition = null;
    let previousTerrainEnabled = null;
    const previousBackgroundOffset = new THREE.Vector3(NaN, NaN, NaN);

    /** 根据行程和地形开关更新两侧平台，不修改游戏状态。 */
    function update(position = 0, terrainEnabled = false) {
      const logicalPosition = Number.isFinite(position) ? position : 0;
      const terrain = scope.Skyroads.flightTerrain;
      const followsTerrain = Boolean(terrainEnabled && terrain && typeof terrain.heightAt === 'function');
      if (logicalPosition === previousPosition && followsTerrain === previousTerrainEnabled
        && previousBackgroundOffset.equals(parent.position)) return;
      previousPosition = logicalPosition;
      previousTerrainEnabled = followsTerrain;
      previousBackgroundOffset.copy(parent.position);
      const distance = logicalPosition * 4;
      const phase = ((distance % 90) + 90) % 90;
      let instance = 0;
      for (let index = 0; index < 4; index += 1) {
        for (const side of [-1, 1]) {
          // 交错泊位打破镜像重复；最内侧装甲与航道边缘仍有六米以上间距。
          const z = -44 - index * 90 + phase - (side > 0 ? 36 : 0);
          let groundY = 0;
          if (followsTerrain) {
            const segment = logicalPosition - z / 4;
            const lane = side < 0 ? 0 : 6;
            const near = segment - platformHalfDepth / 4;
            const far = segment + platformHalfDepth / 4;
            // 整个平台取跨度内最低路面，跨坡或断层时悬臂仍保持在道路下方。
            let minimumHeight = Math.min(terrain.heightAt(near, lane), terrain.heightAt(far, lane));
            for (let boundary = Math.ceil(near); boundary < far; boundary += 1) {
              minimumHeight = Math.min(minimumHeight, terrain.heightAt(boundary, lane));
            }
            groundY = minimumHeight / 300;
          }
          // 远景随视角微移，连接轨道的近景必须抵消这层偏移，保持真实世界位置。
          transform.position.set(side * 27 - parent.position.x, groundY - 1.5 - parent.position.y, z - parent.position.z);
          transform.rotation.set(0, side < 0 ? Math.PI : 0, 0);
          transform.updateMatrix();
          const depth = Math.max(0, Math.min(1, -z / 380));
          distanceColor.setRGB(1 - depth * 0.55, 1 - depth * 0.49, 1 - depth * 0.42);
          for (const mesh of movingBatches) {
            mesh.setMatrixAt(instance, transform.matrix);
            mesh.setColorAt(instance, distanceColor);
          }
          instance += 1;
        }
      }
      for (const mesh of movingBatches) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
    update();

    return {
      object: station,
      update,
      getDiagnostics() {
        return {
          name: station.name,
          drawCalls: Object.keys(batches).length + movingBatches.length,
          triangles: Object.values(counts).reduce((sum, value) => sum + value, 0) + platformTriangles * 8,
          triangleBatches: { ...counts },
          tracksideInstances: 8,
          tracksideTriangles: platformTriangles,
          ringCenter: center.toArray(),
          clearInnerRadius: 43,
          autonomousAnimation: false,
          followsTrackPosition: true,
          followsTerrain: previousTerrainEnabled,
        };
      },
    };
  }

  function buildTransferRing(b, center) {
    const C = PALETTE;
    const point = (radius, angle, z = 0) => [
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
      center.z + z,
    ];

    // 双轴承环与内侧航行净空：没有横跨中央航道的轮辐或发光平面。
    b.torus(45.5, 1.15, center.toArray(), C.edge);
    b.torus(53.0, 1.45, [center.x, center.y, center.z - 9], C.frame);
    b.torus(53.0, 0.70, [center.x, center.y, center.z + 7], C.edge);
    b.torus(48.0, 0.58, [center.x, center.y, center.z - 11], C.joint);

    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      const next = angle + Math.PI * 2 / 16;
      const mid = angle + Math.PI / 16;
      // 外层护甲分段留缝，厚度与下方桁架共同形成真实的轴向体量。
      b.arc(49.2, 56.2, 6.2, angle + 0.025, next - 0.025,
        [center.x, center.y, center.z + 4.5], index % 4 === 0 ? C.ceramic : C.armor);
      b.arc(50.5, 55.0, 4.4, angle + 0.055, next - 0.055,
        [center.x, center.y, center.z - 10], C.frame);
      b.beam(point(45.5, angle, 0), point(53, angle, 7), 0.70, C.edge);
      b.beam(point(45.5, angle, 0), point(53, angle, -9), 0.72, C.frame);
      b.beam(point(53, angle, 7), point(53, next, -9), 0.44, C.copper);
      b.beam(point(53, angle, -9), point(53, next, 7), 0.44, C.frame);
      b.beam(point(53, angle, 7), point(53, angle, -9), 0.74, C.edge);

      const face = point(52.5, mid, 8.0);
      b.box(face, [8.2, 3.0, 1.1], C.shadow, [0, 0, mid + Math.PI / 2], 0.20);
      b.box([face[0], face[1], face[2] + 0.59], [6.3, 1.05, 0.16], C.glass,
        [0, 0, mid + Math.PI / 2], 0, 'glass');
      if (index % 2 === 0) {
        const beacon = point(46.2, angle + 0.06, 1.15);
        b.box(beacon, [1.4, 0.42, 0.25], index % 4 === 0 ? C.warm : C.cyan,
          [0, 0, angle + Math.PI / 2], 0, 'lights');
      }
    }

    // 四个独立服务舱围绕环外缘，端盖、颈部、装甲和观察窗均保留几何厚度。
    for (const angle of [0.56, 2.42, 3.68, 5.45]) {
      const origin = point(58.5, angle, -2.5);
      b.box(origin, [13.2, 9.4, 17.5], C.shadow, [0, 0, angle], 0.8);
      b.box([origin[0], origin[1], origin[2] + 2.0], [14.6, 8.0, 12.2], C.ceramic,
        [0, 0, angle], 0.75);
      b.box([origin[0], origin[1], origin[2] + 8.6], [11.1, 5.8, 1.9], C.armor,
        [0, 0, angle], 0.35);
      b.box([origin[0], origin[1], origin[2] + 9.6], [7.2, 2.3, 0.20], C.glass,
        [0, 0, angle], 0, 'glass');
      for (const sign of [-1, 1]) {
        const dx = Math.cos(angle) * 5.3 * sign;
        const dy = Math.sin(angle) * 5.3 * sign;
        b.box([origin[0] + dx, origin[1] + dy, origin[2] + 9.65], [0.55, 2.0, 0.22], C.warm,
          [0, 0, angle], 0, 'lights');
      }
    }

    // 顶部通讯阵列采用离散天线和小型传感器，避免再叠一整圈霓虹。
    b.box([center.x - 7, center.y + 61.3, center.z - 4], [17, 8, 14], C.frame, [0, 0, 0], 0.5);
    b.box([center.x - 7, center.y + 67, center.z - 4], [11, 3, 10], C.ceramic, [0, 0, 0], 0.35);
    for (const offset of [-10, -3, 4]) {
      const height = offset === -3 ? 13 : 8;
      b.beam([center.x + offset, center.y + 68, center.z - 4],
        [center.x + offset, center.y + 68 + height, center.z - 4], 0.35, C.edge);
      b.box([center.x + offset, center.y + 69 + height, center.z - 4], [2.8, 2.3, 1.5], C.armor);
    }
  }

  function buildServiceSpine(b) {
    const C = PALETTE;
    const x = -89;
    const z = -283;
    // 左侧站体是开放的箱形桁架，连接舱室而不是一根没有用途的实心柱。
    for (const dx of [-5.4, 5.4]) {
      for (const dz of [-7.3, 7.3]) {
        b.beam([x + dx, -45, z + dz], [x + dx, 74, z + dz], 1.0, C.frame);
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const y = -45 + index * 17;
      for (const dz of [-7.3, 7.3]) {
        b.beam([x - 5.4, y, z + dz], [x + 5.4, y, z + dz], 0.78, C.edge);
        if (index < 7) {
          b.beam([x - 5.4, y, z + dz], [x + 5.4, y + 17, z + dz], 0.51, C.frame);
          b.beam([x + 5.4, y, z + dz], [x - 5.4, y + 17, z + dz], 0.51, C.frame);
        }
      }
      for (const dx of [-5.4, 5.4]) {
        b.beam([x + dx, y, z - 7.3], [x + dx, y, z + 7.3], 0.8, C.edge);
      }
    }

    const decks = [
      { y: -33, dx: -4, width: 22, height: 12, depth: 25 },
      { y: 3, dx: -7, width: 27, height: 15, depth: 29 },
      { y: 40, dx: -1, width: 24, height: 16, depth: 28 },
      { y: 73, dx: -7, width: 20, height: 9, depth: 24 },
    ];
    for (const deck of decks) {
      const dx = x + deck.dx;
      b.box([dx, deck.y, z], [deck.width, deck.height, deck.depth], C.shadow, [0, 0, 0], 1.2);
      b.box([dx, deck.y + deck.height * 0.19, z + 1],
        [deck.width + 2, deck.height * 0.63, deck.depth - 3], C.armor, [0, 0, 0], 0.9);
      b.box([dx, deck.y + deck.height * 0.50, z],
        [deck.width + 3, 1.7, deck.depth + 2], C.ceramic, [0, 0, 0], 0.3);
      const front = z + deck.depth / 2 + 0.18;
      b.box([dx, deck.y + 1.0, front], [deck.width * 0.73, 3.3, 0.4], C.glass, [0, 0, 0], 0, 'glass');
      for (let divider = -2; divider <= 2; divider += 1) {
        b.box([dx + divider * deck.width * 0.15, deck.y + 1.0, front + 0.35],
          [0.68, 4.0, 0.36], C.edge);
      }
      b.box([dx - deck.width * 0.36, deck.y - deck.height * 0.25, front + 0.12],
        [2.6, 0.55, 0.2], C.warm, [0, 0, 0], 0, 'lights');
      for (let vent = 0; vent < 4; vent += 1) {
        b.box([dx + deck.width * 0.30, deck.y - 3.1 + vent * 1.3, front + 0.22],
          [3.7, 0.55, 0.42], C.joint);
      }
    }

    // 双层承力臂连接转运环，全部留在航道左侧；斜向撑杆解释悬臂载荷。
    const bridgeStart = [-81, 33, -295];
    const bridgeEnd = [-56, 26, -350];
    for (const sign of [-1, 1]) {
      const a = [bridgeStart[0] + sign * 3, bridgeStart[1], bridgeStart[2]];
      const e = [bridgeEnd[0] + sign * 3, bridgeEnd[1], bridgeEnd[2]];
      b.beam(a, e, 1.4, C.armor);
      b.beam([a[0], a[1] - 7, a[2]], [e[0], e[1] - 7, e[2]], 0.85, C.frame);
      for (let index = 0; index < 5; index += 1) {
        const t0 = index / 5;
        const t1 = (index + 1) / 5;
        b.beam(interpolate(a, e, t0), interpolate([a[0], a[1] - 7, a[2]],
          [e[0], e[1] - 7, e[2]], t1), 0.50, C.edge);
      }
    }

    // 向外伸展的散热翼包含窄边框、脊梁和分片，色彩保持低饱和。
    for (const y of [-12, 48]) {
      b.beam([-99, y, z - 2], [-128, y, z - 2], 1.15, C.copper);
      b.beam([-99, y - 8, z], [-123, y, z - 2], 0.7, C.frame);
      b.box([-136, y, z - 3], [29, 20, 1.3], C.shadow);
      b.box([-136, y, z - 2.24], [27, 18.4, 0.16], C.radiator);
      for (let line = 0; line < 9; line += 1) {
        b.box([-148.5 + line * 3.1, y, z - 1.99], [0.27, 18.4, 0.2], C.edge);
      }
      for (const offset of [-9.7, 0, 9.7]) {
        b.box([-136, y + offset, z - 1.95], [29, 0.36, 0.3], C.frame);
      }
    }

    // 下方泊位朝向观察者，夹爪之间留空；尺寸明显区别于转运环。
    const dock = [-72, -19, -245];
    b.beam([-86, -13, -277], dock, 2.4, C.frame);
    b.box(dock, [16, 11, 11], C.armor, [0, -0.15, 0], 0.8);
    for (const sign of [-1, 1]) {
      b.box([dock[0] + sign * 7.1, dock[1], dock[2] + 10], [3.1, 9, 19], C.ceramic,
        [0, sign * -0.07, 0], 0.45);
      b.box([dock[0] + sign * 7.1, dock[1], dock[2] + 19.6], [1.0, 3.4, 0.35], C.warm,
        [0, 0, 0], 0, 'lights');
    }
  }

  function buildCounterweight(b) {
    const C = PALETTE;
    // 右侧仅保留低位配重和两只气罐，行星正面及上方轮廓保持开放。
    b.beam([36, -13, -357], [67, -19, -327], 1.15, C.frame);
    b.beam([38, -20, -363], [67, -26, -327], 0.75, C.edge);
    for (let index = 0; index < 4; index += 1) {
      const t = index / 4;
      b.beam(interpolate([36, -13, -357], [67, -19, -327], t),
        interpolate([38, -20, -363], [67, -26, -327], (index + 1) / 4), 0.46, C.copper);
    }
    b.box([73, -22, -326], [19, 13, 19], C.joint, [0, -0.18, 0], 0.65);
    b.box([73, -17, -326], [22, 3.0, 22], C.armor, [0, -0.18, 0], 0.4);
    for (const dx of [-4.8, 4.8]) {
      b.cylinder([73 + dx, -23, -311], 3.1, 16, C.ceramic, [Math.PI / 2, 0, 0]);
      for (const dz of [-6, 5]) {
        b.torus(3.2, 0.45, [73 + dx, -23, -311 + dz], C.frame, 12);
      }
      b.cylinder([73 + dx, -23, -302.4], 2.15, 0.9, C.frame, [Math.PI / 2, 0, 0]);
    }
    b.box([73, -14.9, -314], [4.8, 0.55, 0.3], C.cyan, [0, 0, 0], 0, 'lights');
  }

  function buildTracksidePlatform(b) {
    const C = PALETTE;
    // 近景泊位有清楚的悬空承力关系，所有部件都位于跑道外而非充当无碰撞障碍。
    const deckOutline = [
      [-4.7, -9], [4.7, -9], [6.25, -7.25], [6.25, 5.55],
      [3.8, 9], [-4.4, 9], [-6.25, 7.05], [-6.25, -7.4],
    ];
    b.plate(deckOutline, -3.7, 1.25, C.frame);
    b.plate(deckOutline.map(([x, z]) => [x * 0.945, z * 0.955]), -2.35, 0.35, C.armor);
    b.plate(deckOutline.map(([x, z]) => [x * 0.84, z * 0.88]), -2.00, 0.12, C.shadow);
    for (const side of [-1, 1]) {
      b.beam([side * 5.2, -3.7, -7.5], [side * 5.2, -8.0, 0], 0.48, C.edge);
      b.beam([side * 5.2, -8.0, 0], [side * 5.2, -3.7, 7.5], 0.48, C.frame);
      b.beam([side * 5.2, -8.0, 0], [side * 5.2, -3.7, 0], 0.36, C.copper);
      b.box([side * 5.65, -1.72, -0.85], [0.48, 0.8, 13.7], C.ceramic);
      for (const dz of [-6.8, 6.8]) {
        b.box([side * 5.68, -1.25, dz], [0.22, 0.10, 1.3], C.warm, [0, 0, 0], 0, 'lights');
      }
    }
    b.beam([-5.2, -8, 0], [5.2, -8, 0], 0.52, C.frame);
    b.beam([-5.2, -3.7, 0], [5.2, -8, 0], 0.40, C.joint);
    for (const dz of [-5.1, 5.1]) {
      // 悬臂从道路外缘下方承接平台；最高连接垫仍低于路面，不形成隐形障碍。
      b.beam([-14.8, -1.8, dz], [-5.2, -3.7, dz], 0.46, C.frame);
      b.beam([-14.8, -1.8, dz], [-5.2, -8.0, dz], 0.40, C.edge);
      b.beam([-14.8, -1.8, dz], [-14.8, 0.36, dz], 0.45, C.joint);
      b.box([-14.8, 0.48, dz], [1.25, 0.36, 1.7], C.frame, [0, 0, 0], 0.10);
      b.box([-5.0, -2.10, dz], [2.2, 0.16, 0.85], C.copper);
    }

    // 成组承压储罐和维修单元提供不同轮廓；装饰灯只嵌在真实器件上。
    for (const x of [-2.4, 2.0]) {
      b.cylinder([x, -0.28, -1.8], 1.45, 8.8, C.armor, [Math.PI / 2, 0, 0]);
      for (const dz of [-4.9, 1.3]) {
        b.torus(1.49, 0.19, [x, -0.28, dz], C.edge, 12);
      }
      b.cylinder([x, -0.28, 2.85], 1.02, 0.36, C.joint, [Math.PI / 2, 0, 0]);
      b.box([x, -1.60, -1.8], [3.3, 0.42, 9.5], C.shadow);
    }
    b.prism([[3.6, -2.0], [7.5, -2.0], [7.5, -0.65], [6.65, 0.95], [3.8, 0.95]],
      7.4, C.armor);
    b.box([0, 1.02, 4.9], [6.9, 0.23, 2.5], C.ceramic, [0, 0, 0], 0.07);
    b.box([0.0, 0.15, 7.12], [5.9, 0.98, 0.10], C.glass, [-0.488, 0, 0], 0, 'glass');
    for (const x of [-1.6, 0, 1.6]) {
      b.box([x, 0.15, 7.21], [0.18, 1.08, 0.10], C.frame, [-0.488, 0, 0]);
    }
    b.box([-2.35, -1.27, 7.53], [0.85, 0.19, 0.10], C.cyan, [0, 0, 0], 0, 'lights');
    b.box([3.35, 0.17, 5.8], [0.34, 1.5, 2.0], C.copper);
    for (let fin = 0; fin < 4; fin += 1) {
      b.box([3.61, -0.25 + fin * 0.32, 5.8], [0.23, 0.13, 2.2], C.frame);
    }
    b.beam([-2.4, 1.22, 0.9], [-2.4, 1.22, 3.7], 0.14, C.copper);
    b.beam([2.0, 1.22, 0.9], [2.0, 1.22, 3.7], 0.14, C.copper);
  }

  function interpolate(from, to, progress) {
    return from.map((value, index) => value + (to[index] - value) * progress);
  }

  function createBuilder(THREE) {
    const parts = { solid: [], glass: [], lights: [] };
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();

    function add(source, color, position, rotation = [0, 0, 0], kind = 'solid') {
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      source.dispose();
      transform.position.set(...position);
      transform.rotation.set(...rotation);
      transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      tint.set(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let index = 0; index < colors.length; index += 3) {
        colors[index] = tint.r;
        colors[index + 1] = tint.g;
        colors[index + 2] = tint.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts[kind].push(geometry);
    }

    function box(position, size, color, rotation = [0, 0, 0], bevel = 0, kind = 'solid') {
      const [width, height, depth] = size;
      if (!bevel) {
        add(new THREE.BoxGeometry(width, height, depth), color, position, rotation, kind);
        return;
      }
      const edge = Math.min(bevel, width / 6, height / 6, depth / 6);
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2 + edge, -height / 2 + edge);
      shape.lineTo(width / 2 - edge, -height / 2 + edge);
      shape.lineTo(width / 2 - edge, height / 2 - edge);
      shape.lineTo(-width / 2 + edge, height / 2 - edge);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth - edge * 2, bevelEnabled: true, bevelSize: edge,
        bevelThickness: edge, bevelSegments: 1, steps: 1,
      });
      geometry.translate(0, 0, -depth / 2 + edge);
      add(geometry, color, position, rotation, kind);
    }

    function arc(inner, outer, depth, start, end, position, color) {
      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(start) * outer, Math.sin(start) * outer);
      shape.absarc(0, 0, outer, start, end, false);
      shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
      shape.absarc(0, 0, inner, end, start, true);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: false, curveSegments: 4, steps: 1,
      });
      geometry.translate(0, 0, -depth / 2);
      add(geometry, color, position);
    }

    function plate(outline, baseY, height, color) {
      const shape = new THREE.Shape();
      outline.forEach(([x, z], index) => {
        if (index === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
      geometry.rotateX(-Math.PI / 2);
      add(geometry, color, [0, baseY, 0]);
    }

    function prism(profile, width, color) {
      const shape = new THREE.Shape();
      profile.forEach(([z, y], index) => {
        if (index === 0) shape.moveTo(-z, y);
        else shape.lineTo(-z, y);
      });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -width / 2);
      geometry.rotateY(Math.PI / 2);
      add(geometry, color, [0, 0, 0]);
    }

    function beam(from, to, radius, color) {
      const a = new THREE.Vector3(...from);
      const e = new THREE.Vector3(...to);
      const length = a.distanceTo(e);
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.clone().sub(a).normalize());
      geometry.applyQuaternion(rotation);
      add(geometry, color, a.add(e).multiplyScalar(0.5).toArray());
    }

    function torus(radius, tube, position, color, segments = 64) {
      add(new THREE.TorusGeometry(radius, tube, 6, segments), color, position);
    }

    function cylinder(position, radius, height, color, rotation = [0, 0, 0]) {
      add(new THREE.CylinderGeometry(radius, radius, height, 12), color, position, rotation);
    }

    function finish() {
      const result = {};
      for (const [kind, list] of Object.entries(parts)) {
        const total = list.reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0);
        const geometry = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'color']) {
          const values = new Float32Array(total * 3);
          let offset = 0;
          for (const part of list) {
            const data = part.getAttribute(name).array;
            values.set(data, offset);
            offset += data.length;
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        for (const part of list) part.dispose();
        result[kind] = geometry;
      }
      return result;
    }

    return { box, beam, torus, arc, cylinder, plate, prism, finish };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightEnvironment = Object.freeze({ create });
})(globalThis);
