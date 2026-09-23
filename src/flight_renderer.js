'use strict';

// 追尾视角实时渲染只读取游戏状态；碰撞、输入和计时仍由原游戏循环负责。
(function registerFlightRenderer(scope) {
  const WORLD = Object.freeze({
    laneWidth: 3.4,
    segmentDepth: 4,
    heightScale: 1 / 300,
    eyeHeight: 6.4,
    cameraBack: 10.8,
    cameraLookAhead: 13,
  });

  function laneX(lanePosition, laneCount = 7) {
    return (lanePosition - (laneCount - 1) / 2) * WORLD.laneWidth;
  }

  function segmentZ(index, position, offset = 0.5) {
    return -(index + offset - position) * WORLD.segmentDepth;
  }

  function heightY(worldHeight) {
    return worldHeight * WORLD.heightScale;
  }

  function playerWorldY(state) {
    const ground = state.terrainEnabled && Number.isFinite(state.groundHeight) ? state.groundHeight : 0;
    return heightY(ground + (state.playerY || 0));
  }

  function tileSurfaceY(tile, offset = 0.5) {
    return heightY(tile.nearHeight + (tile.farHeight - tile.nearHeight) * offset);
  }

  function enemyLane(enemy) {
    if (enemy.type !== 'drone' || enemy.state === undefined) return enemy.lane;
    if (enemy.state !== 'move') return enemy.fromLane;
    const time = Math.max(0, Math.min(1, enemy.moveT));
    return enemy.fromLane + (enemy.toLane - enemy.fromLane) * time * time * (3 - 2 * time);
  }

  /** 创建跟随飞船的追尾视图；参数为画布、游戏配置及失败回调，返回渲染接口。 */
  function create({ canvas, config, onFailure }) {
    const THREE = scope.THREE;
    if (!THREE || !THREE.WebGLRenderer) throw new Error('Three.js renderer is unavailable');

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.20;
    renderer.setClearColor(0x030710);
    const shadowsEnabled = Boolean(renderer.shadowMap);
    if (shadowsEnabled) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08121e, 150, 445);
    const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.035, 1400);
    const cameraTarget = new THREE.Vector3();
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xb5cee8, 0x111321, 1.0));
    const sunlight = new THREE.DirectionalLight(0xdeecff, 2.45);
    sunlight.position.set(-30, 45, -104);
    sunlight.target.position.set(0, 0, -24);
    sunlight.castShadow = shadowsEnabled;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -28;
    sunlight.shadow.camera.right = 28;
    sunlight.shadow.camera.top = 40;
    sunlight.shadow.camera.bottom = -40;
    sunlight.shadow.camera.near = 0.5;
    sunlight.shadow.camera.far = 180;
    sunlight.shadow.bias = -0.00015;
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.autoUpdate = false;
    scene.add(sunlight);
    scene.add(sunlight.target);
    const fillLight = new THREE.DirectionalLight(0xb9d9ff, 1.10);
    fillLight.position.set(-14, 12, 25);
    scene.add(fillLight);

    const resources = new Set();
    const batches = [];
    const dummy = new THREE.Object3D();
    const instanceColor = new THREE.Color();
    const flatTile = Object.freeze({ nearHeight: 0, farHeight: 0, raised: false, kind: 'flat', dropAtEnd: false });
    // Three r170 的默认实例法线近似仅覆盖旋转/缩放；坡面剪切需要真正的逆转置。
    const terrainNormalChunk = THREE.ShaderChunk.defaultnormal_vertex
      .replace('transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );', '')
      .replace('transformedNormal = im * transformedNormal;',
        'transformedNormal = mat3(cross(im[1], im[2]), cross(im[2], im[0]), cross(im[0], im[1])) * transformedNormal;');
    let surfaceHeight = 0;
    let surfaceSlope = 0;
    let surfaceCenterZ = 0;
    let raisedTileCount = 0;
    let highestVisibleSurface = 0;
    const materials = {};
    const own = (resource) => { resources.add(resource); return resource; };
    own(sunlight.shadow);
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    const octahedron = own(new THREE.OctahedronGeometry(1));
    const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 8));
    const torus = own(new THREE.TorusGeometry(1, 0.055, 5, 24));
    const sphere = own(new THREE.SphereGeometry(1, 32, 20));
    const environmentLighting = buildEnvironmentLighting();

    function buildEnvironmentLighting() {
      // 环境反射在初始化时烘焙一次；不会在主循环内新增渲染通道。
      if (!renderer.capabilities) return false;
      const studio = new THREE.Scene();
      studio.background = new THREE.Color(0x101b27);
      const temporaryResources = [];
      const panelGeometry = new THREE.PlaneGeometry(1, 1);
      temporaryResources.push(panelGeometry);
      const panels = [
        { position: [-4, 5, 6], size: [7, 5], color: [2.4, 2.75, 3.0] },
        { position: [5, 2, 2], size: [3, 7], color: [1.2, 1.35, 1.5] },
        { position: [-2, 7, -3], size: [5, 4], color: [1.4, 1.6, 1.85] },
        { position: [6, 0, -5], size: [2, 5], color: [0.82, 0.51, 0.25] },
      ];
      for (const panel of panels) {
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(...panel.color), side: THREE.DoubleSide,
        });
        temporaryResources.push(material);
        const surface = new THREE.Mesh(panelGeometry, material);
        surface.position.set(...panel.position);
        surface.scale.set(panel.size[0], panel.size[1], 1);
        surface.lookAt(0, 0, 0);
        studio.add(surface);
      }
      const generator = new THREE.PMREMGenerator(renderer);
      try {
        const target = own(generator.fromScene(studio, 0.065, 0.1, 30));
        scene.environment = target.texture;
        scene.environmentIntensity = 0.75;
      } finally {
        generator.dispose();
        for (const resource of temporaryResources) resource.dispose();
        studio.clear();
      }
      return true;
    }

    function metal(name, color, roughness = 0.58, metalness = 0.62) {
      materials[name] = own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
      return materials[name];
    }

    function glow(name, color, intensity = 1.0) {
      materials[name] = own(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      materials[name].color.multiplyScalar(intensity);
      return materials[name];
    }

    metal('road', 0x0c1722, 0.85, 0.18);
    metal('roadInset', 0x253746, 0.94, 0.28);
    // 切角装甲板用颜色、微高度和粗糙度表达；远处由 mipmap 平滑退去，不加道路几何。
    const deckSize = 256;
    const deckPixels = new Uint8Array(deckSize * deckSize * 4);
    const deckSurface = new Uint8Array(deckPixels.length);
    for (let row = 0; row < deckSize; row += 1) {
      for (let column = 0; column < deckSize; column += 1) {
        const offset = (row * deckSize + column) * 4;
        const u = column / (deckSize - 1);
        const v = row / (deckSize - 1);
        const x = Math.min(u, 1 - u);
        const z = Math.min(v, 1 - v);
        const edge = Math.min(x - 0.024, z - 0.022, (x + z - 0.09) * 0.707);
        const noise = ((row * 97 + column * 73 + row * column * 13) % 17) / 17 - 0.5;
        const brush = Math.sin(column * 1.71) * 1.4 + noise * 2;
        let level = 216 + brush;
        let height = 155 + noise * 2;
        let roughness = 221 + noise * 6;
        if (edge < 0) { level = 131 + brush; height = 88; roughness = 238; }
        else if (edge < 0.010) { level = 228 + brush; height = 120 + edge * 3500; roughness = 190; }
        else if (edge < 0.018) { level = 188 + brush; height = 134; roughness = 224; }
        // 细长凹槽与浅银金属唇只沿板侧延伸，中央保持干净。
        if (Math.abs(x - 0.105) < 0.008 && v > 0.20 && v < 0.80) {
          level = x < 0.105 ? 150 : 228; height = x < 0.105 ? 100 : 163; roughness = 190;
        }
        // 埋入式锁扣和小检修口留在板角，避免重复的大符号占据航道。
        const bolt = Math.hypot(x - 0.115, z - 0.108);
        if (bolt < 0.014) {
          level = bolt > 0.009 ? 230 : 119; height = bolt > 0.009 ? 158 : 109; roughness = 176;
          if (Math.abs(u - (u < 0.5 ? 0.115 : 0.885)) < 0.003 && bolt < 0.008) level = 174;
        }
        if (u > 0.66 && u < 0.82 && v > 0.087 && v < 0.15) {
          const lip = Math.min(u - 0.66, 0.82 - u, v - 0.087, 0.15 - v);
          level = lip < 0.006 ? 175 : 201 + brush;
          height = 123; roughness = 230;
          if (u > 0.69 && u < 0.77 && Math.abs(v - 0.119) < 0.004) level = 218;
        }
        deckPixels[offset] = deckPixels[offset + 1] = deckPixels[offset + 2] = level;
        deckPixels[offset + 3] = 255;
        // 一张线性纹理复用 R 微高度、G 粗糙度，避免重复上传同尺寸图片。
        deckSurface[offset] = height;
        deckSurface[offset + 1] = roughness;
        deckSurface[offset + 2] = 0;
        deckSurface[offset + 3] = 255;
      }
    }
    function deckTexture(pixels, colorSpace) {
      const texture = own(new THREE.DataTexture(pixels, deckSize, deckSize));
      texture.colorSpace = colorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = renderer.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    }
    materials.roadInset.map = deckTexture(deckPixels, THREE.SRGBColorSpace);
    materials.roadInset.bumpMap = materials.roadInset.roughnessMap = deckTexture(deckSurface, THREE.NoColorSpace);
    materials.roadInset.bumpScale = 0.014;
    metal('structure', 0x1b2530, 0.52, 0.74);
    metal('retainingWall', 0x405563, 0.76, 0.24);
    materials.retainingWall.emissive.setHex(0x162631);
    materials.retainingWall.emissiveIntensity = 0.26;
    metal('edge', 0x71818a, 0.4, 0.8);
    metal('armor', 0x47484b, 0.6, 0.65);
    metal('obstacle', 0x78413d, 0.66, 0.45);
    metal('cockpit', 0x0d131b, 0.8, 0.22);
    metal('cockpitInset', 0x03070b, 0.92, 0.12);
    metal('brass', 0x89714f, 0.4, 0.75);
    metal('enemyArmor', 0x505f6b, 0.44, 0.62);
    glow('cyan', 0x71e4f2);
    glow('cyanDim', 0x233a48);
    glow('amber', 0xffbd5e);
    glow('goldstar', 0xffe1a1);
    glow('red', 0xff5b49);
    glow('white', 0xd9f5f6);
    glow('violet', 0xbfa5ff);
    glow('green', 0x82f2b0);

    // 所有跑道和障碍按材质合批；长赛道不会按块创建对象或累积资源。
    function makeBatch(name, geometry, material, capacity = 2200) {
      if (material.isMeshStandardMaterial && !material.userData.terrainShearNormals) {
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', terrainNormalChunk);
        };
        material.customProgramCacheKey = () => 'skyroads_terrain_shear_normals_v1';
        material.userData.terrainShearNormals = true;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = name.endsWith('_near_body');
      scene.add(mesh);
      const batch = {
        mesh,
        capacity,
        count: 0,
        add(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color) {
          if (this.count >= this.capacity) return;
          dummy.position.set(x, y, z);
          dummy.scale.set(sx, sy, sz);
          dummy.rotation.set(rx, ry, rz);
          dummy.updateMatrix();
          // 坡面只剪切 Y：X/Z 的真实碰撞边界与障碍垂直高度保持不变。
          const values = dummy.matrix.elements;
          values[1] += surfaceSlope * values[2];
          values[5] += surfaceSlope * values[6];
          values[9] += surfaceSlope * values[10];
          values[13] += surfaceHeight + surfaceSlope * (values[14] - surfaceCenterZ);
          mesh.setMatrixAt(this.count, dummy.matrix);
          if (color !== undefined) {
            instanceColor.set(color);
            mesh.setColorAt(this.count, instanceColor);
          }
          this.count += 1;
        },
      };
      batches.push(batch);
      return batch;
    }

    const roadBatch = makeBatch('road_deck', box, materials.road);
    const insetBatch = makeBatch('road_recesses', box, materials.roadInset);
    roadBatch.mesh.receiveShadow = true;
    insetBatch.mesh.receiveShadow = true;
    const structureBatch = makeBatch('deck_structure', box, materials.structure, 3600);
    const retainingBatch = makeBatch('raised_deck_panels', box, materials.retainingWall, 2200);
    const armorBatch = makeBatch('armor_modules', box, materials.armor);
    const edgeBatch = makeBatch('metal_edges', box, materials.edge, 3500);
    const obstacleBatch = makeBatch('obstacle_hulls', box, materials.obstacle);
    const cyanBatch = makeBatch('guidance_lights', box, materials.cyan, 4000);
    const dimBatch = makeBatch('guidance_seams', box, materials.cyanDim, 4000);
    const amberBatch = makeBatch('warning_lights', box, materials.amber, 2200);
    const redBatch = makeBatch('hazard_lights', box, materials.red, 2200);
    const whiteBatch = makeBatch('weapon_tracers', box, materials.white, 160);
    const jewelBatch = makeBatch('energy_crystals', octahedron, materials.white, 500);
    const collarBatch = makeBatch('pickup_collars', torus, materials.white, 800);
    const beaconBatch = makeBatch('pickup_beacons', box, materials.white, 400);
    const engineBatch = makeBatch('engine_nozzles', cylinder, materials.structure, 350);
    const weapons = scope.Skyroads.flightWeapons
      ? scope.Skyroads.flightWeapons.create({ THREE, parent: scene, own, world: WORLD, config }) : null;
    const chamferShape = new THREE.Shape();
    chamferShape.moveTo(-0.42, -0.42);
    chamferShape.lineTo(0.42, -0.42);
    chamferShape.lineTo(0.42, 0.42);
    chamferShape.lineTo(-0.42, 0.42);
    chamferShape.closePath();
    const chamferGeometry = own(new THREE.ExtrudeGeometry(chamferShape, {
      depth: 0.84, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, steps: 1,
    }));
    chamferGeometry.translate(0, 0, -0.42);
    const enemyHullBatch = makeBatch('enemy_chamfered_armor', chamferGeometry, materials.enemyArmor, 350);

    function horizontalHull(points, thickness, bevel) {
      const shape = new THREE.Shape();
      points.forEach(([x, z], index) => {
        if (index === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });
      shape.closePath();
      const geometry = own(new THREE.ExtrudeGeometry(shape, {
        depth: thickness - bevel * 2, bevelEnabled: bevel > 0,
        bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1,
      }));
      geometry.translate(0, 0, -thickness / 2 + bevel);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    const droneHullBatch = makeBatch('enemy_arrowhead_fuselage', horizontalHull([
      [0, 1.60], [0.50, 1.10], [0.66, 0.45], [0.47, -1.20], [0, -1.53],
      [-0.47, -1.20], [-0.66, 0.45], [-0.50, 1.10],
    ], 0.52, 0.04), materials.enemyArmor, 120);
    const droneWingBatch = makeBatch('enemy_swept_wings', horizontalHull([
      [0, 0.94], [0.30, 0.64], [1.26, -0.44], [1.08, -0.96], [0.28, -0.52],
      [0, -0.88], [-0.28, -0.52], [-1.08, -0.96], [-1.26, -0.44], [-0.30, 0.64],
    ], 0.12, 0.019), materials.armor, 120);
    // 传感眼独立批次：逐帧实例色闪烁不会污染共享红灯批次的其它实例。
    const droneEyeBatch = makeBatch('drone_sensor_eyes', box, materials.red, 160);
    for (const batch of [enemyHullBatch, droneHullBatch, droneWingBatch, engineBatch]) batch.mesh.castShadow = true;
    const obstacleModels = scope.Skyroads.flightObstacles
      ? scope.Skyroads.flightObstacles.create({
        THREE, own, makeBatch, world: WORLD, config,
        hitbox: scope.Skyroads.input && scope.Skyroads.input.HITBOX,
      }) : null;
    const flightObjects = scope.Skyroads.flightObjects
      ? scope.Skyroads.flightObjects.create({ THREE, own, makeBatch, world: WORLD, config }) : null;

    function symbolGeometry(points) {
      const shape = new THREE.Shape();
      points.forEach(([x, y], index) => { if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y); });
      shape.closePath();
      const geometry = own(new THREE.ExtrudeGeometry(shape, {
        depth: 0.15, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.035, bevelThickness: 0.025, steps: 1,
      }));
      geometry.translate(0, 0, -0.075);
      return geometry;
    }
    const starPoints = Array.from({ length: 10 }, (_, index) => {
      const angle = Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? 0.64 : 0.28;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
    const symbolGeometries = {
      BOOST: symbolGeometry([
        [-0.06, 0.69], [-0.53, -0.06], [-0.06, -0.06], [-0.23, -0.69],
        [0.54, 0.17], [0.12, 0.17], [0.27, 0.69],
      ]),
      SLOW: symbolGeometry([
        [-0.50, 0.57], [0.50, 0.57], [0.50, 0.39], [0.15, 0.02], [0.50, -0.37],
        [0.50, -0.57], [-0.50, -0.57], [-0.50, -0.37], [-0.15, 0.02], [-0.50, 0.39],
      ]),
      TRIPLE: symbolGeometry(starPoints),
      MAGNET: symbolGeometry([
        [-0.55, 0.50], [-0.55, -0.23], [-0.36, -0.53], [0.36, -0.53], [0.55, -0.23],
        [0.55, 0.50], [0.28, 0.50], [0.28, -0.13], [0.17, -0.26], [-0.17, -0.26],
        [-0.28, -0.13], [-0.28, 0.50],
      ]),
    };
    const symbolMaterials = {
      BOOST: materials.amber, SLOW: materials.violet, TRIPLE: materials.goldstar, MAGNET: materials.cyan,
    };
    const symbolBatches = {};
    const symbolInlayBatches = {};
    for (const [type, geometry] of Object.entries(symbolGeometries)) {
      symbolBatches[type] = makeBatch(`${type.toLowerCase()}_sigil`, geometry, symbolMaterials[type], 80);
      // 白色内嵌层在符号前方浮出，形成双色全息徽章。
      symbolInlayBatches[type] = makeBatch(`${type.toLowerCase()}_sigil_inlay`, geometry, materials.white, 80);
    }
    // 道具徽章外圈：与符号同色的细环反向慢转，让奖励标记更像一枚悬浮徽章。
    const symbolRingBatch = makeBatch('pickup_sigil_rings',
      own(new THREE.TorusGeometry(0.98, 0.030, 4, 40)), materials.white, 160);
    // 符号背后的程序径向柔光：远距离先看到一团同色光晕。
    const haloPixels = new Uint8Array(64 * 64 * 4);
    for (let py = 0; py < 64; py += 1) {
      for (let px = 0; px < 64; px += 1) {
        const distance = Math.hypot((px - 31.5) / 31.5, (py - 31.5) / 31.5);
        const offset = (py * 64 + px) * 4;
        haloPixels[offset] = haloPixels[offset + 1] = haloPixels[offset + 2] = 255;
        haloPixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 2.6) * 255);
      }
    }
    const haloTexture = own(new THREE.DataTexture(haloPixels, 64, 64));
    haloTexture.needsUpdate = true;
    const haloBatch = makeBatch('pickup_halo_glow', own(new THREE.PlaneGeometry(2.6, 2.6)),
      own(new THREE.MeshBasicMaterial({ map: haloTexture, transparent: true, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), 200);

    function mesh(geometry, material, parent, position, scale, rotation) {
      const object = new THREE.Mesh(geometry, material);
      if (position) object.position.set(...position);
      if (scale) object.scale.set(...scale);
      if (rotation) object.rotation.set(...rotation);
      parent.add(object);
      return object;
    }

    function beam(parent, start, end, radius, material) {
      const from = new THREE.Vector3(...start);
      const to = new THREE.Vector3(...end);
      const object = mesh(cylinder, material, parent);
      object.position.copy(from).add(to).multiplyScalar(0.5);
      object.scale.set(radius, from.distanceTo(to), radius);
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
      return object;
    }

    let orbitalEnvironment = null;
    let galaxy = null;
    const sky = new THREE.Group();
    sky.name = 'orbital_environment';
    scene.add(sky);
    buildEnvironment();
    const skyShow = scope.Skyroads.flightSkyShow
      ? scope.Skyroads.flightSkyShow.create({ THREE, own, parent: scene }) : null;
    const wormholeFx = scope.Skyroads.flightWormhole
      ? scope.Skyroads.flightWormhole.create({ THREE, parent: scene, own, world: WORLD, config }) : null;
    const warpShipState = {};
    const dimensions = scope.Skyroads.flightDimensions;
    const ship = scope.Skyroads.flightShip ? scope.Skyroads.flightShip.create({ THREE, own, materials,
      visualScale: dimensions.modelScale, hoverOffset: dimensions.hoverOffset }) : null;
    if (ship) {
      ship.group.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = !(object.material.isMeshBasicMaterial || object.material.transparent);
        object.receiveShadow = object.castShadow;
      });
      scene.add(ship.group);
    }
    // 死亡时机体隐藏，爆炸必须拥有独立场景节点；护盾读取同一无敌计时。
    const statusFx = scope.Skyroads.flightStatusFx
      ? scope.Skyroads.flightStatusFx.create({ THREE, own }) : null;
    if (statusFx) scene.add(statusFx.group);
    const magnetFx = scope.Skyroads.flightMagnet
      ? scope.Skyroads.flightMagnet.create({ THREE, own, makeBatch, world: WORLD, config,
        addFuel: flightObjects ? (...args) => flightObjects.addFuel(...args) : null }) : null;

    let viewportWidth = 1;
    let viewportHeight = 1;
    let visualTime = 0;
    let previousStateTime = null;
    let previousLane = null;
    let bank = 0;
    let disposed = false;
    let contextLost = false;
    let currentState = null;
    let lastFrameMs = 0;
    let visibleSegments = 0;
    let clippedInstances = 0;
    let previousEntities = new Map();
    let frameEntities = new Map();
    let previousPosition = null;
    let previousRunId = null;
    let debris = [];
    let shadowSignature = '';

    function loseContext(event) {
      event.preventDefault();
      contextLost = true;
      if (typeof onFailure === 'function') onFailure(new Error('WebGL context lost'));
    }
    canvas.addEventListener('webglcontextlost', loseContext, false);

    function buildEnvironment() {
      const noiseFunctions = `
        float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
          p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                         mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                         mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm(vec3 p) { return noise(p) * 0.55 + noise(p * 2.03 + 7.1) * 0.27
          + noise(p * 4.13 + 13.7) * 0.13 + noise(p * 8.17) * 0.05; }
      `;
      if (scope.Skyroads.flightGalaxy) {
        galaxy = scope.Skyroads.flightGalaxy.create({ THREE, parent: sky, own, sphere });
      } else {
        const nebulaMaterial = own(new THREE.ShaderMaterial({
          vertexShader: `varying vec3 direction; void main() { direction = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `${noiseFunctions} varying vec3 direction;
            void main() {
              vec3 d = normalize(direction);
              float cloud = fbm(d * 5.0 + vec3(4.0, 11.0, 2.0));
              float ridge = exp(-pow(d.y - 0.15 + d.x * 0.32 + (cloud - 0.5) * 0.3, 2.0) * 21.0);
              float detail = smoothstep(0.28, 0.77, fbm(d * 17.0 + cloud));
              vec3 color = vec3(0.007, 0.013, 0.026);
              color += vec3(0.024, 0.047, 0.068) * ridge * detail;
              color += vec3(0.024, 0.019, 0.032) * pow(cloud, 3.0) * ridge;
              gl_FragColor = vec4(color, 1.0);
            }`,
          side: THREE.BackSide, depthWrite: false, fog: false,
        }));
        mesh(sphere, nebulaMaterial, sky, [0, 0, 0], [1000, 1000, 1000]).renderOrder = -10;
        const positions = [];
        const colors = [];
        let seed = 9173;
        const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        for (let index = 0; index < 1900; index += 1) {
          const azimuth = random() * Math.PI * 2;
          const elevation = Math.acos(random() * 2 - 1);
          const radius = 630 + random() * 230;
          positions.push(radius * Math.sin(elevation) * Math.cos(azimuth),
            radius * Math.cos(elevation), radius * Math.sin(elevation) * Math.sin(azimuth));
          const brightness = 0.25 + random() * 0.7;
          colors.push(brightness * 0.78, brightness * 0.88, brightness);
        }
        const starGeometry = own(new THREE.BufferGeometry());
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const starMaterial = own(new THREE.PointsMaterial({ size: 1.1, vertexColors: true, fog: false,
          transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false }));
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.name = 'seeded_star_field';
        sky.add(stars);
      }

      // 程序化行星材质保留可编辑参数，不请求外部贴图。
      const planetMaterial = own(new THREE.ShaderMaterial({
        uniforms: { sunDirection: { value: new THREE.Vector3(-0.7, 0.35, 0.7).normalize() } },
        vertexShader: `varying vec3 vNormal; varying vec3 vPosition;
          void main() { vNormal = normal; vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `${noiseFunctions} varying vec3 vNormal; varying vec3 vPosition; uniform vec3 sunDirection;
          void main() {
            vec3 n = normalize(vNormal);
            float weather = fbm(vPosition * vec3(3.5, 21.0, 3.5));
            float latitude = vPosition.y + (fbm(vPosition * 5.0) - 0.5) * 0.035;
            float bands = sin(latitude * 50.0 + fbm(vPosition * 6.0) * 1.5) * 0.055;
            float fineCloud = fbm(vPosition * vec3(15.0, 80.0, 15.0)) - 0.5;
            float clouds = clamp(0.48 + (weather - 0.5) * 0.88 + bands + fineCloud * 0.12, 0.0, 1.0);
            vec3 dark = vec3(0.045, 0.10, 0.15);
            vec3 light = vec3(0.32, 0.45, 0.52);
            vec3 color = mix(dark, light, clouds);
            color += vec3(0.11, 0.065, 0.025) * smoothstep(0.62, 0.84, weather + bands);
            float lightness = pow(max(0.0, dot(n, sunDirection)), 0.74);
            color *= 0.045 + lightness * 1.2;
            float limb = pow(1.0 - abs(n.z), 3.0);
            color += vec3(0.08, 0.22, 0.32) * limb * lightness;
            gl_FragColor = vec4(color, 1.0);
          }`,
        fog: false,
      }));
      const planetPosition = [120, 103, -450];
      const planet = mesh(sphere, planetMaterial, sky, planetPosition, [74, 74, 74], [0, 0, -0.28]);
      planet.name = 'aurelia_gas_giant';
      const ringGeometry = own(new THREE.RingGeometry(91, 121, 160));
      const ringMaterial = own(new THREE.ShaderMaterial({
        vertexShader: `varying vec2 ringPosition; void main() { ringPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 ringPosition;
          void main() { float r = length(ringPosition);
            float bands = sin(r * 3.4) * 0.3 + sin(r * 11.0) * 0.15 + 0.55;
            float edge = smoothstep(91.0, 93.0, r) * (1.0 - smoothstep(117.0, 121.0, r));
            float gap = 1.0 - smoothstep(102.0, 103.0, r) * (1.0 - smoothstep(106.0, 107.0, r));
            gl_FragColor = vec4(vec3(0.40, 0.55, 0.63), bands * edge * gap * 0.46);
          }`,
        transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false,
      }));
      const ringRotation = [1.45, 0.15, -0.30];
      mesh(ringGeometry, ringMaterial, sky, planetPosition, [1, 1, 1], ringRotation);
      const iceMaterial = own(new THREE.MeshBasicMaterial({ color: 0x97b9ca, opacity: 0.27,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      for (const radius of [88, 93, 100, 109, 116, 123]) {
        const thinRing = own(new THREE.RingGeometry(radius, radius + 0.32, 160));
        mesh(thinRing, iceMaterial, sky, planetPosition, [1, 1, 1], ringRotation);
      }
      const moonMaterial = own(new THREE.MeshStandardMaterial({ color: 0x6a7e8a, roughness: 1, fog: false }));
      mesh(sphere, moonMaterial, sky, [-181, 87, -650], [24, 24, 24]);

      if (scope.Skyroads.flightEnvironment) {
        orbitalEnvironment = scope.Skyroads.flightEnvironment.create({ THREE, parent: sky, materials, own });
        return;
      }

      const gate = new THREE.Group();
      gate.position.set(0, 23, -368);
      gate.name = 'orbital_transfer_gate';
      sky.add(gate);
      const gateRing = own(new THREE.TorusGeometry(36, 1.7, 8, 80));
      const gateAccent = own(new THREE.TorusGeometry(34, 0.16, 4, 80));
      mesh(gateRing, materials.structure, gate);
      mesh(gateAccent, materials.cyanDim, gate, [0, 0, 1]);
      for (let index = 0; index < 12; index += 1) {
        const angle = index / 12 * Math.PI * 2;
        const x = Math.cos(angle) * 36;
        const y = Math.sin(angle) * 36;
        mesh(box, materials.armor, gate, [x, y, 0], [5, 7, 5], [0, 0, angle]);
        mesh(box, materials.amber, gate, [x, y, 2.6], [0.25, 3.7, 0.1], [0, 0, angle]);
      }
      for (const side of [-1, 1]) {
        const scaffold = new THREE.Group();
        scaffold.position.set(side * 62, -10, -240);
        scaffold.rotation.z = side * -0.12;
        sky.add(scaffold);
        mesh(box, materials.structure, scaffold, [0, 0, 0], [8, 130, 13]);
        mesh(box, materials.armor, scaffold, [0, 62, 0], [23, 6, 18]);
        mesh(box, materials.armor, scaffold, [0, -35, 0], [19, 8, 18]);
        mesh(box, materials.cyanDim, scaffold, [-side * 4.1, 0, 7], [0.3, 100, 0.3]);
        for (let index = 0; index < 8; index += 1) {
          mesh(box, materials.edge, scaffold, [0, index * 14 - 52, 7], [9, 0.4, 0.8]);
        }
        beam(sky, [side * 63, 48, -240], [side * 16, -8, -175], 1.1, materials.structure);
      }
    }

    function terrainTile(state, index, lane) {
      const terrain = scope.Skyroads.flightTerrain;
      return state.terrainEnabled && terrain ? terrain.sampleTile(index, lane) : flatTile;
    }

    function useSurface(tile, z) {
      surfaceHeight = tileSurfaceY(tile);
      surfaceSlope = heightY(tile.nearHeight - tile.farHeight) / WORLD.segmentDepth;
      surfaceCenterZ = z;
    }

    function clearSurface() {
      surfaceHeight = 0;
      surfaceSlope = 0;
      surfaceCenterZ = 0;
    }

    const terrainRow = new Array(config.LANES || 7);

    function renderRoad(state, time) {
      const laneCount = config.LANES || 7;
      const start = Math.max(0, Math.floor(state.position) - 2);
      const end = Math.min(state.track.length, start + Math.min(120, config.RENDER_DISTANCE || 120));
      const laneWidth = WORLD.laneWidth;
      visibleSegments = end - start;
      raisedTileCount = 0;
      highestVisibleSurface = 0;
      for (let index = start; index < end; index += 1) {
        const segment = state.track[index];
        const z = segmentZ(index, state.position);
        for (let lane = 0; lane < laneCount; lane += 1) terrainRow[lane] = terrainTile(state, index, lane);
        for (let lane = 0; lane < laneCount; lane += 1) {
          const type = segment.lanes[lane];
          const tile = terrainRow[lane];
          const x = laneX(lane, laneCount);
          useSurface(tile, z);
          highestVisibleSurface = Math.max(highestVisibleSurface, heightY(tile.nearHeight), heightY(tile.farHeight));
          if (type === 'GAP') {
            // 缺口没有承重面；告警附在前一块真实路板上，跨断层时不会悬空。
            const previous = state.track[index - 1];
            if (previous && previous.lanes[lane] !== 'GAP') {
              useSurface(terrainTile(state, index - 1, lane), z + WORLD.segmentDepth);
              redBatch.add(x, 0.06, z + WORLD.segmentDepth / 2 + 0.14, laneWidth * 0.96, 0.045, 0.14);
              for (let stripe = -2; stripe <= 2; stripe += 1) {
                amberBatch.add(x + stripe * 0.56, 0.065, z + WORLD.segmentDepth / 2 + 0.35,
                  0.21, 0.035, 0.32, 0, -0.5);
              }
            }
            continue;
          }
          if (tile.raised) raisedTileCount += 1;
          const floatingIsland = tile.kind === 'floating_island';
          roadBatch.add(x, -0.40, z, laneWidth - 0.035, 0.80, WORLD.segmentDepth,
            0, 0, 0, tile.raised ? 0xcddce0 : 0xffffff);
          insetBatch.add(x, 0.003, z, laneWidth * 0.968, 0.009, WORLD.segmentDepth * 0.965);
          dimBatch.add(x - laneWidth / 2 + 0.05, 0.018, z, 0.025, 0.015, WORLD.segmentDepth - 0.11);
          for (const side of [-1, 1]) {
            const neighbor = lane + side;
            const outside = neighbor < 0 || neighbor >= laneCount;
            const neighborTile = outside ? tile : terrainRow[neighbor];
            const heightDifference = Math.max(0, heightY(tile.nearHeight - neighborTile.nearHeight),
              heightY(tile.farHeight - neighborTile.farHeight));
            const exposed = outside || segment.lanes[neighbor] === 'GAP' || heightDifference > 0.04;
            if (!exposed) continue;
            const edgeX = x + side * (laneWidth / 2 - 0.055);
            edgeBatch.add(edgeX, -0.42, z, 0.09, 0.90, WORLD.segmentDepth - 0.05);
            cyanBatch.add(edgeX, 0.047, z, 0.07, 0.032, WORLD.segmentDepth - 0.2);
            if (heightDifference > 0.04 && !floatingIsland) {
              const wallDepth = heightDifference + 0.80;
              // 立壁分为内缩背板、装甲面及外露竖肋；最外侧仍收在真实车道边界内。
              retainingBatch.add(edgeX - side * 0.04, -wallDepth / 2, z,
                0.10, wallDepth, WORLD.segmentDepth - 0.03, 0, 0, 0, 0xffffff);
              retainingBatch.add(edgeX + side * 0.022, -wallDepth * 0.50, z,
                0.025, wallDepth * 0.73, WORLD.segmentDepth - 0.58,
                0, 0, 0, index % 2 === 0 ? 0xd0dae0 : 0xaebfc9);
              for (const ribZ of [-1.70, 1.70]) {
                edgeBatch.add(edgeX + side * 0.04, -wallDepth * 0.49, z + ribZ,
                  0.026, wallDepth * 0.90, 0.12);
                for (const nodeY of [-0.27, -wallDepth + 0.22]) {
                  armorBatch.add(edgeX + side * 0.039, nodeY, z + ribZ,
                    0.030, 0.22, 0.26);
                }
              }
              edgeBatch.add(edgeX + side * 0.036, -wallDepth + 0.16, z,
                0.031, 0.10, WORLD.segmentDepth - 0.20);
              if (index % 3 === 0) {
                amberBatch.add(edgeX + side * 0.043, -Math.min(0.63, wallDepth * 0.32), z,
                  0.021, 0.065, 0.32);
              }
            }
            if (index % 3 === 0) {
              structureBatch.add(edgeX, -1.05, z, 0.21, 1.4, 0.48);
              amberBatch.add(edgeX + side * 0.10, -0.44, z, 0.018, 0.16, 0.21);
            }
          }
          if (index % 6 === 0) {
            // 承重横梁与斜撑位于路板下方，保留缺口的真实可见空间。
            structureBatch.add(x, -1.13, z, laneWidth * 0.88, 0.24, 0.58);
            for (const side of [-1, 1]) {
              edgeBatch.add(x + side * laneWidth * 0.28, -1.27, z, 0.10, 1.15, 0.19,
                0, 0, side * -0.64);
            }
          }
          if (floatingIsland && index % 4 === 0) {
            // 悬浮段的推进舱贴在路板下方，不用通到低层地面的挡墙伪装成高台。
            structureBatch.add(x, -0.95, z, laneWidth * 0.72, 0.24, 1.15);
            for (const side of [-1, 1]) {
              engineBatch.add(x + side * 0.86, -1.14, z, 0.57, 0.28, 0.85);
              cyanBatch.add(x + side * 0.86, -1.295, z, 0.42, 0.035, 0.61);
            }
          }
          const nextTile = terrainTile(state, index + 1, lane);
          const drop = heightY(tile.farHeight - nextTile.nearHeight);
          if (drop > 0.04) {
            const lipZ = z - WORLD.segmentDepth / 2 + 0.035;
            if (!floatingIsland) retainingBatch.add(x, -(drop + 0.80) / 2, lipZ,
              laneWidth - 0.04, drop + 0.80, 0.085, 0, 0, 0, 0xffffff);
            amberBatch.add(x, 0.055, lipZ + 0.075, laneWidth * 0.94, 0.035, 0.11);
            for (let stripe = -2; stripe <= 2; stripe += 1) {
              edgeBatch.add(x + stripe * 0.51, 0.04, lipZ + 0.30, 0.19, 0.025, 0.28, 0, -0.45);
            }
          }
          if (type.startsWith('WALL_')) {
            renderObstacle(type, x, z, index, time);
            frameEntities.set(`wall:${index}:${lane}`, {
              index, x, y: surfaceHeight + heightY(config[`${type}_HEIGHT`] || 600) / 2,
            });
          } else if (type !== 'ROAD' && !(type === 'TRIPLE' && state.tripleT > 0)) {
            // 已变身时不可续时，实体及其光柱、地面标记一起隐藏。
            renderPickup(type, x, z, time, index);
          }
        }
        if (segment.enemies) {
          for (const enemy of segment.enemies) renderEnemy(enemy, index, state, time);
        }
        if (index % 15 === 0) renderServiceMast(index, state, laneCount);
      }
      clearSurface();
    }

    function renderObstacle(type, x, z, index, time = 0) {
      if (obstacleModels) {
        obstacleModels.add(type, x, z, index, time);
        return;
      }
      const height = heightY(config[`${type}_HEIGHT`] || (type === 'WALL_HIGH' ? 2000 : type === 'WALL_MEDIUM' ? 1100 : 600));
      const hitbox = scope.Skyroads.input && scope.Skyroads.input.HITBOX;
      const width = WORLD.laneWidth * (hitbox ? hitbox.wallHalfWidth * 2 : 0.84);
      const depth = WORLD.segmentDepth;
      obstacleBatch.add(x, height / 2, z, width, height, depth);
      armorBatch.add(x, height + 0.035, z, width - 0.14, 0.07, depth - 0.1);
      // 正面凹槽、竖向加劲肋和顶边灯用几何塑造工业模块。
      const front = z + depth / 2 + 0.019;
      insetBatch.add(x, height * 0.50, front, width * 0.76, height * 0.69, 0.048);
      for (const side of [-1, 1]) {
        armorBatch.add(x + side * width * 0.42, height * 0.50, front + 0.07, 0.18, height * 0.93, 0.20);
        redBatch.add(x + side * width * 0.425, height * 0.54, front + 0.18, 0.055, height * 0.72, 0.02);
      }
      redBatch.add(x, height - 0.10, front + 0.02, width * 0.83, 0.065, 0.075);
      edgeBatch.add(x, 0.11, front + 0.03, width * 0.82, 0.10, 0.10);
      const stripeCount = type === 'WALL_HIGH' ? 3 : type === 'WALL_MEDIUM' ? 2 : 1;
      for (let level = 0; level < stripeCount; level += 1) {
        const y = height * (0.28 + level * 0.21);
        armorBatch.add(x, y, front + 0.03, width * 0.64, 0.11, 0.09);
        amberBatch.add(x - width * 0.24, y + 0.045, front + 0.087, 0.15, 0.022, 0.01);
      }
      if (index % 2 === 0) {
        for (let stripe = -2; stripe <= 2; stripe += 1) {
          amberBatch.add(x + stripe * 0.37, 0.37, front + 0.056, 0.18, 0.37, 0.024, 0, 0, -0.35);
        }
      }
    }

    function renderPickup(type, x, z, time, index) {
      if (flightObjects) { flightObjects.addPickup(type, x, z, time, index); return; }
      const bob = Math.sin(time * 2.2 + index * 0.7) * 0.11;
      const y = heightY(config.FUEL_BLOCK_HEIGHT || 450) + bob;
      const colors = { FUEL: 0x8cf0c5, BOOST: 0xffc36b, SLOW: 0xbfa5ff, TRIPLE: 0xffecad, MAGNET: 0x70ddec };
      const color = colors[type] || 0x8cf0c5;
      const scale = type === 'FUEL' ? 0.41 : 0.55;
      // 呼吸缩放只作用于装饰光效；拾取判定仍按车道中心规则，视觉不扩大判定。
      const pulse = 1 + 0.07 * Math.sin(time * 3 + index * 1.3);
      // 所有奖励背后都有一团同色柔光，远距离先看到光晕再分辨类型。
      haloBatch.add(x, y, z - 0.06, pulse, pulse, 1, 0, 0, 0, color);
      if (symbolBatches[type]) {
        // 符号保持面向玩家的摇摆以便辨认，白色内嵌与徽章外环增加层次。
        const sway = Math.sin(time * 1.4 + index) * 0.5;
        const sigil = 1.06 * pulse;
        symbolBatches[type].add(x, y, z, sigil, sigil, sigil, 0, sway);
        symbolInlayBatches[type].add(x, y, z + 0.11, sigil * 0.62, sigil * 0.62, sigil * 0.62, 0, sway);
        symbolRingBatch.add(x, y, z, sigil, sigil, sigil, 0.2, 0, -time * 0.6 + index, color);
        jewelBatch.add(x, y, z, scale * 0.40, scale * 0.40, scale * 0.40, 0, time * 1.1 + index, 0, color);
      } else {
        jewelBatch.add(x, y, z, scale, scale * 1.5, scale, 0, time * 0.7 + index, 0, color);
        // 燃料晶体的白色内核与外壳分层，远看仍是一颗发光晶体。
        jewelBatch.add(x, y, z, scale * 0.42, scale * 0.72, scale * 0.42, 0, -time * 1.3 + index, 0, 0xffffff);
        symbolRingBatch.add(x, y, z, scale * 1.9 * pulse, scale * 1.9 * pulse, scale * 1.9 * pulse,
          0.2, 0, -time * 0.6 + index, color);
      }
      // 同色光柱信标与地面光环：奖励在真实游戏距离上先于细节被看见。
      const beamHeight = 2.6 * pulse;
      beaconBatch.add(x, y + beamHeight * 0.28, z, 0.05 * pulse, beamHeight, 0.05 * pulse, 0, 0, 0, color);
      collarBatch.add(x, 0.055, z, scale * 2.1 * pulse, scale * 2.1 * pulse, scale * 2.1 * pulse,
        -Math.PI / 2, 0, 0, color);
      collarBatch.add(x, y, z, scale * 1.7, scale * 1.7, scale * 1.7, 0.2, 0, 0, color);
      if (type !== 'FUEL') collarBatch.add(x, y, z, scale * 1.5, scale * 1.5, scale * 1.5, 0, Math.PI / 2, 0, color);
      dimBatch.add(x, 0.03, z, 0.80, 0.025, 0.80);
    }

    function renderEnemy(enemy, index, state, time) {
      const lane = enemyLane(enemy);
      const x = laneX(lane, config.LANES);
      const z = segmentZ(index, state.position);
      useSurface(terrainTile(state, index, lane), z);
      frameEntities.set(enemy, {
        index, x,
        y: surfaceHeight + heightY(enemy.type === 'turret' ? config.TURRET_HEIGHT / 2
          : config.DRONE_HEIGHT + (Number.isFinite(enemy.altitude) ? Math.max(0, enemy.altitude) : 0)),
      });
      if (flightObjects) { flightObjects.addEnemy(enemy, x, z, time); return; }
      if (enemy.type === 'turret') {
        const height = heightY(config.TURRET_HEIGHT || 1900);
        const hullWidth = WORLD.laneWidth * 0.52;
        engineBatch.add(x, height * 0.21, z, hullWidth / 2, height * 0.42, 1.5, 0, Math.PI / 8);
        enemyHullBatch.add(x, height * 0.73, z, hullWidth, height * 0.54, 3.9);
        engineBatch.add(x, height * 0.47, z, hullWidth * 0.36, height * 0.2, 0.72);
        edgeBatch.add(x, height * 0.75, z + 1.94, hullWidth * 0.81, height * 0.25, 0.08);
        insetBatch.add(x, height * 0.75, z + 1.99, hullWidth * 0.70, height * 0.20, 0.025);
        redBatch.add(x, height * 0.85, z + 1.99, hullWidth * 0.69, 0.12, 0.01);
        for (const side of [-1, 1]) {
          engineBatch.add(x + side * 0.53, height * 0.72, z + 1.68, 0.16, 1.8, 0.16, Math.PI / 2);
          engineBatch.add(x + side * 0.53, height * 0.72, z + 2.12, 0.24, 0.24, 0.24, Math.PI / 2);
          redBatch.add(x + side * 0.53, height * 0.72, z + 2.61, 0.17, 0.17, 0.03);
          amberBatch.add(x + side * hullWidth * 0.46, height * 0.65, z + 1.99, 0.055, height * 0.35, 0.02);
          for (let fin = 0; fin < 3; fin += 1) {
            edgeBatch.add(x + side * hullWidth * 0.43, height * (0.55 + fin * 0.075), z + 1.91,
              hullWidth * 0.13, 0.075, 0.16);
          }
        }
        // 底部琥珀警戒环标出固定炮台的占地区域，低飞掠过时仍有危险提示。
        collarBatch.add(x, 0.07, z, hullWidth * 0.82, hullWidth * 0.82, hullWidth * 0.82,
          -Math.PI / 2, 0, 0, 0xffc36b);
      } else {
        // 简化模型与精细模型读取同一物理高度，不能只升起外观而把命中点留在地面。
        const altitude = Number.isFinite(enemy.altitude) ? Math.max(0, enemy.altitude) : 0;
        const top = heightY((config.DRONE_HEIGHT || 500) + altitude);
        const y = top - 0.38;
        droneHullBatch.add(x, y, z);
        droneWingBatch.add(x, y - 0.10, z);
        enemyHullBatch.add(x, y + 0.26, z + 0.04, 0.54, 0.18, 1.05);
        redBatch.add(x, y + 0.30, z + 0.535, 0.31, 0.049, 0.021);
        // 红色传感眼是敌机的远距离识别点；警告转向时加快闪烁。
        const eyePulse = enemy.state === 'warn' ? 0.45 + 0.55 * Math.abs(Math.sin(time * 9)) : 1;
        const eyeChannel = Math.round(255 * eyePulse);
        droneEyeBatch.add(x, y + 0.30, z + 0.56, 0.15, 0.095, 0.024,
          0, 0, 0, (eyeChannel << 16) | (eyeChannel << 8) | eyeChannel);
        edgeBatch.add(x, y + 0.26, z + 1.03, 0.09, 0.025, 0.41);
        // 琥珀翼尖灯把翼展轮廓从深色星云背景里托出来。
        for (const side of [-1, 1]) {
          amberBatch.add(x + side * 1.24, y - 0.04, z - 0.50, 0.085, 0.05, 0.17);
        }
        for (const side of [-1, 1]) {
          enemyHullBatch.add(x + side * 0.91, y - 0.08, z - 0.47, 0.31, 0.33, 1.22);
          engineBatch.add(x + side * 0.91, y - 0.12, z - 1.13, 0.14, 0.22, 0.14, Math.PI / 2);
          cyanBatch.add(x + side * 0.91, y - 0.12, z - 1.26, 0.13, 0.13, 0.10);
          edgeBatch.add(x + side * 0.75, y - 0.008, z - 0.03, 0.048, 0.04, 0.89, 0, side * 0.72);
        }
        if (enemy.state === 'warn' || enemy.state === 'move') {
          const side = Math.sign(enemy.toLane - enemy.fromLane);
          const vertical = Math.sign((enemy.toAltitude || 0) - (enemy.fromAltitude || 0));
          if (vertical) {
            for (const sign of [-1, 1]) {
              amberBatch.add(x + sign * 0.08, y + 0.08, z + 1.65,
                0.34, 0.06, 0.06, 0, 0, -sign * vertical * 0.75);
            }
          } else if (side) {
            amberBatch.add(x + side * 1.3, y + 0.10, z, 0.11, 0.15, 0.70);
            amberBatch.add(x + side * 1.48, y + 0.10, z + 0.25, 0.34, 0.15, 0.12, 0, side * 0.65);
          }
        }
      }
    }

    function renderServiceMast(index, state, laneCount) {
      const z = segmentZ(index, state.position);
      for (const side of [-1, 1]) {
        useSurface(terrainTile(state, index, side < 0 ? 0 : laneCount - 1), z);
        const x = side * (laneCount * WORLD.laneWidth / 2 + 2.0);
        structureBatch.add(x, -1.7, z, 0.6, 5, 0.8);
        armorBatch.add(x, 0.78, z, 0.85, 0.35, 1.10);
        cyanBatch.add(x - side * 0.43, 0.28, z, 0.07, 0.7, 0.45);
        amberBatch.add(x, 1.0, z, 0.13, 0.13, 0.13);
        structureBatch.add(x - side * 1.15, -0.87, z, 2.3, 0.3, 0.58, 0, 0, side * 0.35);
      }
    }

    function renderShots(state) {
      for (const shot of state.shots || []) {
        const x = laneX(shot.lanePosition, config.LANES);
        const y = heightY((shot.groundY || 0) + (shot.y || 0));
        const z = segmentZ(shot.seg, state.position, 0);
        if (z > 2 || z < -480) continue;
        if (shot.kind === 'missile' && !weapons) {
          engineBatch.add(x, y, z, 0.12, 0.76, 0.12, Math.PI / 2);
          amberBatch.add(x, y, z + 0.48, 0.14, 0.14, 0.54);
          whiteBatch.add(x, y, z + 0.51, 0.055, 0.055, 0.4);
        } else if (shot.kind !== 'missile') {
          cyanBatch.add(x, y, z, 0.085, 0.085, 1.4);
          whiteBatch.add(x, y, z, 0.029, 0.029, 1.52);
        }
      }
    }

    function renderDebris(state, dt) {
      // 观察实际实体消失产生世界碎片，避免复用旧 2D 粒子的屏幕坐标。
      const sameRun = previousRunId === state.runId
        && (previousPosition === null || state.position >= previousPosition);
      if (!sameRun) debris = [];
      if (sameRun && state.mode === 'PLAYING') {
        for (const [key, entity] of previousEntities) {
          if (frameEntities.has(key) || entity.index < Math.floor(state.position)
            || entity.index > Math.floor(state.position) + 70) continue;
          const count = state.reducedMotion ? 4 : 10;
          for (let index = 0; index < count && debris.length < 140; index += 1) {
            const phase = index * 2.399 + entity.index;
            debris.push({
              x: entity.x, y: entity.y, segment: entity.index + 0.5,
              vx: Math.cos(phase) * (1.2 + index % 3),
              vy: 1.5 + index % 4,
              vz: Math.sin(phase) * 0.6,
              life: state.reducedMotion ? 0.18 : 0.55,
              phase,
            });
          }
        }
      }
      previousRunId = state.runId;
      previousPosition = state.position;
      previousEntities = frameEntities;
      const frameDt = state.mode === 'PLAYING' ? dt : 0;
      for (const piece of debris) {
        piece.life -= frameDt;
        if (!state.reducedMotion) {
          piece.x += piece.vx * frameDt;
          piece.y += piece.vy * frameDt;
          piece.vy -= frameDt * 6;
          piece.segment += piece.vz * frameDt;
        }
        const z = segmentZ(piece.segment, state.position, 0);
        if (piece.life <= 0) continue;
        const size = Math.min(0.17, piece.life * 0.65);
        amberBatch.add(piece.x, piece.y, z, size, size * 0.45, size * 2, piece.phase, 0, piece.phase);
      }
      debris = debris.filter((piece) => piece.life > 0);
    }

    function renderBoost(state, time) {
      if (state.reducedMotion || !(state.boostT > 0 || state.fuelBurstT > 0)) return;
      const originX = laneX(state.movement.lanePosition, config.LANES);
      const originY = WORLD.eyeHeight + playerWorldY(state);
      // 加速曳光只沿视野两侧分布，不覆盖中心航道和告警信息。
      for (let index = 0; index < 24; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        const x = originX + side * (10 + (index * 7) % 17);
        const y = originY - 6 + (index * 3.1) % 20;
        const z = -8 - ((index * 13.7 - time * 150) % 130 + 130) % 130;
        cyanBatch.add(x, y, z, 0.018, 0.018, 2.5 + (index % 4) * 0.7);
      }
    }

    /** 读取本帧状态并绘制；不修改状态，不自行注册动画循环。 */
    function render(state) {
      if (disposed || contextLost) return;
      const startTime = performance.now();
      currentState = state;
      const stateTime = Number.isFinite(state.time) ? state.time : state.elapsedMs / 1000;
      const dt = previousStateTime === null ? 0 : Math.max(0, Math.min(0.05, stateTime - previousStateTime));
      previousStateTime = stateTime;
      const advancing = state.mode === 'PLAYING' || state.mode === 'MENU';
      if (advancing && !state.reducedMotion) visualTime += dt;
      const time = state.reducedMotion ? 0 : visualTime;
      const lane = state.movement ? state.movement.lanePosition : (config.LANES - 1) / 2;
      const laneDelta = previousLane === null ? 0 : lane - previousLane;
      previousLane = lane;
      const laneSpeed = state.movement && Number.isFinite(state.movement.laneVelocity)
        ? state.movement.laneVelocity * 1000 : dt > 0 ? laneDelta / dt : 0;
      if (state.reducedMotion) bank = 0;
      // 姿态按真实横向速度和时间响应，低帧率时不会因单帧位移更大而反复侧倾。
      else if (advancing) bank += (Math.max(-0.035, Math.min(0.035, laneSpeed * -0.0035)) - bank)
        * (1 - Math.exp(-15 * dt));

      // 镜头和飞机共同跟随物理横移、跃升；道路以玩家纵向位置为局部原点。
      const playerX = laneX(lane, config.LANES);
      const playerHeight = playerWorldY(state);
      const groundY = state.terrainEnabled ? heightY(state.groundHeight || 0) : 0;
      const warp = wormholeFx ? wormholeFx.update(state, { time, playerX, playerHeight }) : null;
      const warping = Boolean(warp && warp.active);
      sunlight.position.x = playerX - 30;
      sunlight.position.y = groundY + 45;
      sunlight.target.position.x = playerX;
      sunlight.target.position.y = groundY;
      const nextShadowSignature = `${state.position}:${lane}:${playerHeight}:${state.tripleT > 0}:${state.mode}`;
      sunlight.shadow.needsUpdate = state.mode === 'PLAYING' || nextShadowSignature !== shadowSignature;
      shadowSignature = nextShadowSignature;
      const terrain = scope.Skyroads.flightTerrain;
      const behindGroundY = state.terrainEnabled && terrain
        ? heightY(terrain.heightAt(state.position - WORLD.cameraBack / WORLD.segmentDepth, lane)) : 0;
      camera.position.set(playerX, Math.max(WORLD.eyeHeight + playerHeight, behindGroundY + 1.2), WORLD.cameraBack);
      cameraTarget.set(playerX, playerHeight + 0.8, -WORLD.cameraLookAhead);
      camera.lookAt(cameraTarget);
      const nextFov = (camera.aspect < 1 ? 74 : 64) + (warp ? warp.fovOffset : 0);
      if (camera.fov !== nextFov) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
      sky.visible = !(warp && warp.hideScenery);
      sky.position.set(camera.position.x * 0.06, camera.position.y * 0.06, 0);
      if (orbitalEnvironment && typeof orbitalEnvironment.update === 'function') {
        orbitalEnvironment.update(state.position, state.terrainEnabled,
          { time, reducedMotion: state.reducedMotion, runId: state.runId, mode: state.mode });
      }
      if (ship) {
        // 折跃只驱动机体展开与喷流，不把视觉变身写回奖励或物理状态。
        if (warping) {
          Object.assign(warpShipState, state);
          warpShipState.tripleT = Math.max(1, state.tripleT || 0);
          warpShipState.boostT = Math.max(1, state.boostT || 0);
        }
        ship.update(warping ? warpShipState : state, config, { time, bank: warping ? 0 : bank * 6 });
        ship.group.position.set(playerX, playerHeight, warp ? warp.shipOffsetZ : 0);
        const tile = terrainTile(state, Math.floor(state.position), lane);
        const pitch = Math.atan2(heightY(tile.farHeight - tile.nearHeight), WORLD.segmentDepth);
        const groundedBlend = Math.max(0, Math.min(1, 1 - (state.playerY || 0) / 300));
        ship.group.rotation.x += pitch * groundedBlend;
      }

      for (const batch of batches) batch.count = 0;
      frameEntities = new Map();
      renderRoad(state, time);
      renderShots(state);
      clearSurface();
      if (magnetFx) magnetFx.update(state, time, ship ? ship.group : null);
      if (weapons) weapons.update(state, { dt, time, shipGroup: ship ? ship.group : null, viewportHeight });
      if (statusFx) statusFx.update(state, config, { dt, shipGroup: ship ? ship.group : null });
      renderDebris(state, dt);
      if (!warping) renderBoost(state, time);
      if (skyShow) {
        if (!warping) skyShow.update(state, { dt, camera,
          minimumWorldY: highestVisibleSurface + heightY(config.WALL_HIGH_HEIGHT || 2000) + 3 });
        if (warping || warp && warp.hideScenery) skyShow.group.visible = false;
      }
      if (weapons) weapons.group.visible = !(warp && warp.hideScenery);
      clippedInstances = 0;
      for (const batch of batches) {
        batch.mesh.visible = !(warp && warp.hideScenery);
        batch.mesh.count = batch.count;
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
        if (batch.count === batch.capacity) clippedInstances += 1;
      }
      renderer.render(scene, camera);
      lastFrameMs = performance.now() - startTime;
    }

    /** 更新逻辑视口与像素比；像素比上限控制高分屏的 GPU 开销。 */
    function resize(width, height, dpr = 1) {
      viewportWidth = Math.max(1, width);
      viewportHeight = Math.max(1, height);
      renderer.setPixelRatio(Math.min(1.75, Math.max(1, dpr)));
      if (galaxy) galaxy.setPixelRatio(renderer.getPixelRatio());
      renderer.setSize(viewportWidth, viewportHeight, false);
      camera.aspect = viewportWidth / viewportHeight;
      camera.fov = camera.aspect < 1 ? 74 : 64;
      camera.updateProjectionMatrix();
    }

    /** 返回真实帧统计与物理对齐信息，供诊断和验收使用。 */
    function getDiagnostics() {
      let shipScreen = null;
      if (ship) {
        const shipCenter = ship.group.getWorldPosition(new THREE.Vector3());
        shipCenter.y += 0.85;
        shipCenter.project(camera);
        shipScreen = { x: (shipCenter.x + 1) / 2, y: (1 - shipCenter.y) / 2 };
      }
      return {
        renderer: 'webgl-chase',
        revision: THREE.REVISION,
        width: viewportWidth,
        height: viewportHeight,
        pixelRatio: renderer.getPixelRatio(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        visibleSegments,
        clippedInstances,
        frameCpuMs: Number(lastFrameMs.toFixed(2)),
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
        cameraTarget: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
        ship: ship ? ship.getDiagnostics() : null,
        shipScreen,
        terrain: {
          enabled: Boolean(currentState && currentState.terrainEnabled),
          groundHeight: currentState ? currentState.groundHeight || 0 : 0,
          playerWorldY: currentState ? playerWorldY(currentState) : 0,
          raisedTiles: raisedTileCount,
          highestVisibleSurface,
        },
        lanePosition: currentState && currentState.movement ? currentState.movement.lanePosition : null,
        contextLost,
        disposed,
        environmentLighting,
        shadows: { enabled: shadowsEnabled, mapSize: 1024, type: 'PCFSoft', nearObstacleOnly: true },
        orbitalEnvironment: orbitalEnvironment ? orbitalEnvironment.getDiagnostics() : null,
        galaxy: galaxy ? galaxy.getDiagnostics() : null,
        obstacleModels: obstacleModels ? obstacleModels.getDiagnostics() : null,
        objectModels: flightObjects ? flightObjects.getDiagnostics() : null,
        weapons: weapons ? weapons.getDiagnostics() : null,
        statusFx: statusFx ? statusFx.getDiagnostics() : null,
        magnetFx: magnetFx ? magnetFx.getDiagnostics() : null,
        skyShow: skyShow ? skyShow.getDiagnostics() : null,
        wormhole: wormholeFx ? wormholeFx.getDiagnostics() : null,
      };
    }

    /** 释放几何、材质及上下文监听；不会持有游戏计时器或输入监听。 */
    function dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', loseContext, false);
      if (weapons) weapons.dispose();
      if (wormholeFx) wormholeFx.dispose();
      scene.environment = null;
      for (const batch of batches) batch.mesh.dispose();
      for (const resource of resources) resource.dispose();
      renderer.dispose();
      scene.clear();
    }

    return { render, resize, dispose, getDiagnostics,
      getSkyAudioCue: () => !disposed && !contextLost && skyShow
        && !(currentState && currentState.wormhole && currentState.wormhole.active) ? skyShow.getAudioCue() : null };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightRenderer = Object.freeze({
    create,
    WORLD,
    coordinates: Object.freeze({ laneX, segmentZ, heightY, enemyLane, playerWorldY, tileSurfaceY }),
  });
})(globalThis);
