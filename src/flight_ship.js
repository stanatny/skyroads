'use strict';

// 玩家飞行器：共享真实位置，独立生成机身、可展开机翼和矢量尾焰。
(function attachFlightShip(scope) {
  /** 创建飞行器；传入 Three.js 和资源登记器，返回场景组、状态更新及诊断接口。 */
  function create({ THREE, own, visualScale = 1, hoverOffset = 0 }) {
    const group = new THREE.Group();
    group.name = 'player_interceptor';
    // 姿态和碰撞跟随根节点，固定模型比例与悬浮补偿只作用于内部机体。
    const model = new THREE.Group();
    model.name = 'player_airframe';
    model.scale.setScalar(visualScale);
    model.position.y = hoverOffset;
    group.add(model);
    const materials = {
      ceramic: own(new THREE.MeshStandardMaterial({ color: 0xed4936, roughness: 0.34, metalness: 0.22 })),
      titanium: own(new THREE.MeshStandardMaterial({ color: 0x111d33, roughness: 0.34, metalness: 0.58 })),
      edge: own(new THREE.MeshStandardMaterial({ color: 0x344966, roughness: 0.31, metalness: 0.56 })),
      ivory: own(new THREE.MeshStandardMaterial({ color: 0xffeed7, roughness: 0.38, metalness: 0.14 })),
      gold: own(new THREE.MeshStandardMaterial({ color: 0xd0a060, roughness: 0.28, metalness: 0.70 })),
      glass: own(new THREE.MeshPhysicalMaterial({ color: 0x061a30, roughness: 0.08, metalness: 0.24,
        clearcoat: 1, clearcoatRoughness: 0.08 })),
      cyan: own(new THREE.MeshBasicMaterial({ color: 0x79e7ff, toneMapped: false })),
      amber: own(new THREE.MeshBasicMaterial({ color: 0xffcf76, toneMapped: false })),
    };
    function plasmaMaterial(color) {
      return own(new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, phase: { value: 0 } },
        vertexShader: `varying vec2 plumeUv; varying vec3 plumeNormal; varying vec3 viewPosition;
          void main() { plumeUv = uv; plumeNormal = normalize(normalMatrix * normal);
            vec4 view = modelViewMatrix * vec4(position, 1.0); viewPosition = view.xyz;
            gl_Position = projectionMatrix * view; }`,
        fragmentShader: `uniform vec3 color; uniform float phase; varying vec2 plumeUv;
          varying vec3 plumeNormal; varying vec3 viewPosition;
          void main() { float facing = abs(dot(normalize(plumeNormal), normalize(-viewPosition)));
            float fade = pow(max(0.0, 1.0 - plumeUv.y), 0.68);
            float pulse = 0.74 + 0.26 * sin(plumeUv.y * 43.0 - phase * 29.0);
            float core = pow(facing, 3.0);
            gl_FragColor = vec4(mix(color, vec3(0.83, 0.95, 1.0), core * 0.7),
              fade * (0.12 + core * 0.64) * pulse); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false,
      }));
    }
    const flameMaterial = plasmaMaterial(0x49baff);
    const flameCoreMaterial = own(new THREE.MeshBasicMaterial({ color: 0xd8f8ff, transparent: true,
      opacity: 0.90, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const superFlameMaterial = plasmaMaterial(0x67cfff);
    // 程序径向纹理形成喷口的柔和光晕，不增加全屏后处理通道。
    const glowPixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const distance = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        const offset = (y * 64 + x) * 4;
        glowPixels[offset] = glowPixels[offset + 1] = glowPixels[offset + 2] = 255;
        glowPixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 3) * 255);
      }
    }
    const glowTexture = own(new THREE.DataTexture(glowPixels, 64, 64));
    glowTexture.needsUpdate = true;
    const exhaustGlow = own(new THREE.SpriteMaterial({ map: glowTexture, color: 0x62d8ff,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.90, toneMapped: false }));
    const wings = [];
    const extensions = [];
    const flames = [];
    let superBlend = 0;
    let lastTime = null;
    let lastChargeTime = null;
    let previousRun = null;
    let propulsionMode = 'cruise';
    let plumeLength = 0;
    const chargeEffect = createChargeEffect();

    const hull = makeBuilder(model);
    // 单一翼身融合外壳贯穿机首、肩部与发动机，不再由镂空框架拼出轮廓。
    hull.add(loft([
      [-2.80, 0.028, -0.018, 0.028], [-2.52, 0.18, -0.09, 0.09],
      [-1.95, 0.41, -0.19, 0.25], [-1.20, 0.66, -0.30, 0.41],
      [-0.43, 1.03, -0.34, 0.46], [0.30, 1.46, -0.32, 0.38],
      [0.98, 1.68, -0.26, 0.29], [1.49, 1.40, -0.21, 0.21],
      [1.84, 0.97, -0.17, 0.13], [1.98, 0.38, -0.09, 0.09],
    ]), 'titanium', [0, 0.77, 0]);
    hull.add(loft([
      [-2.70, 0.023, -0.022, 0.014], [-2.43, 0.16, -0.042, 0.038],
      [-1.86, 0.35, -0.045, 0.19], [-1.16, 0.57, -0.049, 0.29],
      [-0.41, 0.94, -0.045, 0.32], [0.32, 1.36, -0.039, 0.23],
      [0.98, 1.55, -0.037, 0.15], [1.40, 1.19, -0.039, 0.087],
      [1.68, 0.84, -0.028, 0.05], [1.83, 0.28, -0.012, 0.028],
    ]), 'ceramic', [0, 0.98, 0]);
    // 深色玻璃舱与薄框成为清楚的视觉中轴。
    hull.add(loft([
      [-1.94, 0.035, -0.035, 0.023], [-1.58, 0.20, -0.042, 0.19],
      [-1.02, 0.33, -0.06, 0.33], [-0.46, 0.31, -0.06, 0.29],
      [-0.13, 0.16, -0.036, 0.11], [-0.03, 0.042, -0.02, 0.024],
    ]), 'glass', [0, 1.17, 0]);
    for (const side of [-1, 1]) {
      hull.beam([side * 0.035, 1.20, -1.93], [side * 0.33, 1.21, -1.02], 0.016, 'edge');
      hull.beam([side * 0.33, 1.21, -1.02], [side * 0.16, 1.21, -0.14], 0.016, 'edge');
      hull.beam([side * 0.13, 1.015, -2.39], [side * 0.38, 1.18, -1.47], 0.012, 'gold');
    }
    hull.add(loft([[-2.18, 0.10, -0.045, 0.065], [-1.50, 0.18, -0.055, 0.12],
      [-0.91, 0.16, -0.03, 0.14]]), 'titanium', [0, 0.44, 0]);
    // 主炮保持物理枪口(0, 1/3, -2.69)，不会为了造型让可见炮口偏离弹道。
    for (const side of [-1, 1]) {
      hull.cylinder([side * 0.052, 1 / 3, -2.31], 0.038, 0.046, 0.72, 'edge', 10);
      hull.cylinder([side * 0.052, 1 / 3, -2.69], 0.025, 0.025, 0.06, 'cyan', 10);
    }
    // 脊背动力舱恰好容纳武器模块的充能附件(0, 1.38, 0.60)。
    hull.add(loft([[-0.28, 0.19, -0.11, 0.11, 1.21], [0.30, 0.30, -0.13, 0.12, 1.24],
      [0.78, 0.30, -0.14, 0.09, 1.27], [1.18, 0.25, -0.13, 0.075, 1.18],
      [1.60, 0.16, -0.10, 0.035, 1.09]]), 'titanium');
    const reactorSeat = new THREE.TorusGeometry(0.18, 0.035, 6, 24);
    reactorSeat.rotateX(Math.PI / 2);
    hull.add(reactorSeat, 'gold', [0, 1.37, 0.60]);
    const reactorLight = new THREE.TorusGeometry(0.129, 0.018, 6, 24);
    reactorLight.rotateX(Math.PI / 2);
    hull.add(reactorLight, 'cyan', [0, 1.383, 0.60]);

    for (const side of [-1, 1]) {
      // 紧凑鸭翼与后掠刀锋形成前后呼应，不增加现有机翼的横向包络。
      hull.add(wingPlate([[side * 0.30, -1.52], [side * 0.54, -1.55],
        [side * 1.04, -0.77], [side * 0.87, -0.51], [side * 0.43, -0.90]], 0.09), 'titanium', [0, 0.99, 0]);
      hull.add(wingPlate([[side * 0.39, -1.43], [side * 0.53, -1.44],
        [side * 0.95, -0.78], [side * 0.85, -0.64], [side * 0.48, -0.94]], 0.035), 'ceramic', [0, 1.05, 0]);
      hull.add(wingPlate([[side * 0.57, -1.29], [side * 0.63, -1.23],
        [side * 0.89, -0.82], [side * 0.84, -0.76]], 0.009), 'ivory', [0, 1.08, 0]);
      const wing = new THREE.Group();
      wing.name = side < 0 ? 'port_blended_wing' : 'starboard_blended_wing';
      wing.position.set(side * 0.78, 0.87, 0.05);
      model.add(wing);
      const panel = makeBuilder(wing);
      panel.add(wingPlate([[0, -0.81], [side * 0.30, -0.59], [side * 0.76, 0.12],
        [side * 1.145, 1.43], [side * 0.84, 1.19], [side * 0.51, 1.61],
        [side * 0.02, 0.97]], 0.18), 'titanium');
      panel.add(wingPlate([[side * 0.02, -0.70], [side * 0.29, -0.49], [side * 0.68, 0.13],
        [side * 1.05, 1.26], [side * 0.82, 1.07], [side * 0.50, 1.45],
        [side * 0.09, 0.91]], 0.045), 'ceramic', [0, 0.116, 0]);
      panel.add(wingPlate([[side * 0.38, -0.27], [side * 0.46, -0.15],
        [side * 0.91, 1.04], [side * 0.80, 0.94]], 0.009), 'ivory', [0, 0.155, 0]);
      panel.beam([side * 0.91, 0.14, 0.83], [side * 1.063, 0.14, 1.29], 0.013, 'cyan');
      panel.add(wingPlate([[side * 0.17, 0.73], [side * 0.34, 0.91],
        [side * 0.76, 1.32], [side * 0.56, 1.34]], 0.028), 'edge', [0, 0.128, 0]);
      panel.finish();
      wings.push({ group: wing, side });

      // 两个大涡轮嵌入后肩整流罩，保留真实深度的喷口与压缩机叶片。
      hull.add(loft([[-0.62, 0.24, -0.12, 0.19, 1.12], [-0.18, 0.32, -0.20, 0.29, 1.07],
        [0.45, 0.38, -0.24, 0.31, 0.99], [1.10, 0.39, -0.27, 0.29, 0.88],
        [1.85, 0.36, -0.30, 0.34, 0.76]], true), 'edge', [side * 0.67, 0, 0]);
      // 多面后肩罩与分段涂装弱化长圆筒感，保留后方的圆形涡轮喷口。
      hull.add(loft([[-0.40, 0.11, -0.025, 0.023, 1.335], [-0.15, 0.15, -0.025, 0.024, 1.36],
        [0.23, 0.15, -0.025, 0.022, 1.324]], true), 'ceramic', [side * 0.67, 0, 0]);
      hull.add(loft([[1.29, 0.19, -0.028, 0.020, 1.15], [1.42, 0.19, -0.028, 0.020, 1.138]], true),
        'ivory', [side * 0.67, 0, 0]);
      hull.cylinder([side * 0.67, 1.12, -0.638], 0.185, 0.185, 0.055, 'titanium', 20);
      hull.beam([side * 0.43, 1.20, -0.50], [side * 0.37, 1.20, 0.24], 0.014, 'gold');
      engine(hull, side * 0.67, 0.76, 1.63);
      for (let slot = 0; slot < 4; slot += 1) {
        hull.box([side * 0.67, 1.297 - slot * 0.05, 0.47 + slot * 0.21], [0.34, 0.025, 0.075], 'titanium');
      }
      hull.beam([side * 0.40, 1.12, 0.07], [side * 0.46, 1.12, 0.62], 0.013, 'gold');
      const fin = new THREE.Group();
      fin.name = side < 0 ? 'port_tail_fin' : 'starboard_tail_fin';
      fin.position.set(side * 1.20, 1.00, 1.00);
      fin.rotation.z = side * -0.50;
      model.add(fin);
      const finBuilder = makeBuilder(fin);
      finBuilder.add(finPlate([[0, -0.34], [0.55, 0.22], [0.62, 0.73], [0.015, 0.56]], 0.085), 'titanium');
      finBuilder.add(finPlate([[0.045, -0.12], [0.46, 0.26], [0.49, 0.58], [0.05, 0.43]], 0.09), 'ceramic');
      finBuilder.add(finPlate([[0.36, 0.20], [0.44, 0.29], [0.45, 0.48], [0.36, 0.42]], 0.094), 'ivory');
      finBuilder.finish();

      // 超级形态为完整厚翼面展开，铰链根部始终与主肩相接。
      const deployment = new THREE.Group();
      deployment.name = side < 0 ? 'port_super_shoulder' : 'starboard_super_shoulder';
      deployment.position.set(side * 1.08, 0.83, 0.11);
      model.add(deployment);
      const expanded = makeBuilder(deployment);
      expanded.add(wingPlate([[0, -0.87], [side * 0.36, -0.97], [side * 1.18, 0.15],
        [side * 1.73, 1.44], [side * 1.27, 1.20], [side * 0.84, 1.51],
        [side * 0.04, 0.83]], 0.21), 'titanium');
      expanded.add(wingPlate([[side * 0.07, -0.75], [side * 0.33, -0.82], [side * 1.07, 0.18],
        [side * 1.59, 1.27], [side * 1.26, 1.05], [side * 0.84, 1.34],
        [side * 0.12, 0.73]], 0.048), 'ceramic', [0, 0.13, 0]);
      expanded.add(wingPlate([[side * 0.42, -0.60], [side * 0.50, -0.49],
        [side * 1.30, 0.94], [side * 1.19, 0.84]], 0.011), 'ivory', [0, 0.17, 0]);
      expanded.beam([side * 1.36, 0.17, 0.95], [side * 1.55, 0.17, 1.22], 0.015, 'cyan');
      expanded.add(wingPlate([[side * 0.43, 0.52], [side * 0.57, 0.58],
        [side * 1.15, 1.17], [side * 0.93, 1.22]], 0.028), 'edge', [0, 0.16, 0]);
      expanded.finish();
      extensions.push({ group: deployment, side });
    }
    hull.finish();

    const powerDrive = new THREE.Group();
    powerDrive.name = 'super_annular_drive';
    powerDrive.position.set(0, 1.07, 2.05);
    model.add(powerDrive);
    const drive = makeBuilder(powerDrive);
    const driveShell = new THREE.TorusGeometry(0.82, 0.091, 8, 40);
    driveShell.scale(1.44, 1, 1);
    drive.add(driveShell, 'titanium');
    const driveRim = new THREE.TorusGeometry(0.82, 0.039, 6, 40);
    driveRim.scale(1.44, 1, 1);
    drive.add(driveRim, 'gold', [0, 0, 0.078]);
    const driveLight = new THREE.TorusGeometry(0.737, 0.023, 6, 40);
    driveLight.scale(1.44, 1, 1);
    drive.add(driveLight, 'cyan', [0, 0, 0.064]);
    // 四根承力臂把环形推进器连接到双发尾肩，不作为悬浮装饰圈。
    for (const side of [-1, 1]) {
      for (const upper of [-1, 1]) {
        drive.beam([side * 0.64, upper * 0.20 - 0.12, -0.72],
          [side * 1.015, upper * 0.425, -0.03], 0.053, 'edge');
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      const x = Math.cos(angle) * 1.18;
      const y = Math.sin(angle) * 0.82;
      drive.box([x, y, -0.01], [0.18, 0.14, 0.24], 'edge', [0, 0, angle]);
    }
    drive.finish();
    const annularPlume = new THREE.Mesh(own(new THREE.ConeGeometry(0.70, 1.7, 24, 1, true)), superFlameMaterial);
    annularPlume.geometry.rotateX(Math.PI / 2);
    annularPlume.geometry.translate(0, 0, 0.98);
    annularPlume.scale.x = 1.40;
    powerDrive.add(annularPlume);

    function engine(builder, x, y, z) {
      builder.cylinder([x, y, z], 0.34, 0.34, 0.58, 'titanium', 24);
      builder.cylinder([x, y, z + 0.26], 0.357, 0.334, 0.19, 'edge', 24);
      builder.cylinder([x, y, z + 0.365], 0.292, 0.292, 0.032, 'titanium', 24);
      const throat = new THREE.TorusGeometry(0.277, 0.020, 6, 24);
      builder.add(throat, 'cyan', [x, y, z + 0.392]);
      const lip = new THREE.TorusGeometry(0.338, 0.026, 6, 24);
      builder.add(lip, 'gold', [x, y, z + 0.39]);
      for (let blade = 0; blade < 12; blade += 1) {
        const a = blade * Math.PI / 6;
        builder.beam([x + Math.cos(a) * 0.11, y + Math.sin(a) * 0.11, z + 0.39],
          [x + Math.cos(a + 0.26) * 0.254, y + Math.sin(a + 0.26) * 0.254, z + 0.39], 0.016, 'titanium');
      }
      builder.cylinder([x, y, z + 0.407], 0.082, 0.10, 0.06, 'cyan', 16);
      const flame = new THREE.Group();
      flame.name = x < 0 ? 'port_engine_plume' : 'starboard_engine_plume';
      flame.position.set(x, y, z + 0.44);
      model.add(flame);
      const outerGeometry = own(new THREE.ConeGeometry(0.26, 1, 20, 1, true));
      outerGeometry.rotateX(Math.PI / 2); outerGeometry.translate(0, 0, 0.5);
      flame.add(new THREE.Mesh(outerGeometry, flameMaterial));
      const innerGeometry = own(new THREE.ConeGeometry(0.095, 0.72, 12));
      innerGeometry.rotateX(Math.PI / 2); innerGeometry.translate(0, 0, 0.36);
      flame.add(new THREE.Mesh(innerGeometry, flameCoreMaterial));
      const halo = new THREE.Sprite(exhaustGlow);
      halo.position.set(x, y, z + 0.45);
      halo.scale.set(1, 1, 1);
      model.add(halo);
      flames.push({ group: flame, halo, phase: x * 2 });
    }

    function update(state, config, { time = 0, bank = 0 } = {}) {
      const changedRun = state.runId !== previousRun;
      const dt = lastTime === null || changedRun ? 0 : Math.max(0, Math.min(0.05, time - lastTime));
      previousRun = state.runId;
      lastTime = time;
      const target = state.tripleT > 0 ? 1 : 0;
      if (changedRun || state.reducedMotion) superBlend = target;
      else superBlend += (target - superBlend) * Math.min(1, dt * 5.5);
      if (Math.abs(target - superBlend) < 0.001) superBlend = target;
      const boost = state.boostT > 0 || state.fuelBurstT > 0;
      const gliding = Boolean(state.gliding) && state.fuel > 0
        && (state.mode === 'PLAYING' || state.mode === 'PAUSED');
      propulsionMode = boost ? 'boost' : gliding ? 'glide' : 'cruise';
      // 减少动态效果会冻结装饰时钟，短提示仍用游戏时钟自然结束，暂停则由状态阻止推进。
      const chargeTime = Number.isFinite(state.elapsedMs) ? state.elapsedMs / 1000
        : Number.isFinite(state.time) ? state.time : time;
      const chargeDt = lastChargeTime === null || changedRun ? 0
        : Math.max(0, Math.min(0.05, chargeTime - lastChargeTime));
      lastChargeTime = chargeTime;
      const charge = chargeEffect.update(state, config, chargeDt, changedRun);
      const throttle = Math.min(1, Math.max(0, (state.speed || 0) / (config.MAX_SPEED || 80)));
      group.rotation.z = state.reducedMotion ? 0 : Math.max(-0.26, Math.min(0.26, bank));
      group.rotation.x = state.reducedMotion ? 0 : Math.max(-0.10, Math.min(0.12, (state.playerVY || 0) / 22000));
      group.visible = state.mode !== 'GAMEOVER';
      for (const wing of wings) {
        wing.group.rotation.z = wing.side * (-0.025 - superBlend * 0.055);
        wing.group.rotation.y = wing.side * superBlend * -0.025;
      }
      for (const extension of extensions) {
        extension.group.visible = superBlend > 0.005;
        extension.group.scale.x = 0.50 + superBlend * 0.50;
        extension.group.rotation.z = extension.side * (-0.07 - (1 - superBlend) * 0.75);
        extension.group.position.y = 0.83 + superBlend * 0.12;
      }
      powerDrive.visible = superBlend > 0.005;
      powerDrive.scale.setScalar(0.70 + superBlend * 0.30);
      powerDrive.position.z = 1.70 + superBlend * 0.65;
      // 滑翔持续消耗燃料，双发保持长焰并向下偏转；巡航、滑翔与超级加速具有不同推力轮廓。
      plumeLength = boost ? 4.4 : gliding ? 3.25 + superBlend * 0.45
        : 1.10 + throttle * 0.70 + superBlend * 0.35;
      annularPlume.scale.z = boost ? 2.1 : gliding ? 1.85 : 0.80 + throttle * 0.45;
      for (const flame of flames) {
        const pulse = state.reducedMotion ? 1 : 1 + Math.sin(time * 31 + flame.phase) * 0.075;
        flame.group.scale.z = plumeLength * pulse;
        flame.group.scale.x = flame.group.scale.y = boost ? 1.28 : gliding ? 1.20 : 1;
        flame.group.rotation.x = gliding && !boost ? 0.16 : 0;
        const haloScale = (boost ? 1.85 : gliding ? 1.65
          : 1.10 + throttle * 0.18 + charge.fuelRatio * 0.85) * pulse;
        flame.halo.scale.set(haloScale, haloScale, 1);
      }
      flameMaterial.uniforms.color.value.set(boost ? 0x8bdfff : gliding ? 0xff994d : 0x49baff);
      superFlameMaterial.uniforms.color.value.set(gliding && !boost ? 0xffca75 : 0x67cfff);
      exhaustGlow.color.set(gliding && !boost ? 0xffbd78 : 0x62d8ff);
      exhaustGlow.opacity = 0.90 + charge.fuelRatio * 0.10;
      flameMaterial.uniforms.phase.value = superFlameMaterial.uniforms.phase.value = state.reducedMotion ? 0 : time;
      return superBlend;
    }

    function getDiagnostics() {
      let meshes = 0;
      let triangles = 0;
      group.traverse((object) => {
        if (!object.isMesh) return;
        meshes += 1;
        triangles += (object.geometry.index ? object.geometry.index.count
          : object.geometry.getAttribute('position').count) / 3;
      });
      return { design: 'NC-12 Manta R', superBlend, meshes, triangles, visualScale,
        charge: chargeEffect.getDiagnostics(),
        propulsion: { mode: propulsionMode, plumeLength },
        attachments: { muzzle: [0, visualScale / 3 + hoverOffset, -2.69 * visualScale],
          chargeReactor: [0, 1.38 * visualScale + hoverOffset, 0.60 * visualScale] },
        position: { x: group.position.x, y: group.position.y, z: group.position.z },
        roll: group.rotation.z, visible: group.visible };
    }

    // 机体蓄能只读取真实蓄力状态；取消与发射不混为一谈，所有几何预先创建并复用。
    function createChargeEffect() {
      const field = new THREE.Group();
      field.name = 'ship_charge_field';
      field.visible = false;
      model.add(field);
      const light = own(new THREE.MeshBasicMaterial({ color: 0x54efff, transparent: true,
        opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const pulseMaterial = own(new THREE.MeshBasicMaterial({ color: 0xb4fbff, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const glowMaterial = own(new THREE.SpriteMaterial({ map: glowTexture, color: 0x54efff,
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const arcGeometry = own(new THREE.TorusGeometry(1, 0.030, 6, 48, Math.PI * 1.40));
      const arcs = [0, 1].map(() => {
        const arc = new THREE.Mesh(arcGeometry, light);
        arc.rotation.x = Math.PI / 2;
        field.add(arc);
        return arc;
      });
      const pulseRing = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.045, 6, 64)), pulseMaterial);
      pulseRing.rotation.x = Math.PI / 2;
      pulseRing.position.set(0, 1.20, 0.35);
      field.add(pulseRing);
      const core = new THREE.Sprite(glowMaterial);
      core.position.set(0, 1.53, 0.60);
      field.add(core);
      const motes = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.11, 6, 4)), light, 24));
      motes.name = 'ship_charge_motes';
      motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      motes.frustumCulled = false;
      motes.count = 0;
      field.add(motes);
      const transform = new THREE.Object3D();
      let phase = 0;
      let previousFuelBurst = false;
      let previousWeaponReady = false;
      let readyPulse = 0;
      let burstPulse = 0;
      let fuelRatio = 0;
      let weaponRatio = 0;
      let kind = null;

      function updateCharge(state, config, dt, changedRun) {
        const active = state.mode === 'PLAYING' || state.mode === 'PAUSED';
        const running = state.mode === 'PLAYING';
        fuelRatio = active ? Math.min(1, Math.max(0, (state.fuelBurstChargeT || 0)
          / (config.FUEL_BURST_CHARGE_TIME || 1))) : 0;
        weaponRatio = active ? Math.min(1, Math.max(0, (state.chargeT || 0) / (config.CHARGE_TIME || 1.5))) : 0;
        const burstActive = (state.fuelBurstT || 0) > 0;
        const weaponReady = weaponRatio >= 1;
        if (changedRun || !active) {
          phase = 0; readyPulse = 0; burstPulse = 0;
          previousFuelBurst = burstActive; previousWeaponReady = weaponReady;
        }
        if (running) {
          readyPulse = Math.max(0, readyPulse - dt);
          burstPulse = Math.max(0, burstPulse - dt);
          if (!changedRun && weaponReady && !previousWeaponReady) readyPulse = 0.30;
          // 燃料蓄满当帧会把蓄力归零；实际爆发状态的上升沿才表示成功启动。
          if (!changedRun && burstActive && !previousFuelBurst) burstPulse = 0.32;
          if (!state.reducedMotion) phase += dt;
        }
        if (weaponRatio === 0) readyPulse = 0;
        previousFuelBurst = burstActive;
        previousWeaponReady = weaponReady;
        kind = fuelRatio > 0 || burstPulse > 0 ? 'fuel' : weaponRatio > 0 ? 'weapon' : null;
        const ratio = kind === 'fuel' ? fuelRatio : weaponRatio;
        const pulse = Math.max(readyPulse / 0.30, burstPulse / 0.32);
        field.visible = active && (ratio > 0 || pulse > 0);
        motes.count = 0;
        if (!field.visible) return { fuelRatio, weaponRatio };

        const color = kind === 'fuel' ? 0x54efff : 0xffbd55;
        light.color.set(color); glowMaterial.color.set(color); pulseMaterial.color.set(color);
        light.opacity = 0.32 + ratio * 0.53;
        glowMaterial.opacity = ratio > 0 ? 0.24 + ratio * 0.42 + pulse * 0.18 : pulse * 0.70;
        core.scale.setScalar(1.05 + ratio * 1.25 + pulse * 0.55);
        const radius = 2.65 - ratio * 1.1;
        for (let index = 0; index < arcs.length; index += 1) {
          const arc = arcs[index];
          arc.visible = ratio > 0;
          arc.position.set(0, 1.22 + index * 0.13, 0.35);
          arc.scale.set(radius * (1 - index * 0.13), radius * 1.05 * (1 - index * 0.13), 1);
          arc.rotation.z = index * Math.PI + (state.reducedMotion ? 0 : phase * (index ? -2.0 : 2.4));
        }
        pulseRing.visible = pulse > 0;
        pulseRing.scale.setScalar(state.reducedMotion ? 1.7 : 1.45 + (1 - pulse) * 1.0);
        pulseMaterial.opacity = state.reducedMotion ? pulse * 0.35 : pulse * 0.85;
        if (!state.reducedMotion && ratio > 0) {
          motes.count = 24;
          for (let index = 0; index < motes.count; index += 1) {
            const inward = (phase * (0.9 + ratio * 0.85) + index / 24) % 1;
            const angle = index * 2.399 + phase * 0.65;
            const spread = (1 - inward) * (2.65 - ratio * 0.35);
            const targetX = kind === 'fuel' ? (index % 2 ? -0.67 : 0.67) : 0;
            const targetZ = kind === 'fuel' ? 1.50 : 0.60;
            transform.position.set(Math.cos(angle) * spread + targetX * inward,
              1.28 + (1 - inward) * 0.42, Math.sin(angle) * spread + targetZ * inward);
            transform.scale.setScalar(0.60 + inward * 0.60);
            transform.updateMatrix();
            motes.setMatrixAt(index, transform.matrix);
          }
          motes.instanceMatrix.needsUpdate = true;
        }
        return { fuelRatio, weaponRatio };
      }
      return { update: updateCharge,
        getDiagnostics: () => ({ fuelRatio, weaponRatio, readyPulse, burstPulse,
          kind, phase, visible: field.visible, particles: motes.count }) };
    }

    // 每组按材质烘焙，机械细节不会各自成为一次独立 GPU 绘制。
    function makeBuilder(parent) {
      const pieces = new Map();
      function add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
        const transform = new THREE.Object3D();
        transform.position.set(...position); transform.rotation.set(...rotation); transform.updateMatrix();
        geometry.applyMatrix4(transform.matrix);
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        if (!pieces.has(material)) pieces.set(material, []);
        pieces.get(material).push(flat);
      }
      return {
        add,
        box(position, size, material, rotation) {
          add(new THREE.BoxGeometry(...size), material, position, rotation);
        },
        cylinder(position, radiusFront, radiusBack, length, material, segments = 12) {
          add(new THREE.CylinderGeometry(radiusFront, radiusBack, length, segments), material,
            position, [Math.PI / 2, 0, 0]);
        },
        beam(start, end, radius, material) {
          const from = new THREE.Vector3(...start); const to = new THREE.Vector3(...end);
          const geometry = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 6);
          geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
          add(geometry, material, from.add(to).multiplyScalar(0.5).toArray());
        },
        finish() {
          for (const [material, geometries] of pieces) {
            const size = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.array.length, 0);
            const positions = new Float32Array(size); const normals = new Float32Array(size);
            let offset = 0;
            for (const geometry of geometries) {
              positions.set(geometry.attributes.position.array, offset);
              normals.set(geometry.attributes.normal.array, offset);
              offset += geometry.attributes.position.array.length;
              geometry.dispose();
            }
            const geometry = own(new THREE.BufferGeometry());
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            const mesh = new THREE.Mesh(geometry, materials[material]);
            mesh.name = `${parent.name || 'ship_part'}_${material}`;
            parent.add(mesh);
          }
          pieces.clear();
        },
      };
    }

    function wingPlate(points, thickness) {
      const shape = new THREE.Shape();
      points.forEach(([x, z], index) => { if (index) shape.lineTo(x, z); else shape.moveTo(x, z); });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true,
        bevelSegments: 1, steps: 1, bevelSize: 0.014, bevelThickness: 0.012 });
      geometry.rotateX(Math.PI / 2); geometry.translate(0, thickness / 2, 0);
      return geometry;
    }

    function finPlate(points, thickness) {
      const geometry = wingPlate(points.map(([height, z]) => [height, z]), thickness);
      geometry.rotateZ(Math.PI / 2);
      return geometry;
    }

    function loft(stations, faceted = false) {
      const bevelProfile = [[1, 0.45], [0.62, 1], [-0.62, 1], [-1, 0.45],
        [-1, -0.45], [-0.62, -1], [0.62, -1], [1, -0.45]];
      const radialSegments = faceted ? bevelProfile.length : 16;
      const positions = [];
      const indices = [];
      for (const [z, width, bottom, top, centerY = 0] of stations) {
        for (let radial = 0; radial < radialSegments; radial += 1) {
          const angle = radial / radialSegments * Math.PI * 2;
          const [x, y] = faceted ? bevelProfile[radial] : [Math.cos(angle), Math.sin(angle)];
          positions.push(x * width, centerY + (y >= 0 ? y * top : -y * bottom), z);
        }
      }
      for (let ring = 0; ring < stations.length - 1; ring += 1) {
        for (let radial = 0; radial < radialSegments; radial += 1) {
          const next = (radial + 1) % radialSegments;
          const a = ring * radialSegments + radial;
          const b = ring * radialSegments + next;
          const c = (ring + 1) * radialSegments + radial;
          const d = (ring + 1) * radialSegments + next;
          indices.push(a, b, d, a, d, c);
        }
      }
      const frontCenter = positions.length / 3;
      positions.push(0, stations[0][4] || 0, stations[0][0]);
      const backCenter = positions.length / 3;
      positions.push(0, stations.at(-1)[4] || 0, stations.at(-1)[0]);
      const backStart = (stations.length - 1) * radialSegments;
      for (let radial = 0; radial < radialSegments; radial += 1) {
        const next = (radial + 1) % radialSegments;
        indices.push(frontCenter, next, radial, backCenter, backStart + radial, backStart + next);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }

    return { group, update, getDiagnostics };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightShip = Object.freeze({ create });
})(globalThis);
