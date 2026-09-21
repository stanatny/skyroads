'use strict';

// 天空彩蛋：沿 +X 平飞的披风英雄，胸徽朝 +Z；运动路径和显隐由天空模块掌控。
(function attachFlightSkyHero(scope) {
  /** create 使用 Three.js 与 own 资源登记器创建模型，返回根组、时间更新和诊断接口。 */
  function create({ THREE, own }) {
    if (!THREE || typeof own !== 'function') throw new TypeError('THREE and a resource owner are required');
    const group = new THREE.Group();
    group.name = 'sky_flying_hero';
    const resources = new Set();
    const register = (resource) => { resources.add(resource); return own(resource); };
    const materials = {
      blue: register(new THREE.MeshStandardMaterial({ color: 0x135dc7, roughness: 0.63, metalness: 0.04 })),
      blueLight: register(new THREE.MeshStandardMaterial({ color: 0x2a79da, roughness: 0.61, metalness: 0.03 })),
      blueShade: register(new THREE.MeshStandardMaterial({ color: 0x0b327c, roughness: 0.68, metalness: 0.02 })),
      red: register(new THREE.MeshStandardMaterial({ color: 0xd62939, roughness: 0.63, metalness: 0.02 })),
      gold: register(new THREE.MeshStandardMaterial({ color: 0xffd55d, roughness: 0.52, metalness: 0.05 })),
      skin: register(new THREE.MeshStandardMaterial({ color: 0xefb78e, roughness: 0.77, metalness: 0 })),
      hair: register(new THREE.MeshStandardMaterial({ color: 0x101623, roughness: 0.72, metalness: 0.02 })),
      eye: register(new THREE.MeshStandardMaterial({ color: 0xf2e8d9, roughness: 0.76, metalness: 0 })),
    };
    // 天空彩蛋不属于赛道雾层，保持远处红披风与蓝色轮廓的可辨识度。
    for (const material of Object.values(materials)) material.fog = false;
    const batches = new Map();
    const transform = new THREE.Object3D();
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();

    function add(geometry, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
      transform.position.set(...position); transform.scale.set(...scale);
      transform.rotation.set(...rotation); transform.updateMatrix();
      geometry.applyMatrix4(transform.matrix);
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(flat);
    }
    function ellipsoid(position, radii, material, rotation) {
      add(new THREE.SphereGeometry(1, 12, 8), material, position, radii, rotation);
    }
    function limb(start, end, startRadius, endRadius, material) {
      from.set(...start); to.set(...end); direction.copy(to).sub(from);
      const geometry = new THREE.CylinderGeometry(endRadius, startRadius, direction.length(), 10);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize()));
      add(geometry, material, from.add(to).multiplyScalar(0.5).toArray());
    }
    function shape(points, depth, material, position, rotation) {
      const outline = new THREE.Shape();
      points.forEach(([x, y], index) => index ? outline.lineTo(x, y) : outline.moveTo(x, y));
      outline.closePath();
      add(new THREE.ExtrudeGeometry(outline, { depth, steps: 1, bevelEnabled: false }), material,
        position, [1, 1, 1], rotation);
    }

    // 分开的前后腿和弯曲后臂让远景轮廓仍是人形，而不是一根蓝色圆柱。
    limb([-0.60, 0.07, -0.10], [-1.14, 0.17, -0.16], 0.15, 0.105, 'blueShade');
    ellipsoid([-1.14, 0.17, -0.16], [0.15, 0.11, 0.115], 'blueShade');
    limb([-1.14, 0.17, -0.16], [-1.69, 0.29, -0.17], 0.105, 0.075, 'blueShade');
    limb([-1.47, 0.24, -0.17], [-1.98, 0.34, -0.17], 0.11, 0.085, 'red');
    ellipsoid([-2.03, 0.34, -0.11], [0.19, 0.105, 0.125], 'red', [0, 0, -0.05]);
    limb([-0.60, -0.09, 0.11], [-1.22, -0.14, 0.15], 0.155, 0.115, 'blue');
    ellipsoid([-1.22, -0.14, 0.15], [0.145, 0.12, 0.125], 'blueLight');
    limb([-1.22, -0.14, 0.15], [-1.80, -0.13, 0.15], 0.115, 0.075, 'blue');
    limb([-1.53, -0.135, 0.15], [-2.04, -0.12, 0.15], 0.125, 0.08, 'red');
    ellipsoid([-2.09, -0.105, 0.22], [0.19, 0.11, 0.135], 'red');
    ellipsoid([-1.53, -0.135, 0.15], [0.055, 0.13, 0.13], 'red');

    limb([0.27, -0.16, -0.12], [-0.14, -0.39, -0.12], 0.13, 0.105, 'blueShade');
    ellipsoid([-0.14, -0.39, -0.12], [0.11, 0.105, 0.11], 'blueShade');
    limb([-0.14, -0.39, -0.12], [-0.02, -0.22, 0.08], 0.095, 0.07, 'blue');
    ellipsoid([-0.005, -0.215, 0.11], [0.125, 0.085, 0.075], 'skin', [0, 0, 0.60]);

    // 肩、胸肌、腰腹和红色腰装由重叠曲面衔接，保留收腰与前宽后窄的力量感。
    ellipsoid([-0.12, 0, 0.025], [0.58, 0.23, 0.275], 'blue');
    ellipsoid([0.21, 0.01, 0.025], [0.31, 0.255, 0.30], 'blue');
    ellipsoid([-0.31, 0.015, 0.255], [0.19, 0.15, 0.046], 'blueShade');
    ellipsoid([0.14, 0.115, 0.255], [0.27, 0.13, 0.085], 'blueLight');
    ellipsoid([0.14, -0.10, 0.255], [0.27, 0.12, 0.085], 'blueLight');
    ellipsoid([-0.58, -0.005, 0.015], [0.245, 0.205, 0.245], 'red');
    ellipsoid([-0.43, 0, 0.02], [0.049, 0.218, 0.264], 'gold');
    add(new THREE.BoxGeometry(0.085, 0.10, 0.027), 'gold', [-0.432, 0, 0.286]);
    limb([0.42, 0.025, 0.025], [0.68, 0.09, 0.025], 0.12, 0.115, 'skin');
    ellipsoid([0.47, 0.075, 0.01], [0.087, 0.155, 0.15], 'red');

    // 前臂抬高并向 +X 伸拳；握拳包含拇指和三道关节，不使用发光拖尾代替形体。
    ellipsoid([0.28, 0.20, 0.12], [0.205, 0.15, 0.16], 'blue');
    limb([0.32, 0.22, 0.14], [0.99, 0.32, 0.20], 0.13, 0.10, 'blue');
    ellipsoid([0.66, 0.27, 0.20], [0.28, 0.125, 0.11], 'blueLight', [0, 0, 0.13]);
    ellipsoid([0.99, 0.32, 0.20], [0.125, 0.10, 0.11], 'blue');
    limb([0.99, 0.32, 0.20], [1.63, 0.35, 0.24], 0.105, 0.07, 'blue');
    ellipsoid([1.34, 0.336, 0.255], [0.25, 0.10, 0.08], 'blueLight');
    ellipsoid([1.78, 0.35, 0.24], [0.19, 0.115, 0.105], 'skin');
    ellipsoid([1.69, 0.267, 0.31], [0.10, 0.045, 0.055], 'skin', [0, 0, -0.4]);
    for (let knuckle = 0; knuckle < 3; knuckle += 1) {
      ellipsoid([1.82, 0.294 + knuckle * 0.052, 0.322], [0.10, 0.027, 0.024], 'skin');
    }

    // 侧向脸、下颌、黑色后梳发和额前卷发；头部保持独立，拳头不遮住面部。
    ellipsoid([0.81, 0.105, 0.015], [0.205, 0.235, 0.18], 'skin');
    ellipsoid([0.865, -0.012, 0.043], [0.14, 0.12, 0.151], 'skin');
    ellipsoid([0.99, 0.095, 0.055], [0.07, 0.052, 0.068], 'skin');
    ellipsoid([0.705, 0.105, 0], [0.125, 0.195, 0.185], 'hair');
    ellipsoid([0.80, 0.285, 0.004], [0.18, 0.075, 0.18], 'hair', [0, 0, -0.15]);
    ellipsoid([0.94, 0.173, 0.147], [0.041, 0.022, 0.015], 'eye');
    ellipsoid([0.959, 0.172, 0.159], [0.016, 0.018, 0.009], 'hair');
    limb([0.903, 0.205, 0.154], [0.974, 0.192, 0.154], 0.012, 0.015, 'hair');
    limb([0.933, 0.016, 0.164], [0.979, 0.023, 0.147], 0.006, 0.005, 'hair');
    const curl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.891, 0.273, 0.125), new THREE.Vector3(0.955, 0.255, 0.145),
      new THREE.Vector3(0.960, 0.221, 0.160), new THREE.Vector3(0.935, 0.219, 0.168),
    ]);
    add(new THREE.TubeGeometry(curl, 10, 0.017, 6, false), 'hair');

    // 胸徽面向观察者，盾徽的顶边朝头部方向；实心 S 在小尺寸下仍保留红黄识别。
    const badgePosition = [0.11, 0, 0.352];
    const badgeRotation = [0, 0, -Math.PI / 2];
    shape([[-0.19, 0.15], [0.19, 0.15], [0.24, 0.045], [0, -0.19], [-0.24, 0.045]],
      0.014, 'red', badgePosition, badgeRotation);
    shape([[-0.15, 0.12], [0.15, 0.12], [0.19, 0.044], [0, -0.146], [-0.19, 0.044]],
      0.013, 'gold', [badgePosition[0], badgePosition[1], badgePosition[2] + 0.016], badgeRotation);
    shape([[0.137, 0.091], [-0.095, 0.091], [-0.152, 0.034], [-0.063, -0.006],
      [0.050, -0.018], [0.075, -0.040], [0.029, -0.076], [-0.071, -0.072],
      [-0.107, -0.038], [-0.151, -0.038], [-0.037, -0.125], [0.004, -0.125],
      [0.144, 0.010], [0.095, 0.046], [-0.042, 0.057], [-0.063, 0.037],
      [0.105, 0.033]], 0.010, 'red', [badgePosition[0], badgePosition[1], badgePosition[2] + 0.031], badgeRotation);

    // 静态身体按材质合批；每个细小肌肉和手指不会单独提交一次绘制。
    for (const [material, geometries] of batches) {
      const length = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.array.length, 0);
      const positions = new Float32Array(length);
      const normals = new Float32Array(length);
      let offset = 0;
      for (const geometry of geometries) {
        positions.set(geometry.attributes.position.array, offset);
        normals.set(geometry.attributes.normal.array, offset);
        offset += geometry.attributes.position.array.length;
        geometry.dispose();
      }
      const geometry = register(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      const mesh = new THREE.Mesh(geometry, materials[material]);
      mesh.name = `sky_hero_body_${material}`;
      group.add(mesh);
    }
    batches.clear();

    // 披风网格在初始化时创建，后续只修改已有顶点；近肩部固定，摆幅向尾缘逐渐增加。
    const capeRows = 16;
    const capeColumns = 10;
    const capePositions = new Float32Array((capeRows + 1) * (capeColumns + 1) * 3);
    const capeColors = new Float32Array(capePositions.length);
    const capeIndices = [];
    const capeColor = new THREE.Color();
    for (let row = 0; row <= capeRows; row += 1) {
      for (let column = 0; column <= capeColumns; column += 1) {
        const offset = (row * (capeColumns + 1) + column) * 3;
        const crease = 0.87 + Math.cos(column / capeColumns * Math.PI * 6) * 0.08;
        capeColor.setHex(0xd72439).multiplyScalar(crease);
        if (column === 0 || column === capeColumns || row === capeRows) capeColor.multiplyScalar(0.76);
        capeColors[offset] = capeColor.r; capeColors[offset + 1] = capeColor.g; capeColors[offset + 2] = capeColor.b;
        if (row < capeRows && column < capeColumns) {
          const a = row * (capeColumns + 1) + column;
          const b = a + capeColumns + 1;
          capeIndices.push(a, b + 1, b, a, a + 1, b + 1);
        }
      }
    }
    const capeGeometry = register(new THREE.BufferGeometry());
    capeGeometry.setAttribute('position', new THREE.BufferAttribute(capePositions, 3).setUsage(THREE.DynamicDrawUsage));
    capeGeometry.setAttribute('color', new THREE.BufferAttribute(capeColors, 3));
    capeGeometry.setIndex(capeIndices);
    const capeMaterial = register(new THREE.MeshStandardMaterial({ color: 0xffffff,
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.84, metalness: 0, fog: false }));
    const cape = new THREE.Mesh(capeGeometry, capeMaterial);
    cape.name = 'sky_hero_flowing_cape';
    cape.frustumCulled = false;
    group.add(cape);
    let lastTime = 0;

    /** update 仅以传入时间重算披风顶点，不改变根组路径、旋转、缩放或可见性。 */
    function update(time = 0) {
      lastTime = Number.isFinite(time) ? time : 0;
      for (let row = 0; row <= capeRows; row += 1) {
        const u = row / capeRows;
        const width = 0.36 + u * 0.64;
        for (let column = 0; column <= capeColumns; column += 1) {
          const v = column / capeColumns;
          const offset = (row * (capeColumns + 1) + column) * 3;
          const wave = Math.sin(u * Math.PI * 3.3 - lastTime * 4.2 + v * 1.9);
          const fold = Math.cos(v * Math.PI * 6 + u * 1.6 - lastTime * 2.7);
          capePositions[offset] = 0.38 - u * 2.34 + Math.sin(v * Math.PI * 3) * 0.045 * u * u;
          capePositions[offset + 1] = (v - 0.5) * width + 0.09 + u * 0.08 + wave * u * 0.075;
          capePositions[offset + 2] = -0.17 - u * 0.11 + wave * u * 0.13 + fold * u * 0.05;
        }
      }
      capeGeometry.attributes.position.needsUpdate = true;
      capeGeometry.computeVertexNormals();
    }

    function getDiagnostics() {
      let triangles = 0;
      group.traverse((object) => {
        if (object.isMesh) triangles += (object.geometry.index ? object.geometry.index.count
          : object.geometry.attributes.position.count) / 3;
      });
      return { name: 'orbital_cape_hero', direction: '+X', emblemFacing: '+Z',
        meshes: group.children.length, triangles, resources: resources.size,
        capeVertices: capePositions.length / 3, time: lastTime, procedural: true };
    }
    update(0);
    return { group, update, getDiagnostics };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightSkyHero = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = scope.Skyroads.flightSkyHero;
})(globalThis);
