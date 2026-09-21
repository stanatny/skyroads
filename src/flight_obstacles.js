'use strict';

// 障碍模型在初始化时合并几何，运行时只提交实例矩阵。
(function attachFlightObstacles(scope) {
  const COLORS = Object.freeze({
    steel: 0x70818b,
    armor: 0x566975,
    ceramic: 0xa3aaa7,
    dark: 0x24343f,
    recess: 0x11242e,
    graphite: 0x334953,
    copper: 0xb38a57,
    cyan: 0x72dfe7,
    core: 0x347a96,
    amber: 0xffc36b,
    red: 0xe26a53,
  });

  /**
   * 创建三档工业障碍模型。
   * 参数包含 Three.js、资源登记器、实例批次工厂、世界比例和物理配置。
   * 返回 add(type, x, z, index) 与只读模型诊断；资源由调用方统一释放。
   */
  function create({ THREE, own, makeBatch, world, config, hitbox }) {
    const width = world.laneWidth * ((hitbox && hitbox.wallHalfWidth) || 0.42) * 2;
    const depth = world.segmentDepth;
    const capacity = (config.RENDER_DISTANCE || 120) * (config.LANES || 7);
    const nearDistance = 116;
    const solidMaterial = own(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.46,
      emissive: 0x0b1620,
      emissiveIntensity: 0.18,
    }));
    const lightMaterial = own(new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, toneMapped: false,
    }));
    const models = {};
    const specifications = {
      WALL_LOW: { height: config.WALL_LOW_HEIGHT || 600, build: buildLow },
      WALL_MEDIUM: { height: config.WALL_MEDIUM_HEIGHT || 1250, build: buildMedium },
      WALL_HIGH: { height: config.WALL_HIGH_HEIGHT || 2000, build: buildHigh },
    };

    for (const [type, specification] of Object.entries(specifications)) {
      const height = specification.height * world.heightScale;
      models[type] = { height, levels: {} };
      for (const level of ['near', 'far']) {
        const builder = createBuilder(THREE);
        specification.build(builder, width, height, depth, level === 'near');
        const geometry = builder.finish({ width, height, depth });
        const solid = own(geometry.solid);
        const lights = own(geometry.lights);
        const key = `${type.toLowerCase()}_${level}`;
        models[type].levels[level] = {
          solid: makeBatch(`${key}_body`, solid, solidMaterial, capacity),
          lights: makeBatch(`${key}_signal`, lights, lightMaterial, capacity),
          diagnostics: {
            triangles: (solid.getAttribute('position').count + lights.getAttribute('position').count) / 3,
            bounds: geometry.bounds,
          },
        };
      }
    }

    function add(type, x, z) {
      const model = models[type];
      if (!model) return;
      const level = model.levels[-z < nearDistance ? 'near' : 'far'];
      level.solid.add(x, 0, z);
      level.lights.add(x, 0, z);
    }

    function getDiagnostics() {
      const result = {};
      for (const [type, model] of Object.entries(models)) {
        result[type] = {
          height: model.height,
          near: model.levels.near.diagnostics,
          far: model.levels.far.diagnostics,
        };
      }
      return { width, depth, capacity, nearDistance, models: result };
    }

    return { add, getDiagnostics };
  }

  function buildLow(b, width, height, depth, detailed) {
    const w = width;
    const h = height;
    const d = depth;
    // 楔形背甲向后下降；近端保持陡峭的阻挡立面，不伪装成可驶上的坡道。
    b.prism([
      [-d * 0.49, h * 0.09], [d * 0.49, h * 0.09], [d * 0.49, h * 0.25],
      [d * 0.435, h * 0.96], [d * 0.24, h * 0.995], [-d * 0.49, h * 0.43],
    ], w * 0.94, COLORS.armor, 0.025);
    for (const side of [-1, 1]) {
      b.box(side * w * 0.36, h * 0.09, d * 0.33, w * 0.27, h * 0.18, d * 0.33, COLORS.dark, 0.028);
      b.box(side * w * 0.36, h * 0.09, -d * 0.33, w * 0.27, h * 0.18, d * 0.25, COLORS.dark, 0.025);
      b.prism([
        [-d * 0.45, h * 0.38], [d * 0.42, h * 0.91], [d * 0.45, h * 0.73], [-d * 0.45, h * 0.23],
      ], w * 0.055, COLORS.steel, 0, side * w * 0.457);
    }
    const tilt = -0.15;
    const panelY = h * 0.59;
    const panelZ = d * 0.465;
    b.box(0, panelY, panelZ, w * 0.80, h * 0.63, 0.085, COLORS.steel, 0.026, tilt);
    b.box(0, panelY, panelZ + 0.047, w * 0.69, h * 0.49, 0.022, COLORS.graphite, 0.016, tilt);
    // 一条青带对应一段跳；信号几何在近远两档始终存在。
    b.box(0, h * 0.75, panelZ + 0.08 - (h * 0.75 - panelY) * 0.15,
      w * 0.78, h * 0.05, 0.047, COLORS.cyan, 0, tilt, 0, 0, true);
    b.box(0, h * 0.26, d * 0.49, w * 0.88, h * 0.10, 0.035, COLORS.copper);
    if (!detailed) return;

    for (const side of [-1, 1]) {
      b.box(side * w * 0.385, h * 0.57, d * 0.469, w * 0.055, h * 0.57, 0.12, COLORS.ceramic, 0.013, tilt);
      for (const yRatio of [0.36, 0.83]) {
        const y = h * yRatio;
        const z = panelZ + 0.12 - (y - panelY) * 0.15;
        b.cylinder(side * w * 0.34, y, z, 0.058, 0.03, COLORS.dark, Math.PI / 2 + tilt, 8);
        b.cylinder(side * w * 0.34, y, z + 0.020, 0.035, 0.037, COLORS.ceramic, Math.PI / 2 + tilt, 6);
      }
      for (let slot = 0; slot < 4; slot += 1) {
        const x = side * (w * 0.17 + slot * w * 0.037);
        b.box(x, h * 0.52, panelZ + 0.079, w * 0.02, h * 0.18, 0.025, COLORS.recess, 0, tilt);
      }
      b.box(side * w * 0.30, h * 0.12, d * 0.49, w * 0.18, h * 0.085, 0.025, COLORS.steel);
      b.box(side * w * 0.30, h * 0.12, d * 0.498, w * 0.035, h * 0.09, 0.012, COLORS.amber, 0, 0, 0, 0, true);
    }
    for (let stripe = -2; stripe <= 2; stripe += 1) {
      b.box(stripe * w * 0.085, h * 0.265, d * 0.496, w * 0.038, h * 0.10, 0.016,
        COLORS.dark, 0, 0, 0, -0.30);
    }
    b.box(0, h * 0.58, panelZ + 0.11, w * 0.14, h * 0.16, 0.05, COLORS.ceramic, 0.016, tilt);
    b.box(0, h * 0.58, panelZ + 0.15, w * 0.075, h * 0.046, 0.012, COLORS.dark, 0, tilt);
    for (let slot = 0; slot < 4; slot += 1) {
      b.box((slot - 1.5) * w * 0.13, h * 0.91, d * 0.17, w * 0.045, 0.025,
        d * 0.21, COLORS.dark, 0, 0.31);
    }
  }

  function buildMedium(b, width, height, depth, detailed) {
    const w = width;
    const h = height;
    const d = depth;
    b.box(0, h * 0.055, 0, w * 0.97, h * 0.11, d * 0.98, COLORS.dark, 0.035);
    b.box(0, h * 0.50, -d * 0.13, w * 0.61, h * 0.81, d * 0.63, COLORS.graphite, 0.075);
    b.box(0, h * 0.91, -0.05, w * 0.93, h * 0.135, d * 0.89, COLORS.steel, 0.045);
    for (const side of [-1, 1]) {
      b.box(side * w * 0.37, h * 0.47, -0.01, w * 0.24, h * 0.74, d * 0.80, COLORS.armor, 0.055);
      b.box(side * w * 0.40, h * 0.48, d * 0.425, w * 0.13, h * 0.69, 0.19, COLORS.steel, 0.025);
      b.box(side * w * 0.39, h * 0.13, d * 0.47, w * 0.16, h * 0.12, 0.11, COLORS.copper, 0.02);
    }
    // 核心与外环之间留出真实深度；背板在后方，前方没有遮住凹舱的整块盒子。
    const coreY = h * 0.52;
    const coreZ = d * 0.39;
    const radius = w * 0.263;
    b.cylinder(0, coreY, coreZ - 0.13, radius * 0.86, 0.20, COLORS.graphite, Math.PI / 2, 16);
    b.cylinder(0, coreY, coreZ - 0.017, radius * 0.68, 0.04, COLORS.core, Math.PI / 2, 20, true);
    b.ring(0, coreY, coreZ + 0.11, radius, radius * 0.155, COLORS.steel, detailed ? 24 : 12);
    b.ring(0, coreY, coreZ + 0.06, radius * 0.71, radius * 0.043, COLORS.cyan, detailed ? 24 : 12, true);
    b.cylinder(0, coreY, coreZ + 0.02, radius * 0.22, 0.12, COLORS.ceramic, Math.PI / 2, 8);
    b.cylinder(0, coreY, coreZ + 0.091, radius * 0.11, 0.018, COLORS.cyan, Math.PI / 2, 8, true);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      b.box(Math.sin(angle) * radius * 0.44, coreY + Math.cos(angle) * radius * 0.44,
        coreZ + 0.012, radius * 0.14, radius * 0.41, 0.06, COLORS.armor, 0, 0, 0, -angle);
    }
    b.box(0, h * 0.8275, d * 0.437, w * 0.87, h * 0.10, 0.18, COLORS.graphite, 0.020);
    for (const yRatio of [0.80, 0.85]) {
      b.box(0, h * yRatio, d * 0.463, w * 0.83, h * 0.022, 0.06, COLORS.cyan, 0, 0, 0, 0, true);
    }
    b.box(0, h * 0.175, d * 0.45, w * 0.65, h * 0.13, 0.13, COLORS.steel, 0.02);
    if (!detailed) return;

    for (const side of [-1, 1]) {
      for (let fin = 0; fin < 7; fin += 1) {
        b.box(side * w * 0.375, h * (0.26 + fin * 0.07), d * 0.466,
          w * 0.22, h * 0.022, d * 0.048, fin % 2 ? COLORS.dark : COLORS.graphite, 0.006);
      }
      const pipeX = side * w * 0.27;
      b.pipe([pipeX, h * 0.18, d * 0.47], [pipeX, h * 0.29, d * 0.47], 0.052, COLORS.copper);
      b.pipe([pipeX, h * 0.29, d * 0.47], [side * w * 0.15, h * 0.345, d * 0.43], 0.052, COLORS.copper);
      b.cylinder(pipeX, h * 0.21, d * 0.471, 0.068, 0.11, COLORS.dark, 0, 8);
      for (let index = 0; index < 3; index += 1) {
        b.box(side * w * 0.20, h * (0.92 + index * 0.016), -d * 0.09,
          w * 0.025, h * 0.018, d * 0.62, COLORS.dark);
      }
      for (const yRatio of [0.19, 0.74]) {
        b.cylinder(side * w * 0.41, h * yRatio, d * 0.486, 0.035, 0.03, COLORS.ceramic, Math.PI / 2, 6);
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2 + Math.PI / 8;
      b.cylinder(Math.sin(angle) * radius, coreY + Math.cos(angle) * radius,
        coreZ + radius * 0.17, 0.042, 0.045, COLORS.ceramic, Math.PI / 2, 6);
    }
    for (let slot = -2; slot <= 2; slot += 1) {
      b.box(slot * w * 0.085, h * 0.175, d * 0.472, w * 0.035, h * 0.072, 0.026, COLORS.dark);
    }
    b.box(w * 0.18, h * 0.69, d * 0.45, w * 0.09, h * 0.065, 0.07, COLORS.copper, 0.009);
  }

  function buildHigh(b, width, height, depth, detailed) {
    const w = width;
    const h = height;
    const d = depth;
    b.box(0, h * 0.045, 0, w * 0.985, h * 0.09, d * 0.99, COLORS.dark, 0.035);
    b.box(0, h * 0.46, -0.02, w * 0.51, h * 0.78, d * 0.77, COLORS.armor, 0.075);
    b.box(0, h * 0.48, d * 0.408, w * 0.47, h * 0.70, 0.14, COLORS.steel, 0.035);
    for (const side of [-1, 1]) {
      b.box(side * w * 0.38, h * 0.44, d * 0.28, w * 0.08, h * 0.72, d * 0.16, COLORS.ceramic, 0.019);
      for (const yRatio of [0.28, 0.66]) {
        b.box(side * w * 0.34, h * yRatio, -d * 0.10, w * 0.28, h * 0.23, d * 0.68, COLORS.graphite, 0.06);
        b.box(side * w * 0.34, h * yRatio, d * 0.265, w * 0.23, h * 0.18, 0.15, COLORS.armor, 0.027);
      }
      b.prism([
        [-d * 0.48, h * 0.05], [d * 0.48, h * 0.05], [d * 0.42, h * 0.23],
        [d * 0.06, h * 0.13], [-d * 0.48, h * 0.13],
      ], w * 0.16, COLORS.armor, 0.014, side * w * 0.40);
    }
    for (const yRatio of [0.18, 0.45, 0.74]) {
      b.box(0, h * yRatio, 0, w * 0.64, h * 0.048, d * 0.91, COLORS.dark, 0.018);
      b.box(0, h * yRatio, d * 0.46, w * 0.60, h * 0.026, 0.07, COLORS.copper);
    }
    // 顶部切角帽和金色信标明确表示不可用普通双跳越过。
    b.prism([
      [-d * 0.38, h * 0.79], [d * 0.39, h * 0.79], [d * 0.33, h * 0.885],
      [d * 0.19, h * 0.93], [-d * 0.28, h * 0.93],
    ], w * 0.72, COLORS.steel, 0.032);
    b.box(0, h * 0.853, d * 0.365, w * 0.52, h * 0.065, 0.13, COLORS.graphite, 0.018);
    b.box(0, h * 0.86, d * 0.39, w * 0.40, h * 0.018, 0.04, COLORS.amber, 0, 0, 0, 0, true);
    b.cylinder(0, h * 0.936, 0, w * 0.21, h * 0.035, COLORS.dark, 0, 12);
    b.cylinder(0, h * 0.974, 0, w * 0.07, h * 0.048, COLORS.amber, 0, 8, true);
    b.cylinder(0, h * 0.995, 0, w * 0.10, h * 0.008, COLORS.steel, 0, 8);
    if (!detailed) return;

    for (const side of [-1, 1]) {
      for (const yRatio of [0.25, 0.54]) {
        b.pipe([side * w * 0.13, h * (yRatio - 0.04), d * 0.463],
          [side * w * 0.38, h * (yRatio + 0.14), d * 0.35], 0.059, COLORS.ceramic);
      }
      for (const yRatio of [0.28, 0.66]) {
        for (let slot = 0; slot < 4; slot += 1) {
          b.box(side * w * 0.345, h * (yRatio - 0.055 + slot * 0.035), d * 0.29,
            w * 0.17, h * 0.016, 0.031, COLORS.recess);
        }
        b.box(side * w * 0.42, h * (yRatio + 0.063), d * 0.29,
          w * 0.031, h * 0.065, 0.043, COLORS.red, 0, 0, 0, 0, true);
      }
      for (const yRatio of [0.16, 0.46, 0.76]) {
        b.cylinder(side * w * 0.205, h * yRatio, d * 0.477, 0.042, 0.036, COLORS.ceramic, Math.PI / 2, 6);
      }
      b.pipe([side * w * 0.215, h * 0.51, d * 0.43],
        [side * w * 0.215, h * 0.65, d * 0.43], 0.035, COLORS.copper);
    }
    b.box(0, h * 0.59, d * 0.436, w * 0.27, h * 0.18, 0.054, COLORS.dark, 0.018);
    for (let slot = 0; slot < 5; slot += 1) {
      b.box(0, h * (0.525 + slot * 0.030), d * 0.447, w * 0.19, h * 0.013, 0.024, COLORS.graphite);
    }
    b.box(0, h * 0.34, d * 0.448, w * 0.22, h * 0.11, 0.05, COLORS.ceramic, 0.018);
    b.box(0, h * 0.34, d * 0.46, w * 0.10, h * 0.02, 0.025, COLORS.dark);
  }

  function createBuilder(THREE) {
    const parts = { solid: [], lights: [] };
    const color = new THREE.Color();
    const transform = new THREE.Object3D();

    function add(geometry, tint, position, rotation = [0, 0, 0], luminous = false) {
      const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      geometry.dispose();
      transform.position.set(...position);
      transform.rotation.set(...rotation);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      part.applyMatrix4(transform.matrix);
      color.set(tint);
      const colors = new Float32Array(part.getAttribute('position').count * 3);
      for (let offset = 0; offset < colors.length; offset += 3) {
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      }
      part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts[luminous ? 'lights' : 'solid'].push(part);
    }

    function box(x, y, z, width, height, depth, tint, bevel = 0, rx = 0, ry = 0, rz = 0, luminous = false) {
      let geometry;
      if (bevel > 0) {
        const edge = Math.min(bevel, width * 0.12, height * 0.12, depth * 0.20);
        const shape = new THREE.Shape();
        const left = -width / 2 + edge;
        const right = width / 2 - edge;
        const bottom = -height / 2 + edge;
        const top = height / 2 - edge;
        shape.moveTo(left, bottom);
        shape.lineTo(right, bottom);
        shape.lineTo(right, top);
        shape.lineTo(left, top);
        shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape, {
          depth: depth - edge * 2, bevelEnabled: true, bevelSize: edge,
          bevelThickness: edge, bevelSegments: 1, steps: 1,
        });
        geometry.translate(0, 0, -depth / 2 + edge);
      } else geometry = new THREE.BoxGeometry(width, height, depth);
      add(geometry, tint, [x, y, z], [rx, ry, rz], luminous);
    }

    function prism(profile, width, tint, bevel = 0, offsetX = 0) {
      const shape = new THREE.Shape();
      profile.forEach(([z, y], index) => {
        if (index === 0) shape.moveTo(-z, y);
        else shape.lineTo(-z, y);
      });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel,
        bevelThickness: bevel, bevelSegments: 1, steps: 1,
      });
      geometry.translate(0, 0, -width / 2 + bevel);
      geometry.rotateY(Math.PI / 2);
      add(geometry, tint, [offsetX, 0, 0]);
    }

    function cylinder(x, y, z, radius, height, tint, rx = 0, segments = 8, luminous = false) {
      add(new THREE.CylinderGeometry(radius, radius, height, segments), tint, [x, y, z], [rx, 0, 0], luminous);
    }

    function ring(x, y, z, radius, tube, tint, segments, luminous = false) {
      add(new THREE.TorusGeometry(radius, tube, 5, segments), tint, [x, y, z], [0, 0, 0], luminous);
    }

    function pipe(from, to, radius, tint) {
      const start = new THREE.Vector3(...from);
      const end = new THREE.Vector3(...to);
      const geometry = new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 7);
      const center = start.clone().add(end).multiplyScalar(0.5);
      const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), end.sub(start).normalize(),
      );
      geometry.applyQuaternion(rotation);
      add(geometry, tint, center.toArray());
    }

    function finish({ width, height, depth }) {
      const merged = {};
      const bound = new THREE.Box3();
      for (const [kind, geometries] of Object.entries(parts)) {
        const count = geometries.reduce((total, geometry) => total + geometry.getAttribute('position').count, 0);
        const geometry = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'color']) {
          const data = new Float32Array(count * 3);
          let offset = 0;
          for (const part of geometries) {
            const values = part.getAttribute(name).array;
            data.set(values, offset);
            offset += values.length;
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(data, 3));
        }
        geometry.computeBoundingBox();
        bound.union(geometry.boundingBox);
        merged[kind] = geometry;
        for (const part of geometries) part.dispose();
      }
      // 同一刚性包络缩放近远模型：倒角、铆钉和信标也不得越出实际碰撞范围。
      const sx = width / (bound.max.x - bound.min.x);
      const sy = height / (bound.max.y - bound.min.y);
      const sz = depth / (bound.max.z - bound.min.z);
      const finalBounds = new THREE.Box3();
      for (const geometry of Object.values(merged)) {
        geometry.translate(-(bound.min.x + bound.max.x) / 2, -bound.min.y, -(bound.min.z + bound.max.z) / 2);
        geometry.scale(sx, sy, sz);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        finalBounds.union(geometry.boundingBox);
      }
      return {
        ...merged,
        bounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
      };
    }

    return { box, prism, cylinder, ring, pipe, finish };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightObstacles = Object.freeze({ create });
})(globalThis);
