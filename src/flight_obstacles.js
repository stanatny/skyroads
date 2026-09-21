'use strict';

// 障碍模型在初始化时合并几何，运行时只提交实例矩阵。
(function attachFlightObstacles(scope) {
  const COLORS = Object.freeze({
    steel: 0xa7bdcd,
    armor: 0x245aab,
    ceramic: 0xe5e3d4,
    dark: 0x17242f,
    recess: 0x09151e,
    graphite: 0x354553,
    copper: 0x97754e,
    cyan: 0x80dce5,
    core: 0x368bae,
    amber: 0xf5bd63,
    hazard: 0xffad4e,
    red: 0xff574a,
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
      roughness: 0.43,
      metalness: 0.32,
      emissive: 0x0b1620,
      emissiveIntensity: 0.08,
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

    function add(type, x, z, index = 0, time = 0) {
      const model = models[type];
      if (!model) return;
      const level = model.levels[-z < nearDistance ? 'near' : 'far'];
      level.solid.add(x, 0, z);
      // 高塔红色障碍灯缓慢脉动，中墙核心轻微呼吸；减少动态效果时 time 恒为 0，保持静态相位。
      const pulse = type === 'WALL_HIGH' ? 0.70 + 0.30 * Math.sin(time * 2.8 + index * 1.7)
        : type === 'WALL_MEDIUM' ? 0.86 + 0.14 * Math.sin(time * 2.1 + index * 1.3) : 1;
      const channel = Math.round(255 * pulse);
      level.lights.add(x, 0, z, 1, 1, 1, 0, 0, 0, (channel << 16) | (channel << 8) | channel);
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

  function buildLow(b, w, h, d, detailed) {
    // 装甲闸机采用真正的错层截面；前缘垂直阻挡，斜背甲不暗示可驾驶的坡道。
    b.hull([
      { y: 0, width: w * 0.97, depth: d * 0.96 },
      { y: h * 0.12, width: w, depth: d },
      { y: h * 0.23, width: w * 0.88, depth: d * 0.91 },
    ], COLORS.dark);
    b.hull([
      { y: h * 0.18, width: w * 0.91, depth: d * 0.85, z: -d * 0.025 },
      { y: h * 0.88, width: w * 0.82, depth: d * 0.60, z: -d * 0.05 },
      { y: h * 0.97, width: w * 0.72, depth: d * 0.53, z: -d * 0.07 },
    ], COLORS.graphite);
    for (const side of [-1, 1]) {
      // 陶瓷肩甲和蓝色前装甲形成大色块，凹槽与结构件只占次要面积。
      b.hull([
        { x: side * w * 0.335, y: h * 0.20, width: w * 0.27, depth: d * 0.87 },
        { x: side * w * 0.315, y: h * 0.73, width: w * 0.24, depth: d * 0.76, z: -d * 0.025 },
        { x: side * w * 0.29, y: h, width: w * 0.20, depth: d * 0.47, z: -d * 0.085 },
      ], COLORS.ceramic);
      b.prism([
        [d * 0.47, h * 0.22], [d * 0.47, h * 0.47], [d * 0.31, h * 0.91],
        [d * 0.18, h * 0.94], [d * 0.22, h * 0.57], [d * 0.35, h * 0.22],
      ], w * 0.34, COLORS.armor, 0.022, side * w * 0.185);
      b.box(side * w * 0.40, h * 0.21, d * 0.36, w * 0.13, h * 0.18,
        d * 0.20, COLORS.steel, 0.025);
      b.box(side * w * 0.402, h * 0.29, d * 0.402, w * 0.066, h * 0.10,
        0.055, COLORS.hazard, 0, 0, 0, 0, true);
    }
    b.box(0, h * 0.53, d * 0.355, w * 0.11, h * 0.57, d * 0.12, COLORS.recess, 0.024, -0.34);
    b.box(0, h * 0.38, d * 0.447, w * 0.84, h * 0.115, 0.105, COLORS.dark, 0.018);
    // 保留一条连续青色横带，远处也能识别单跳高度。
    b.box(0, h * 0.39, d * 0.47, w * 0.80, h * 0.035, 0.055, COLORS.cyan, 0, 0, 0, 0, true);
    b.box(0, h * 0.865, -d * 0.29, w * 0.46, h * 0.13, d * 0.24, COLORS.dark, 0.024);
    if (!detailed) return;

    for (const side of [-1, 1]) {
      b.pipe([side * w * 0.41, h * 0.27, d * 0.28],
        [side * w * 0.34, h * 0.78, d * 0.14], w * 0.024, COLORS.steel);
      b.cylinder(side * w * 0.40, h * 0.30, d * 0.44, w * 0.058, 0.12,
        COLORS.graphite, Math.PI / 2, 10);
      b.cylinder(side * w * 0.40, h * 0.30, d * 0.51, w * 0.026, 0.025,
        COLORS.steel, Math.PI / 2, 8);
      for (let slot = 0; slot < 4; slot += 1) {
        b.box(side * w * 0.185, h * (0.57 + slot * 0.056), d * (0.450 - slot * 0.0204),
          w * 0.23, h * 0.016, 0.026, COLORS.recess, 0, -0.34);
      }
      b.box(side * w * 0.322, h * 0.89, -d * 0.018, w * 0.045, h * 0.08,
        d * 0.21, COLORS.steel, 0.008, 0.24);
      b.box(side * w * 0.165, h * 0.79, d * 0.37, w * 0.093, h * 0.075,
        0.033, COLORS.ceramic, 0.008, -0.34);
    }
    for (let fin = 0; fin < 6; fin += 1) {
      b.box((fin - 2.5) * w * 0.065, h * 0.89, -d * 0.29,
        w * 0.022, h * 0.12, d * 0.23, COLORS.steel, 0.005);
    }
    for (let stripe = -2; stripe <= 2; stripe += 1) {
      b.box(stripe * w * 0.12, h * 0.115, d * 0.505, w * 0.055, h * 0.04,
        0.016, COLORS.copper, 0, 0, 0, -0.35);
    }
  }

  function buildMedium(b, w, h, d, detailed) {
    // 电站采用偏置涡轮舱与独立冷却组件，不把所有机械细节贴在同一平面上。
    b.hull([
      { y: 0, width: w * 0.96, depth: d * 0.96 },
      { y: h * 0.09, width: w, depth: d },
      { y: h * 0.16, width: w * 0.92, depth: d * 0.89 },
    ], COLORS.dark);
    b.hull([
      { x: -w * 0.10, y: h * 0.12, width: w * 0.70, depth: d * 0.80, z: -d * 0.075 },
      { x: -w * 0.10, y: h * 0.84, width: w * 0.70, depth: d * 0.72, z: -d * 0.075 },
      { x: -w * 0.14, y: h * 0.965, width: w * 0.57, depth: d * 0.56, z: -d * 0.10 },
    ], COLORS.armor);
    b.box(-w * 0.135, h * 0.49, d * 0.288, w * 0.55, h * 0.54,
      d * 0.085, COLORS.recess, 0.035);
    const coreX = -w * 0.135;
    const coreY = h * 0.52;
    const coreZ = d * 0.365;
    const radius = w * 0.253;
    b.cylinder(coreX, coreY, coreZ - 0.13, radius * 0.84, 0.06,
      COLORS.dark, Math.PI / 2, detailed ? 24 : 12);
    b.ring(coreX, coreY, coreZ, radius, radius * 0.16,
      COLORS.ceramic, detailed ? 24 : 12);
    b.ring(coreX, coreY, coreZ - 0.06, radius * 0.80, radius * 0.065,
      COLORS.copper, detailed ? 20 : 12);
    b.ring(coreX, coreY, coreZ - 0.075, radius * 0.65, radius * 0.027,
      COLORS.amber, detailed ? 20 : 12, true);
    for (let blade = 0; blade < (detailed ? 9 : 6); blade += 1) {
      const angle = blade / (detailed ? 9 : 6) * Math.PI * 2;
      b.box(coreX + Math.sin(angle) * radius * 0.43,
        coreY + Math.cos(angle) * radius * 0.43, coreZ - 0.074,
        radius * 0.16, radius * 0.42, 0.035, COLORS.steel, 0, 0, 0, -angle - 0.40);
    }
    b.cylinder(coreX, coreY, coreZ - 0.024, radius * 0.25, 0.14,
      COLORS.armor, Math.PI / 2, 12);
    b.cylinder(coreX, coreY, coreZ + 0.055, radius * 0.083, 0.03,
      COLORS.core, Math.PI / 2, 8, true);
    // 厚实的陶瓷前檐和两条等级信号带，在远景仍保留结构遮挡和阴影。
    b.hull([
      { x: -w * 0.095, y: h * 0.80, width: w * 0.74, depth: d * 0.85, z: -d * 0.01 },
      { x: -w * 0.095, y: h * 0.92, width: w * 0.74, depth: d * 0.85, z: -d * 0.01 },
      { x: -w * 0.11, y: h, width: w * 0.58, depth: d * 0.63, z: -d * 0.07 },
    ], COLORS.ceramic);
    b.box(-w * 0.095, h * 0.853, d * 0.423, w * 0.64, h * 0.071,
      0.055, COLORS.dark, 0.01);
    for (const yRatio of [0.84, 0.868]) {
      b.box(-w * 0.095, h * yRatio, d * 0.434, w * 0.57, h * 0.012,
        0.042, COLORS.cyan, 0, 0, 0, 0, true);
    }
    b.hull([
      { x: w * 0.345, y: h * 0.12, width: w * 0.23, depth: d * 0.79 },
      { x: w * 0.345, y: h * 0.63, width: w * 0.23, depth: d * 0.71, z: -d * 0.025 },
      { x: w * 0.345, y: h * 0.74, width: w * 0.19, depth: d * 0.62, z: -d * 0.05 },
    ], COLORS.ceramic);
    b.cylinder(w * 0.345, h * 0.47, d * 0.365, w * 0.095, h * 0.54,
      COLORS.steel, 0, detailed ? 12 : 8);
    b.cylinder(w * 0.345, h * 0.725, d * 0.365, w * 0.10, h * 0.065,
      COLORS.armor, 0, 10);
    b.box(coreX, h * 0.19, d * 0.385, w * 0.53, h * 0.12,
      d * 0.14, COLORS.steel, 0.024);
    b.box(coreX, h * 0.19, d * 0.46, w * 0.31, h * 0.018,
      0.025, COLORS.hazard, 0, 0, 0, 0, true);
    if (!detailed) return;

    for (let rib = 0; rib < 6; rib += 1) {
      b.cylinder(w * 0.345, h * (0.27 + rib * 0.07), d * 0.365,
        w * 0.114, h * 0.025, COLORS.graphite, 0, 12);
    }
    b.pipe([w * 0.27, h * 0.66, d * 0.32], [w * 0.18, h * 0.72, d * 0.36],
      w * 0.020, COLORS.copper);
    b.pipe([w * 0.18, h * 0.72, d * 0.36], [w * 0.18, h * 0.77, d * 0.34],
      w * 0.020, COLORS.copper);
    b.pipe([w * 0.27, h * 0.20, d * 0.38], [w * 0.12, h * 0.25, d * 0.38],
      w * 0.017, COLORS.copper);
    for (const side of [-1, 1]) {
      const x = coreX + side * w * 0.27;
      b.box(x, h * 0.52, d * 0.37, w * 0.037, h * 0.48,
        0.10, COLORS.steel, 0.009);
      for (const yRatio of [0.30, 0.74]) {
        b.cylinder(x, h * yRatio, d * 0.43, w * 0.022, 0.045,
          COLORS.dark, Math.PI / 2, 6);
      }
    }
    for (let louver = 0; louver < 5; louver += 1) {
      b.box(-w * 0.12 + (louver - 2) * w * 0.086, h * 0.978, -d * 0.10,
        w * 0.042, 0.030, d * 0.38, COLORS.graphite, 0.005);
    }
    for (let lug = 0; lug < 6; lug += 1) {
      const angle = lug / 6 * Math.PI * 2;
      b.cylinder(coreX + Math.sin(angle) * radius, coreY + Math.cos(angle) * radius,
        coreZ + radius * 0.16, w * 0.017, 0.025, COLORS.graphite, Math.PI / 2, 6);
    }
  }

  function buildHigh(b, w, h, d, detailed) {
    // 防御塔的承重基座、退台核心和不等高扶壁共同形成剪影，灯光只强调凹层。
    b.hull([
      { y: 0, width: w * 0.94, depth: d * 0.94 },
      { y: h * 0.08, width: w, depth: d },
      { y: h * 0.18, width: w * 0.80, depth: d * 0.82 },
    ], COLORS.graphite);
    b.hull([
      { x: -w * 0.03, y: h * 0.13, width: w * 0.64, depth: d * 0.70, z: -d * 0.10 },
      { x: -w * 0.03, y: h * 0.72, width: w * 0.64, depth: d * 0.70, z: -d * 0.10 },
      { x: -w * 0.065, y: h * 0.89, width: w * 0.51, depth: d * 0.57, z: -d * 0.045 },
      { x: -w * 0.065, y: h * 0.94, width: w * 0.46, depth: d * 0.52, z: -d * 0.06 },
    ], COLORS.dark);
    for (const side of [-1, 1]) {
      const top = side === -1 ? 0.68 : 0.55;
      b.hull([
        { x: side * w * 0.345, y: h * 0.12, width: w * 0.26, depth: d * 0.84 },
        { x: side * w * 0.345, y: h * (top - 0.14), width: w * 0.26, depth: d * 0.73, z: -d * 0.035 },
        { x: side * w * 0.315, y: h * top, width: w * 0.17, depth: d * 0.46, z: -d * 0.14 },
      ], COLORS.armor);
      b.hull([
        { x: side * w * 0.365, y: h * 0.18, width: w * 0.105, depth: d * 0.15, z: d * 0.355 },
        { x: side * w * 0.355, y: h * (top - 0.19), width: w * 0.10, depth: d * 0.14, z: d * 0.25 },
        { x: side * w * 0.315, y: h * (top - 0.035), width: w * 0.08, depth: d * 0.11, z: d * 0.085 },
      ], COLORS.ceramic);
    }
    // 四层后退的前舱让窗带处于真实凹槽，外侧陶瓷柱连续承接顶部冠梁。
    for (let floor = 0; floor < 4; floor += 1) {
      const y = h * (0.26 + floor * 0.147);
      const front = d * (0.365 - floor * 0.022);
      b.box(-w * 0.035, y, front, w * 0.43, h * 0.09,
        d * 0.115, COLORS.ceramic, 0.027);
      b.box(-w * 0.035, y + h * 0.062, front - d * 0.035, w * 0.41, h * 0.035,
        0.035, COLORS.recess, 0.006);
      b.box(-w * 0.035, y + h * 0.061, front - d * 0.026, w * 0.31, h * 0.010,
        0.025, floor === 3 ? COLORS.red : COLORS.amber, 0, 0, 0, 0, true);
    }
    b.hull([
      { x: -w * 0.065, y: h * 0.79, width: w * 0.69, depth: d * 0.73, z: -d * 0.025 },
      { x: -w * 0.065, y: h * 0.89, width: w * 0.69, depth: d * 0.73, z: -d * 0.025 },
      { x: -w * 0.085, y: h * 0.96, width: w * 0.52, depth: d * 0.54, z: -d * 0.09 },
    ], COLORS.ceramic);
    b.box(-w * 0.065, h * 0.838, d * 0.35, w * 0.53, h * 0.067,
      0.10, COLORS.recess, 0.012);
    // 红色立面提示高塔危险，顶部金色信标沿用菜单中的超级形态三级跳识别约定。
    b.box(-w * 0.065, h * 0.84, d * 0.405, w * 0.44, h * 0.018,
      0.035, COLORS.red, 0, 0, 0, 0, true);
    for (const side of [-1, 1]) {
      b.box(-w * 0.07 + side * w * 0.16, h * 0.967, -d * 0.07, w * 0.085,
        h * 0.057, d * 0.20, COLORS.graphite, 0.012);
      b.box(-w * 0.07 + side * w * 0.16, h * 0.995, -d * 0.015, w * 0.075,
        h * 0.010, d * 0.075, COLORS.amber, 0, 0, 0, 0, true);
    }
    if (!detailed) return;

    for (const side of [-1, 1]) {
      const top = side === -1 ? 0.68 : 0.55;
      for (let vent = 0; vent < 4; vent += 1) {
        b.box(side * w * 0.345, h * (top - 0.27 + vent * 0.029), d * 0.34,
          w * 0.18, h * 0.012, 0.06, COLORS.recess, 0.004);
      }
      b.box(side * w * 0.40, h * 0.19, d * 0.387, w * 0.061, h * 0.033,
        0.075, COLORS.hazard, 0, 0, 0, 0, true);
      b.pipe([side * w * 0.235, h * 0.19, d * 0.35],
        [side * w * 0.235, h * 0.47, d * 0.24], w * 0.021, COLORS.steel);
      for (const yRatio of [0.20, 0.46, 0.72]) {
        b.box(-w * 0.03 + side * w * 0.225, h * yRatio, d * 0.30,
          w * 0.033, h * 0.06, d * 0.15, COLORS.steel, 0.008);
      }
    }
    for (let floor = 0; floor < 4; floor += 1) {
      const y = h * (0.26 + floor * 0.147);
      const front = d * (0.365 - floor * 0.022);
      for (const side of [-1, 1]) {
        b.box(-w * 0.035 + side * w * 0.10, y + h * 0.061, front - d * 0.012,
          w * 0.021, h * 0.034, 0.065, COLORS.graphite);
        b.cylinder(-w * 0.035 + side * w * 0.167, y, front + d * 0.064,
          w * 0.014, 0.025, COLORS.graphite, Math.PI / 2, 6);
      }
    }
    b.box(-w * 0.065, h * 0.935, -d * 0.16, w * 0.22,
      h * 0.039, d * 0.28, COLORS.armor, 0.014);
    for (let fin = 0; fin < 4; fin += 1) {
      b.box(-w * 0.065 + (fin - 1.5) * w * 0.056, h * 0.961, -d * 0.16,
        w * 0.018, 0.026, d * 0.21, COLORS.steel);
    }
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

    // 多个八角截面组成实心切角体，截面可偏置、退台或倾斜，保留真实侧向剪影。
    function hull(sections, tint) {
      const positions = [];
      const rings = sections.map(({ x = 0, y, z = 0, width, depth, chamfer = 0.14 }) => {
        const c = chamfer;
        return [
          [-0.5 + c, -0.5], [0.5 - c, -0.5], [0.5, -0.5 + c], [0.5, 0.5 - c],
          [0.5 - c, 0.5], [-0.5 + c, 0.5], [-0.5, 0.5 - c], [-0.5, -0.5 + c],
        ].map(([u, v]) => [x + u * width, y, z + v * depth]);
      });
      function triangle(a, b, c) { positions.push(...a, ...b, ...c); }
      for (let level = 0; level < rings.length - 1; level += 1) {
        for (let side = 0; side < 8; side += 1) {
          const next = (side + 1) % 8;
          triangle(rings[level][side], rings[level + 1][next], rings[level][next]);
          triangle(rings[level][side], rings[level + 1][side], rings[level + 1][next]);
        }
      }
      for (let index = 1; index < 7; index += 1) {
        triangle(rings[0][0], rings[0][index], rings[0][index + 1]);
        const top = rings[rings.length - 1];
        triangle(top[0], top[index + 1], top[index]);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      add(geometry, tint, [0, 0, 0]);
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

    return { box, prism, hull, cylinder, ring, pipe, finish };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightObstacles = Object.freeze({ create });
})(globalThis);
