'use strict';

// 轨道站按真实行程依次掠过；模型预先合批，整个背景不产生碰撞体。
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

  const JOURNEY = Object.freeze({ spacing: 1320, firstDepth: 1100, fadeStart: -1400, fadeEnd: -1120, behind: 220 });

  /**
   * 创建四种轮换的轨道站与侧向服务平台。
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
    const materialByKind = createMaterials();
    const variants = [
      { name: 'transfer_ring', build: buildTransferStation },
      { name: 'shipyard', build: buildShipyard },
      { name: 'habitat', build: buildHabitat },
      { name: 'research_dock', build: buildResearchDock },
    ];
    let stationTriangles = 0;
    let maximumStationExtent = 0;
    for (const variant of variants) {
      const builder = createBuilder(THREE);
      variant.build(builder, THREE);
      variant.batches = builder.finish();
      variant.group = new THREE.Group();
      variant.group.name = `orbital_station_${variant.name}`;
      variant.materials = createMaterials();
      variant.triangles = 0;
      variant.index = 0;
      variant.z = 0;
      variant.opacity = 0;
      station.add(variant.group);
      for (const [kind, geometry] of Object.entries(variant.batches)) {
        own(geometry);
        const mesh = new THREE.Mesh(geometry, variant.materials[kind]);
        mesh.name = `${variant.group.name}_${kind}`;
        variant.group.add(mesh);
        variant.triangles += geometry.getAttribute('position').count / 3;
        maximumStationExtent = Math.max(maximumStationExtent,
          Math.abs(geometry.boundingBox.min.z), Math.abs(geometry.boundingBox.max.z));
      }
      stationTriangles += variant.triangles;
    }

    function createMaterials() {
      return {
        solid: own(new THREE.MeshStandardMaterial({
          color: 0xffffff, vertexColors: true, roughness: 0.59, metalness: 0.48,
          emissive: 0x07121b, emissiveIntensity: 0.22, fog: false,
        })),
        glass: own(new THREE.MeshStandardMaterial({
          color: 0xffffff, vertexColors: true, roughness: 0.26, metalness: 0.58,
          emissive: 0x173747, emissiveIntensity: 0.24, fog: false,
        })),
        lights: own(new THREE.MeshBasicMaterial({
          color: 0xffffff, vertexColors: true, toneMapped: false, fog: false,
        })),
      };
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
    let previousTerrain = null;
    const previousBackgroundOffset = new THREE.Vector3(NaN, NaN, NaN);
    let journeyDistance = 0;
    let previousRunId;
    let reducedMotion = false;

    /** 根据行程、地形开关及模式更新远站和平台；第三参数只读，暂停与减弱动态冻结远站。 */
    function update(position = 0, terrainEnabled = false, options = {}) {
      const logicalPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
      const changedRun = options.runId !== undefined && options.runId !== previousRunId;
      previousRunId = options.runId;
      reducedMotion = Boolean(options.reducedMotion);
      if (changedRun || (!reducedMotion && (!options.mode || options.mode === 'PLAYING'))) {
        journeyDistance = logicalPosition * 4;
      }
      const cycle = Math.floor(journeyDistance / JOURNEY.spacing);
      for (let index = 0; index < variants.length; index += 1) {
        const variant = variants[index];
        const offset = ((index - cycle) % variants.length + variants.length) % variants.length;
        variant.index = cycle + offset;
        variant.z = journeyDistance - JOURNEY.firstDepth - variant.index * JOURNEY.spacing;
        const fade = Math.max(0, Math.min(1,
          (variant.z - JOURNEY.fadeStart) / (JOURNEY.fadeEnd - JOURNEY.fadeStart)));
        variant.opacity = fade * fade * (3 - 2 * fade);
        variant.group.visible = variant.z > JOURNEY.fadeStart && variant.z < JOURNEY.behind;
        // 背景层的小幅镜头跟随不应影响站体的真实位置，否则贴近时会横切航道。
        variant.group.position.set(-parent.position.x, -parent.position.y, variant.z - parent.position.z);
        for (const material of Object.values(variant.materials)) {
          material.opacity = variant.opacity;
          const transparent = variant.opacity < 1;
          if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.depthWrite = !transparent;
            material.needsUpdate = true;
          }
        }
      }
      const terrain = scope.Skyroads.flightTerrain;
      const followsTerrain = Boolean(terrainEnabled && terrain && typeof terrain.heightAt === 'function');
      if (terrain === previousTerrain && logicalPosition === previousPosition && followsTerrain === previousTerrainEnabled
        && previousBackgroundOffset.equals(parent.position)) return;
      previousPosition = logicalPosition;
      previousTerrainEnabled = followsTerrain;
      previousTerrain = terrain;
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
          drawCalls: variants.filter((variant) => variant.group.visible).length * 3 + movingBatches.length,
          triangles: variants.filter((variant) => variant.group.visible)
            .reduce((sum, variant) => sum + variant.triangles, platformTriangles * 8),
          stationTriangles,
          stationVariants: variants.map((variant) => ({ name: variant.name, triangles: variant.triangles })),
          visibleStations: variants.filter((variant) => variant.group.visible).map((variant) => ({
            variant: variant.name, index: variant.index, z: variant.z, opacity: variant.opacity,
          })),
          journeyDistance,
          stationSpacing: JOURNEY.spacing,
          maximumStationExtent,
          tracksideInstances: 8,
          tracksideTriangles: platformTriangles,
          clearInnerRadius: 64,
          clearCorridor: { halfWidth: 24, minimumY: -25, maximumY: 52 },
          autonomousAnimation: false,
          followsTrackPosition: true,
          reducedMotion,
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

  function buildTransferStation(b, THREE) {
    // 放大后的承压环留出完整的高架与超级跳跃净空，环心不随玩家横移。
    buildTransferRing(b, new THREE.Vector3(0, 0, 0));
    b.transform(1.5, [0, 14, 0]);
    buildRadiator(b, -101, 32, -4, 26, 31);
    b.beam([-85, 32, -4], [-101, 32, -4], 1.1, PALETTE.copper);
  }

  function buildShipyard(b) {
    const C = PALETTE;
    // 双侧龙门沿纵向伸展，开放的维修坞朝向来船，顶部吊桥远高于全部航道。
    for (const side of [-1, 1]) {
      const x = side * 59;
      for (const dx of [-8, 8]) for (const dz of [-28, 26]) {
        b.beam([x + dx, -29, dz], [x + dx, 77, dz], 1.1, C.frame);
      }
      for (let level = 0; level < 5; level += 1) {
        const y = -24 + level * 24;
        for (const dz of [-28, 26]) {
          b.beam([x - 8, y, dz], [x + 8, y, dz], 0.8, C.edge);
          if (level < 4) b.beam([x - 8, y, dz], [x + 8, y + 24, dz], 0.65, C.copper);
        }
        buildPressurizedDeck(b, [x, y, 0], [23, 12, 39], level % 2 ? C.ceramic : C.armor);
      }
      for (const y of [-13, 34]) {
        b.box([x + side * 7, y, -40], [10, 10, 43], C.armor, [0, 0, 0], 0.7);
        for (const dx of [-7, 7]) {
          b.box([x + dx, y - 3.5, 43], [4.2, 7.2, 40], C.ceramic, [0, 0, 0], 0.5);
          b.box([x + dx, y - 3.1, 63.5], [1.4, 2.8, 0.25], C.warm, [0, 0, 0], 0, 'lights');
        }
      }
      buildRadiator(b, x + side * 29, 28, -11, 24, 55);
      b.beam([x, 28, -11], [x + side * 29, 28, -11], 1.0, C.copper);
      b.beam([x, 77, 0], [x, 100, 0], 0.5, C.edge);
      b.box([x, 102, 0], [8, 4, 5], C.armor, [0, 0, 0], 0.3);
    }
    b.box([0, 78, -10], [122, 9, 18], C.frame, [0, 0, 0], 0.6);
    b.box([0, 82, -10], [105, 3.4, 22], C.ceramic, [0, 0, 0], 0.4);
    for (let x = -45; x <= 45; x += 15) {
      b.box([x, 78, -0.8], [10, 2.8, 0.3], C.glass, [0, 0, 0], 0, 'glass');
      b.beam([x - 7, 74, 1], [x + 7, 82, 1], 0.5, C.copper);
    }
    b.box([0, 92, -10], [26, 12, 24], C.armor, [0, 0, 0], 0.8);
    b.box([0, 94, 2.2], [18, 4, 0.4], C.glass, [0, 0, 0], 0, 'glass');
  }

  function buildHabitat(b) {
    const C = PALETTE;
    // 双滚筒居住站具有完整厚度与分段窗带，中央通道由高低两条桥连接。
    for (const side of [-1, 1]) {
      const x = side * 89;
      const y = 13;
      for (const z of [-23, 23]) {
        b.torus(33.5, 1.2, [x, y, z], C.edge, 48);
        b.torus(26.3, 1.0, [x, y, z + 1], C.frame, 48);
        for (let sector = 0; sector < 12; sector += 1) {
          const a = sector / 12 * Math.PI * 2;
          const e = a + Math.PI / 6;
          b.arc(28.0, 35.4, 5.0, a + 0.035, e - 0.035,
            [x, y, z], sector % 3 ? C.armor : C.ceramic);
          const mid = (a + e) / 2;
          b.box([x + Math.cos(mid) * 31.2, y + Math.sin(mid) * 31.2, z + 2.7],
            [8, 1.7, 0.22], C.glass, [0, 0, mid + Math.PI / 2], 0, 'glass');
          if (z < 0) {
            b.beam([x + Math.cos(a) * 33.5, y + Math.sin(a) * 33.5, -23],
              [x + Math.cos(a) * 33.5, y + Math.sin(a) * 33.5, 23], 0.6, C.frame);
          }
        }
      }
      b.cylinder([x, y, 0], 9.7, 67, C.ceramic, [Math.PI / 2, 0, 0]);
      b.cylinder([x, y, 34], 6.7, 2.8, C.armor, [Math.PI / 2, 0, 0]);
      b.torus(7.0, 0.6, [x, y, 35.5], C.copper, 24);
      for (const z of [-24, 24]) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        b.beam([x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, z],
          [x + Math.cos(angle) * 27, y + Math.sin(angle) * 27, z], 1.0, C.frame);
      }
      b.beam([x, 45, -3], [x, 77, -3], 2.0, C.frame);
      b.beam([x, -20, -3], [x, -52, -3], 1.4, C.frame);
      buildRadiator(b, x + side * 52, 13, -13, 21, 60);
      b.beam([x + side * 32, 13, -13], [x + side * 52, 13, -13], 1.0, C.copper);
    }
    buildPressurizedDeck(b, [0, 79, -3], [186, 9, 16], C.ceramic);
    b.beam([-89, -52, -3], [89, -52, -3], 1.8, C.frame);
    buildPressurizedDeck(b, [0, 88, -3], [26, 14, 22], C.armor);
    for (const x of [-46, 0, 46]) b.box([x, -52, 1], [7, 1.0, 0.35], C.warm, [0, 0, 0], 0, 'lights');
  }

  function buildResearchDock(b) {
    const C = PALETTE;
    // 非对称深空观测站：左侧多级望远镜，右侧梳形泊位和分片阵列。
    const x = -70;
    for (const dx of [-11, 11]) for (const dz of [-18, 18]) {
      b.beam([x + dx, -28, dz], [x + dx, 77, dz], 0.95, C.frame);
    }
    for (const y of [-23, 12, 53]) {
      buildPressurizedDeck(b, [x, y, 0], [29, 13, 39], C.armor);
      for (const dz of [-18, 18]) b.beam([x - 11, y, dz], [x + 11, y + 24, dz], 0.7, C.copper);
    }
    b.cylinder([x - 5, 29, 0], 18, 66, C.frame, [Math.PI / 2, 0, 0]);
    for (const z of [-32, -21, 20, 33]) b.torus(18.4, 1.0, [x - 5, 29, z], C.ceramic, 40);
    b.cylinder([x - 5, 29, 35], 14.0, 1.2, C.shadow, [Math.PI / 2, 0, 0]);
    b.cylinder([x - 5, 29, 35.7], 11.9, 0.3, C.glass, [Math.PI / 2, 0, 0], 'glass');
    b.torus(12.2, 0.5, [x - 5, 29, 36], C.copper, 32);
    for (const side of [-1, 1]) {
      b.beam([x - 5 + side * 12, 29, 36], [x - 5, 29, 53], 0.45, C.frame);
    }
    b.box([x - 5, 29, 53], [3.6, 3.6, 3.2], C.ceramic, [0, 0, 0], 0.3);
    buildRadiator(b, -116, 27, -7, 25, 77);
    b.beam([-91, 27, -7], [-116, 27, -7], 1.0, C.copper);
    b.box([58, 18, -10], [20, 99, 20], C.frame, [0, 0, 0], 1.1);
    for (const y of [-20, 4, 28, 52]) {
      buildPressurizedDeck(b, [62, y, -7], [30, 11, 24], y === 28 ? C.ceramic : C.armor);
      b.beam([69, y, -7], [108, y, -7], 1.25, C.edge);
      b.box([111, y + 3, -8], [22, 7, 38], C.armor, [0, 0, 0], 0.5);
      for (const dx of [-7, 7]) b.box([111 + dx, y + 3, 18], [4.0, 7, 17], C.ceramic, [0, 0, 0], 0.3);
    }
    b.beam([-70, 77, -10], [58, 77, -10], 2.0, C.frame);
    buildPressurizedDeck(b, [-7, 79, -10], [74, 8, 13], C.ceramic);
    for (let index = 0; index < 6; index += 1) {
      const ax = 36 + index * 11;
      const top = 100 + (index % 2) * 13;
      b.beam([ax, 80, -10], [ax, top, -10], 0.45, C.edge);
      b.box([ax, top, -10], [8, 3.5, 2.5], C.armor, [0, 0, 0], 0.2);
    }
  }

  function buildPressurizedDeck(b, position, size, color) {
    const C = PALETTE;
    const [x, y, z] = position;
    const [width, height, depth] = size;
    b.box(position, size, C.shadow, [0, 0, 0], 0.8);
    b.box([x, y + height * 0.12, z], [width + 1.4, height * 0.68, depth - 2], color, [0, 0, 0], 0.6);
    b.box([x, y + height * 0.5, z], [width + 2.2, 1.2, depth + 1.6], C.ceramic, [0, 0, 0], 0.3);
    b.box([x, y + 0.5, z + depth / 2 + 0.2], [width * 0.73, height * 0.22, 0.35], C.glass,
      [0, 0, 0], 0, 'glass');
    const divisions = Math.max(2, Math.floor(width / 7));
    for (let index = 1; index < divisions; index += 1) {
      b.box([x - width * 0.365 + width * 0.73 * index / divisions, y + 0.5, z + depth / 2 + 0.5],
        [0.6, height * 0.29, 0.25], C.frame);
    }
    b.box([x - width * 0.32, y - height * 0.26, z + depth / 2 + 0.2],
      [Math.min(3.2, width * 0.12), 0.55, 0.25], C.warm, [0, 0, 0], 0, 'lights');
  }

  function buildRadiator(b, x, y, z, width, height) {
    const C = PALETTE;
    b.box([x, y, z], [width, height, 1.5], C.shadow);
    b.box([x, y, z + 0.9], [width - 2, height - 2, 0.35], C.radiator);
    for (let index = 0; index < Math.floor(width / 3); index += 1) {
      b.box([x - width / 2 + 1.5 + index * 3, y, z + 1.2], [0.32, height - 2, 0.22], C.edge);
    }
    for (const offset of [-height / 2 + 0.8, 0, height / 2 - 0.8]) {
      b.box([x, y + offset, z + 1.5], [width, 0.65, 0.4], C.frame);
    }
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

    function cylinder(position, radius, height, color, rotation = [0, 0, 0], kind = 'solid') {
      add(new THREE.CylinderGeometry(radius, radius, height, 12), color, position, rotation, kind);
    }

    function transformParts(scale, translation) {
      for (const list of Object.values(parts)) for (const geometry of list) {
        geometry.scale(scale, scale, scale);
        geometry.translate(...translation);
      }
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

    return { box, beam, torus, arc, cylinder, plate, prism, finish, transform: transformParts };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightEnvironment = Object.freeze({ create, JOURNEY });
})(globalThis);
