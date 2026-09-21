'use strict';

// 天空英雄的加速反馈独立于角色网格；沿本地 -X 向身后延伸，不遮住人体和胸徽。
(function attachFlightSkyHeroFx(scope) {
  const PARTICLES = 12;
  const PULSES = 3;

  /**
   * 创建天空角色尾迹、音障环和火花，资源由 own 登记释放。
   * parent 是天空演出的相机局部组；返回 update、hide 和只读诊断。
   */
  function create({ THREE, own, parent }) {
    if (!THREE || typeof own !== 'function' || !parent) {
      throw new TypeError('THREE, a resource owner, and a parent are required');
    }
    const resources = new Set();
    const keep = (resource) => { resources.add(resource); return own(resource); };
    const group = new THREE.Group();
    group.name = 'sky_hero_acceleration_fx';
    group.visible = false;
    parent.add(group);
    const ribbonGeometry = keep(new THREE.PlaneGeometry(1, 1));
    ribbonGeometry.translate(-0.5, 0, 0);
    const ribbonMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 }, flightTime: { value: 0 } },
      vertexShader: `varying vec2 tailUv;
        void main() { tailUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 tailUv; uniform float strength; uniform float flightTime;
        void main() {
          float bend = sin(tailUv.x * 11.0 - flightTime * 3.5) * 0.035 * (1.0 - tailUv.x);
          float transverse = abs(tailUv.y - 0.5 - bend);
          float core = exp(-transverse * transverse * 160.0);
          float halo = exp(-transverse * transverse * 33.0) * 0.20;
          float fade = pow(tailUv.x, 1.50);
          float flow = 0.82 + 0.18 * sin(tailUv.x * 26.0 - flightTime * 11.0);
          vec3 color = mix(vec3(0.15,0.57,0.95), vec3(0.83,0.99,1.0), pow(tailUv.x,0.65));
          gl_FragColor = vec4(color, (core + halo) * fade * flow * strength);
        }`,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    }));
    const ribbonSpecifications = [
      { x: -2.16, y: 0.33, z: -0.11, length: 12.0, width: 0.50, angle: 0.10, turn: 0 },
      { x: -2.21, y: -0.105, z: 0.22, length: 14.0, width: 0.42, angle: -0.08, turn: Math.PI / 2 },
      { x: -1.85, y: -0.43, z: -0.20, length: 9.5, width: 0.54, angle: -0.035, turn: 0 },
      { x: -2.05, y: 0.47, z: -0.28, length: 10.8, width: 0.44, angle: 0.045, turn: Math.PI / 2 },
    ];
    const ribbons = ribbonSpecifications.map((specification, index) => {
      const mesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
      mesh.name = `sky_hero_energy_stream_${index}`;
      mesh.position.set(specification.x, specification.y, specification.z);
      mesh.rotation.set(specification.turn, 0, specification.angle);
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    // 环面法线为 +X，与角色的飞行轴一致；环只在脚后出现，中心没有填充面。
    const ringGeometry = keep(new THREE.TorusGeometry(1, 0.022, 5, 64));
    ringGeometry.rotateY(Math.PI / 2);
    const pulseMaterials = [];
    const rings = Array.from({ length: PULSES }, (_, index) => {
      const material = keep(new THREE.MeshBasicMaterial({
        color: index === 1 ? 0xc7faff : 0x71cfff,
        transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      }));
      pulseMaterials.push(material);
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.name = `sky_hero_sonic_ring_${index}`;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    const sparkGeometry = keep(new THREE.BoxGeometry(1, 0.018, 0.018));
    const sparkMaterial = keep(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    }));
    const sparks = keep(new THREE.InstancedMesh(sparkGeometry, sparkMaterial, PARTICLES));
    sparks.name = 'sky_hero_backwash_sparks';
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparks.frustumCulled = false;
    sparks.count = 0;
    group.add(sparks);
    const transform = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let index = 0; index < PARTICLES; index += 1) {
      tint.setHex(index % 5 === 0 ? 0xffd698 : index % 2 ? 0x83dfff : 0xe6ffff);
      sparks.setColorAt(index, tint);
    }
    let currentPhase = 0;
    let currentTime = 0;
    let strength = 0;

    /** 读取绝对位置与时间；相同输入产生相同姿态，不依赖帧率或随机数。 */
    function update({ phase, time = 0, position, quaternion, scale = 1 }) {
      if (!Number.isFinite(phase) || phase < 0 || phase > 1 || !Number.isFinite(time)
        || !position || !quaternion || !Number.isFinite(scale) || scale <= 0) {
        hide();
        return;
      }
      currentPhase = phase;
      currentTime = time;
      const enter = smooth(0, 0.12, phase);
      const exit = 1 - smooth(0.70, 1, phase);
      strength = enter * exit;
      group.visible = strength > 0.001;
      group.position.copy(position);
      group.quaternion.copy(quaternion);
      group.scale.setScalar(scale);
      ribbonMaterial.uniforms.strength.value = strength * 0.80;
      ribbonMaterial.uniforms.flightTime.value = time;
      const acceleration = 0.67 + 0.33 * smooth(0.05, 0.35, phase);
      for (let index = 0; index < ribbons.length; index += 1) {
        const specification = ribbonSpecifications[index];
        ribbons[index].scale.set(specification.length * acceleration, specification.width, 1);
      }
      for (let index = 0; index < rings.length; index += 1) {
        const age = ((phase * 8.5 * 0.56 - index / PULSES) % 1 + 1) % 1;
        const radius = 0.57 + age * 1.29;
        const pulse = smooth(0, 0.10, age) * Math.pow(1 - age, 1.55);
        rings[index].position.set(-2.45 - age * 12.0, 0.06, -0.03);
        rings[index].scale.setScalar(radius);
        pulseMaterials[index].opacity = strength * pulse * 0.78;
        rings[index].visible = pulseMaterials[index].opacity > 0.008;
      }
      sparks.count = group.visible ? PARTICLES : 0;
      sparkMaterial.opacity = strength * 0.75;
      for (let index = 0; index < PARTICLES; index += 1) {
        const age = ((time * 0.51 + index * 0.61803399) % 1 + 1) % 1;
        const angle = index * 2.399963;
        const radius = 0.16 + age * (0.38 + index % 3 * 0.09);
        transform.position.set(-2.5 - age * 12.8, Math.cos(angle) * radius,
          Math.sin(angle) * radius);
        const life = Math.sin(age * Math.PI);
        transform.scale.set((0.16 + age * 0.43) * life, life, life);
        transform.rotation.set(0, -Math.sin(angle) * 0.065, Math.cos(angle) * 0.065);
        transform.updateMatrix();
        sparks.setMatrixAt(index, transform.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true;
    }

    /** 隐藏整个效果；不释放池化资源，下一次演出可以立即复用。 */
    function hide() {
      group.visible = false;
      strength = 0;
      sparks.count = 0;
      sparkMaterial.opacity = 0;
      ribbonMaterial.uniforms.strength.value = 0;
      for (const material of pulseMaterials) material.opacity = 0;
    }

    function getDiagnostics() {
      return { visible: group.visible, phase: currentPhase, time: currentTime, strength,
        ribbons: ribbons.length, sonicRings: rings.filter((ring) => ring.visible && group.visible).length,
        sparks: sparks.count, resources: resources.size, drawCalls: ribbons.length + PULSES + 1,
        localEnvelope: { min: [-17, -2, -2], max: [-1.6, 2, 2] } };
    }
    return { update, hide, getDiagnostics };
  }

  function smooth(start, end, value) {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightSkyHeroFx = Object.freeze({ create });
})(globalThis);
