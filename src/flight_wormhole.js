'use strict';

// 虫洞仅呈现物理状态；入口、奖励结算、能量与安全落点由玩法控制器负责。
(function attachFlightWormhole(scope) {
  const APERTURE = Object.freeze({ rx: 2.65, ry: 1.65, centerOffsetY: 0.76 });
  const COMPLETION_TIME = 2.8;
  const STREAK_COUNT = 420;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smooth = (start, end, value) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };

  /** 创建有限资源的高空入口与折跃隧道；传入 Three、父节点、资源登记器和世界换算，返回更新、诊断与解绑接口。 */
  function create({ THREE, parent, own, world, config }) {
    const group = new THREE.Group(); group.name = 'flight_wormhole'; group.visible = false; parent.add(group);
    const gate = new THREE.Group(); gate.name = 'wormhole_gate'; gate.visible = false; group.add(gate);
    const tunnel = new THREE.Group(); tunnel.name = 'wormhole_tunnel'; tunnel.visible = false; group.add(tunnel);
    const rings = new THREE.Group(); rings.name = 'wormhole_tunnel_rings'; tunnel.add(rings);
    const ribbons = new THREE.Group(); ribbons.name = 'wormhole_helical_ribbons'; tunnel.add(ribbons);
    const shock = new THREE.Group(); shock.name = 'wormhole_exit_shock'; group.add(shock);
    const tintA = new THREE.Color(0x71d5ff), tintB = new THREE.Color(0x9c65ff);
    const resources = new Set();
    const keep = resource => { resources.add(resource); return own(resource); };
    const draw = (geometry, material, target, name) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; target.add(mesh); return mesh;
    };
    function additive(color, opacity) {
      return keep(new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    }
    const gateMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, opening: { value: 1 }, colorA: { value: tintA }, colorB: { value: tintB } },
      vertexShader: 'varying vec2 coord; void main(){coord=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 coord; uniform float phase; uniform float opening; uniform vec3 colorA; uniform vec3 colorB;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.54);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
        void main(){float r=length(coord); float angle=atan(coord.y,coord.x); float core=.565;
          float turbulence=noise(vec2(angle*3.+phase*.21,r*13.-phase*.18));
          float ridge=exp(-pow((r-core)/(.012+turbulence*.009),2.));
          float haze=exp(-pow((r-core)/.10,2.));
          float spiral=pow(.5+.5*sin(angle*6.-r*36.+phase*1.3+noise(coord*9.)*2.),5.);
          float threads=spiral*exp(-pow((r-(core+.075))/.13,2.));
          vec3 hue=mix(colorA,colorB,.5+.5*sin(angle*2.+phase*.2));
          vec3 col=vec3(.003,.007,.019)+hue*(haze*.18+threads*.52);
          col+=mix(hue,vec3(1.),.55)*ridge*1.65;
          col+=colorB*pow(max(0.,1.-r/core),5.)*.07;
          float inside=1.-smoothstep(core-.02,core+.025,r);
          float alpha=max(inside,clamp(haze*.55+threads*.8+ridge,0.,1.));
          gl_FragColor=vec4(col,alpha*(1.-smoothstep(.80,.94,r))*opening); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    }));
    // .565 是暗核的着色器半径；网格留透明边缘，实际通行孔只有 5.3 × 3.3。
    const darkCore = draw(keep(new THREE.PlaneGeometry(APERTURE.rx * 2 / 0.565, APERTURE.ry * 2 / 0.565)), gateMaterial, gate, 'wormhole_dark_core');
    darkCore.position.z = -2.35;
    // 前口、弯曲吸积面、后方漏斗分处不同深度；暗核不再是一张贴在赛道上的圆形贴片。
    const lensMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, opacity: { value: 1 } },
      vertexShader: `varying vec2 lensUv;void main(){lensUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 lensUv;uniform float phase;uniform float opacity;uniform float mode;
        void main(){float a=lensUv.x*6.28318;float r=lensUv.y;
          float spiral=pow(.5+.5*sin(a*5.-r*23.-phase*2.1),3.);
          float filaments=pow(.5+.5*sin(a*29.+r*41.-phase*4.7),10.);
          float fronts=pow(.5+.5*sin(r*32.-phase*2.5+a*2.),7.);
          float hot=pow(.5+.5*sin(a*3.+phase*.65),7.);
          vec3 hue=mix(vec3(.13,.31,.98),vec3(.31,.90,1.),spiral);
          hue=mix(hue,vec3(.64,.34,1.),.5+.5*sin(a*2.-r*7.));
          float rim=pow(1.-r,3.);
          float alpha=(.11+spiral*.28+filaments*.28+fronts*.15+rim*.20)*(1.-smoothstep(.78,1.,r));
          vec3 col=hue*(.6+spiral*.5)+vec3(.65,.89,1.)*(filaments*.55+hot*rim*.7);
          gl_FragColor=vec4(col,alpha*opacity); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide, toneMapped: false,
    }));
    const diskVertices = [], diskUvs = [], diskIndices = [];
    for (let band = 0; band <= 16; band += 1) {
      const radius = 1 + band / 16 * 0.48;
      for (let step = 0; step <= 128; step += 1) {
        const angle = step / 128 * Math.PI * 2;
        diskVertices.push(Math.cos(angle) * radius * APERTURE.rx,
          Math.sin(angle) * radius * APERTURE.ry, -Math.sin(band / 16 * Math.PI) * 0.55);
        diskUvs.push(step / 128, band / 16);
        if (band < 16 && step < 128) {
          const index = band * 129 + step;
          diskIndices.push(index, index + 129, index + 1, index + 1, index + 129, index + 130);
        }
      }
    }
    const diskGeometry = keep(new THREE.BufferGeometry());
    diskGeometry.setAttribute('position', new THREE.Float32BufferAttribute(diskVertices, 3));
    diskGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(diskUvs, 2)); diskGeometry.setIndex(diskIndices);
    draw(diskGeometry, lensMaterial, gate, 'wormhole_accretion_disk');
    const wellGeometry = keep(new THREE.CylinderGeometry(1, 0.44, 2.25, 96, 12, true)); wellGeometry.rotateX(Math.PI / 2);
    const well = draw(wellGeometry, lensMaterial, gate, 'wormhole_gravity_well');
    well.position.z = -1.125; well.scale.set(APERTURE.rx, APERTURE.ry, 1);
    const mouthMaterial = additive(0xb4f6ff, 0.92);
    const mouth = draw(keep(new THREE.TorusGeometry(1, 0.018, 7, 128)), mouthMaterial, gate, 'wormhole_lens_mouth');
    mouth.scale.set(APERTURE.rx, APERTURE.ry, 1); mouth.position.z = 0.025;
    const fragmentsMaterial = additive(0xa5e8ff, 0.85);
    const fragments = keep(new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(1, 0)), fragmentsMaterial, 12));
    fragments.name = 'wormhole_orbit_fragments'; fragments.frustumCulled = false;
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gate.add(fragments);
    const transform = new THREE.Object3D();
    const orbitMaterials = [additive(tintA, 0.66), additive(tintB, 0.49)];
    const arcGeometry = keep(new THREE.TorusGeometry(1, 0.008, 5, 42, Math.PI * 0.31));
    const orbits = [];
    for (let layer = 0; layer < 2; layer += 1) {
      const ellipse = new THREE.Group(); ellipse.scale.set(3.13 + layer * 0.28, 2.09 + layer * 0.18, 1); gate.add(ellipse);
      const orbit = new THREE.Group(); ellipse.add(orbit); orbits.push(orbit);
      for (let arc = 0; arc < 4; arc += 1) {
        const piece = draw(arcGeometry, orbitMaterials[layer], orbit, 'wormhole_orbit_arc');
        piece.rotation.z = arc * Math.PI / 2;
      }
    }
    const dustCount = 144;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustGeometry = keep(new THREE.BufferGeometry()); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = keep(new THREE.PointsMaterial({ color: tintA, size: 0.065, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const dust = new THREE.Points(dustGeometry, dustMaterial); dust.name = 'wormhole_infall_dust'; dust.frustumCulled = false; gate.add(dust);

    const tunnelMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, strength: { value: 0 }, motion: { value: 1 }, colorA: { value: tintA }, colorB: { value: tintB } },
      vertexShader: 'varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 coord; uniform float phase; uniform float strength; uniform float motion; uniform vec3 colorA; uniform vec3 colorB;
        void main(){float spiral=pow(.5+.5*sin(coord.x*50.265+coord.y*22.-phase*5.),9.);
          float seam=pow(.5+.5*sin(coord.x*100.53-coord.y*17.+phase*3.),24.);
          float flow=pow(.5+.5*sin(coord.y*110.-phase*30.+coord.x*10.),12.);
          vec3 hue=mix(colorA,colorB,.5+.5*sin(coord.x*12.56+coord.y*4.));
          vec3 col=vec3(.002,.005,.016)+hue*(.035+(spiral*.35+seam*.16+flow*.10)*motion);
          gl_FragColor=vec4(col,strength); }`,
      transparent: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
    }));
    const tubeGeometry = keep(new THREE.CylinderGeometry(11, 15, 270, 72, 1, true)); tubeGeometry.rotateX(Math.PI / 2);
    const tube = draw(tubeGeometry, tunnelMaterial, tunnel, 'wormhole_flow_tube'); tube.position.z = -108; tube.renderOrder = -4;
    const capMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x050b1d, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    const cap = draw(keep(new THREE.CircleGeometry(16, 48)), capMaterial, tunnel, 'wormhole_far_core'); cap.position.z = -242; cap.renderOrder = -5;
    const ringMaterialA = additive(tintA, 0), ringMaterialB = additive(tintB, 0);
    const ringGeometry = keep(new THREE.TorusGeometry(10.5, 0.032, 5, 96));
    const tunnelRings = [];
    for (let index = 0; index < 30; index += 1) tunnelRings.push(draw(ringGeometry,
      index % 2 ? ringMaterialA : ringMaterialB, rings, 'wormhole_depth_ring'));
    const ribbonMaterials = [additive(tintA, 0), additive(tintB, 0)];
    const helices = [];
    for (let index = 0; index < 4; index += 1) {
      const positions = [], indices = [];
      for (let step = 0; step <= 230; step += 1) {
        const z = -230 + step;
        const angle = index * Math.PI / 2 + step * 0.035;
        for (const edge of [-0.0035, 0.0035]) positions.push(Math.cos(angle + edge) * 10.2, Math.sin(angle + edge) * 10.2, z);
        if (step < 230) { const offset = step * 2; indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2); }
      }
      const geometry = keep(new THREE.BufferGeometry()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
      helices.push(draw(geometry, ribbonMaterials[index % 2], ribbons, 'wormhole_flow_ribbon'));
    }
    const streakPositions = new Float32Array(STREAK_COUNT * 6);
    const streakColors = new Float32Array(STREAK_COUNT * 6);
    const streakGeometry = keep(new THREE.BufferGeometry());
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3).setUsage(THREE.DynamicDrawUsage));
    streakGeometry.setAttribute('color', new THREE.BufferAttribute(streakColors, 3));
    for (let index = 0; index < STREAK_COUNT; index += 1) {
      const color = index % 3 ? tintA : tintB;
      const offset = index * 6;
      streakColors[offset] = color.r; streakColors[offset + 1] = color.g; streakColors[offset + 2] = color.b;
      streakColors[offset + 3] = color.r * 0.015; streakColors[offset + 4] = color.g * 0.015; streakColors[offset + 5] = color.b * 0.015;
    }
    const streakMaterial = keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const streaks = new THREE.LineSegments(streakGeometry, streakMaterial); streaks.name = 'wormhole_speed_streaks'; streaks.frustumCulled = false; tunnel.add(streaks);
    // 近侧宽光带与远处细星线分开计速，避免所有线条像同一张径向网格。
    const bandGeometry = keep(new THREE.BoxGeometry(1, 1, 1));
    const bandMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 } },
      vertexShader: `varying vec3 beamPosition;void main(){beamPosition=position;
        vec4 p=vec4(position,1.);p=instanceMatrix*p;gl_Position=projectionMatrix*modelViewMatrix*p;}`,
      fragmentShader: `varying vec3 beamPosition;uniform float strength;
        void main(){float longitudinal=pow(clamp(beamPosition.z+.5,0.,1.),1.8);
          vec3 col=mix(vec3(.26,.22,.87),vec3(.57,.92,1.),longitudinal);
          gl_FragColor=vec4(col,longitudinal*strength);}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }));
    const nearBands = keep(new THREE.InstancedMesh(bandGeometry, bandMaterial, 36));
    nearBands.name = 'wormhole_near_light_bands'; nearBands.frustumCulled = false;
    nearBands.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tunnel.add(nearBands);
    const envelopeMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { strength: { value: 0 }, phase: { value: 0 } },
      vertexShader: `varying vec3 shellNormal;varying vec3 shellView;varying vec2 shellUv;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.);shellNormal=normalize(normalMatrix*normal);
          shellView=-p.xyz;shellUv=uv;gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 shellNormal;varying vec3 shellView;varying vec2 shellUv;
        uniform float strength;uniform float phase;
        void main(){float rim=pow(1.-abs(dot(normalize(shellNormal),normalize(shellView))),2.6);
          float stream=pow(.5+.5*sin(shellUv.x*50.265+shellUv.y*17.-phase*26.),12.);
          vec3 hue=mix(vec3(.18,.45,1.),vec3(.67,.94,1.),stream);
          gl_FragColor=vec4(hue,strength*(rim*.72+stream*rim*.4));}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.FrontSide, toneMapped: false, fog: false,
    }));
    const envelope = draw(keep(new THREE.SphereGeometry(1, 40, 24)), envelopeMaterial, group, 'wormhole_capture_envelope');
    const tetherPositions = new Float32Array(48 * 6);
    const tetherGeometry = keep(new THREE.BufferGeometry());
    tetherGeometry.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const tetherMaterial = keep(new THREE.LineBasicMaterial({ color: 0x8cdcff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const tethers = new THREE.LineSegments(tetherGeometry, tetherMaterial); tethers.name = 'wormhole_capture_tethers';
    tethers.frustumCulled = false; group.add(tethers);
    const shockGeometry = keep(new THREE.RingGeometry(1, 1.045, 96));
    const shockRings = [tintA, 0xf1ce82].map(color => draw(shockGeometry, additive(color, 0), shock, 'wormhole_exit_wave'));
    const captureMaterial = keep(new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, strength: { value: 0 } },
      vertexShader: `varying vec2 ringUv;void main(){ringUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 ringUv;uniform float phase;uniform float strength;
        void main(){float arc=pow(.5+.5*sin(ringUv.x*18.8496-phase*5.),3.);
          vec3 hue=mix(vec3(.19,.38,1.),vec3(.61,.94,1.),arc);
          gl_FragColor=vec4(hue,strength*(.12+arc*.88));}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    }));
    const capture = draw(keep(new THREE.TorusGeometry(1, 0.025, 6, 96)), captureMaterial, group, 'wormhole_capture_ring');
    const response = { active: false, strength: 0, fovOffset: 0, hideScenery: false, shipOffsetZ: 0 };
    let disposed = false, lastTime = 0, phase = 'idle', exitAge = 0;

    /** 读取虫洞状态和世界坐标；只改变渲染资源，返回镜头拉伸与航道遮蔽程度。 */
    function update(state, { time = 0, playerX = 0, playerHeight = 0 } = {}) {
      const wormhole = state.wormhole;
      const running = state.mode === 'PLAYING' || state.mode === 'PAUSED';
      group.visible = !disposed && running && Boolean(wormhole);
      response.active = false; response.strength = 0; response.fovOffset = 0; response.hideScenery = false; response.shipOffsetZ = 0;
      gate.visible = false; tunnel.visible = false; shock.visible = false; capture.visible = false;
      envelope.visible = false; tethers.visible = false; nearBands.visible = false; phase = 'idle';
      if (!group.visible) return response;
      const reduced = Boolean(state.reducedMotion);
      if (state.mode !== 'PAUSED') lastTime = Number.isFinite(time) ? time : lastTime;
      const visualTime = reduced ? 0 : lastTime;
      const active = Boolean(wormhole.active);
      const elapsed = clamp(wormhole.elapsed || 0, 0, 2.4);
      exitAge = wormhole.completedT > 0 ? Math.max(0, COMPLETION_TIME - wormhole.completedT) : 100;
      const revealing = !active && exitAge < 0.35;
      const strength = active ? smooth(0.17, 0.46, elapsed) : revealing ? 1 - smooth(0, 0.35, exitAge) : 0;
      response.active = active; response.strength = strength;
      const tearPulse = Math.sin(smooth(0.22, 0.65, elapsed) * Math.PI);
      response.fovOffset = reduced ? 0 : 17 * strength + (active ? tearPulse * 3 : 0);
      response.shipOffsetZ = reduced ? 0 : active ? -2.5 * smooth(0.025, 0.52, elapsed)
        : revealing ? -2.5 * strength : 0;
      response.hideScenery = strength > 0.70;
      phase = active ? elapsed < 0.25 ? 'capture' : elapsed < 0.46 ? 'tear' : elapsed < 2.05 ? 'transit' : 'exit'
        : revealing ? 'reveal' : 'idle';
      const nextGate = wormhole.gate;
      if (!active && !revealing && nextGate && Number.isFinite(nextGate.height)) {
        const ahead = nextGate.segment - state.position;
        gate.visible = ahead >= -2 && ahead <= 100;
        gate.position.set((nextGate.lane - ((config.LANES || 7) - 1) / 2) * world.laneWidth,
          nextGate.height * world.heightScale + APERTURE.centerOffsetY, -ahead * world.segmentDepth);
        gateMaterial.uniforms.phase.value = visualTime;
        gateMaterial.uniforms.opening.value = smooth(101, 85, ahead);
        lensMaterial.uniforms.phase.value = visualTime;
        lensMaterial.uniforms.opacity.value = (reduced ? 0.48 : 1) * gateMaterial.uniforms.opening.value;
        mouthMaterial.opacity = gateMaterial.uniforms.opening.value * (reduced ? 0.55 : 0.92);
        for (let index = 0; index < 12; index += 1) {
          const angle = index * Math.PI / 6 + visualTime * (index % 2 ? -0.28 : 0.19);
          const radius = 1.30 + index % 3 * 0.11;
          transform.position.set(Math.cos(angle) * APERTURE.rx * radius,
            Math.sin(angle) * APERTURE.ry * radius, Math.sin(angle * 2) * 0.40 + 0.25);
          transform.rotation.set(angle, angle * 0.7, angle + visualTime * 0.3);
          transform.scale.set(0.055 + index % 3 * 0.014, 0.12 + index % 2 * 0.09, 0.045);
          transform.updateMatrix(); fragments.setMatrixAt(index, transform.matrix);
        }
        fragments.instanceMatrix.needsUpdate = true;
        orbits.forEach((orbit, index) => { orbit.rotation.z = index * 0.7 + visualTime * (index ? -0.28 : 0.2); });
        dust.visible = !reduced;
        for (let index = 0; index < dustCount; index += 1) {
          const travel = (index / dustCount + visualTime * 0.09) % 1;
          const angle = index * 2.399963 + visualTime * 0.24;
          const radius = 0.68 + (1 - travel) * 0.98;
          dustPositions[index * 3] = Math.cos(angle) * APERTURE.rx * radius;
          dustPositions[index * 3 + 1] = Math.sin(angle) * APERTURE.ry * radius;
          dustPositions[index * 3 + 2] = (1 - travel) * 2.0 - travel * 2.1;
        }
        dustGeometry.attributes.position.needsUpdate = true;
      }
      tunnel.visible = strength > 0.001;
      tunnel.position.set(playerX, playerHeight + 1.2, 0);
      tunnelMaterial.uniforms.phase.value = reduced ? 0 : elapsed + (revealing ? exitAge : 0);
      tunnelMaterial.uniforms.strength.value = strength;
      tunnelMaterial.uniforms.motion.value = reduced ? 0 : 1;
      capMaterial.opacity = strength;
      ringMaterialA.opacity = strength * (reduced ? 0.18 : 0.46);
      ringMaterialB.opacity = strength * (reduced ? 0.12 : 0.30);
      ribbonMaterials.forEach(material => { material.opacity = strength * 0.30; });
      streakMaterial.opacity = strength * 0.80;
      rings.visible = tunnel.visible;
      ribbons.visible = streaks.visible = !reduced && tunnel.visible;
      const travelTime = elapsed + (revealing ? exitAge : 0);
      const acceleration = smooth(0.25, 0.75, elapsed);
      nearBands.visible = !reduced && tunnel.visible;
      bandMaterial.uniforms.strength.value = strength * 0.64;
      for (let index = 0; index < 36; index += 1) {
        const angle = index * 2.399963;
        const radius = 7.5 + index % 9 * 0.73;
        const depth = 14 - ((index * 5.173 + 440 - travelTime * (340 + acceleration * 300) % 220) % 220);
        transform.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, depth);
        transform.rotation.set(0, 0, angle);
        transform.scale.set(0.04 + index % 3 * 0.024, 0.025, 18 + index % 5 * 6 + acceleration * 12);
        transform.updateMatrix(); nearBands.setMatrixAt(index, transform.matrix);
      }
      nearBands.instanceMatrix.needsUpdate = true;
      for (let index = 0; index < tunnelRings.length; index += 1) {
        const ring = tunnelRings[index];
        // 减少动态保留五个固定低亮轮廓，表达隧道深度，但不产生迎面流动。
        ring.visible = !reduced || index % 6 === 0;
        ring.material = reduced ? (index % 12 === 0 ? ringMaterialA : ringMaterialB)
          : (index % 2 ? ringMaterialA : ringMaterialB);
        ring.position.z = reduced ? -20 - index * 8
          : 18 - ((index * 8 + 480 - travelTime * 225 % 240) % 240);
        ring.scale.setScalar(1 + Math.sin(index * 0.3) * (reduced ? 0.025 : 0.085));
      }
      helices.forEach((ribbon, index) => { ribbon.rotation.z = travelTime * (index % 2 ? -0.3 : 0.38); });
      if (!reduced && tunnel.visible) {
        for (let index = 0; index < STREAK_COUNT; index += 1) {
          const angle = index * 2.399963;
          const radius = 4.6 + (index % 31) / 31 * 9.5;
          const z = 18 - ((index * 1.713 + 480 - travelTime * (index % 3 === 0 ? 220 : 390) % 160) % 160);
          const offset = index * 6;
          streakPositions[offset] = streakPositions[offset + 3] = Math.cos(angle) * radius;
          streakPositions[offset + 1] = streakPositions[offset + 4] = Math.sin(angle) * radius;
          streakPositions[offset + 2] = z; streakPositions[offset + 5] = z - 15 - index % 7 * 2.2;
        }
        streakGeometry.attributes.position.needsUpdate = true;
      }
      const wrapping = smooth(0.015, 0.12, elapsed) * (1 - smooth(0.4, 0.8, elapsed));
      envelope.visible = active && !reduced && wrapping > 0.001;
      envelope.position.set(playerX, playerHeight + 0.76, response.shipOffsetZ);
      envelope.scale.set(1.65 + tearPulse * 0.18, 0.95 + tearPulse * 0.18, 1.8 + tearPulse * 1.3);
      envelopeMaterial.uniforms.strength.value = wrapping;
      envelopeMaterial.uniforms.phase.value = reduced ? 0 : elapsed;
      tethers.visible = envelope.visible;
      tethers.position.set(playerX, playerHeight + 0.76, response.shipOffsetZ);
      tetherMaterial.opacity = wrapping * 0.43;
      for (let index = 0; index < 48; index += 1) {
        const angle = index * 2.399963;
        const travel = (index / 48 + elapsed * 2.2) % 1;
        const radius = (1 - travel) * (1.8 + index % 4 * 0.28) + 0.4;
        const offset = index * 6;
        tetherPositions[offset] = Math.cos(angle) * radius;
        tetherPositions[offset + 1] = Math.sin(angle) * radius * 0.70;
        tetherPositions[offset + 2] = 1.5 - travel * 9;
        tetherPositions[offset + 3] = Math.cos(angle + 0.055) * radius * 0.86;
        tetherPositions[offset + 4] = Math.sin(angle + 0.055) * radius * 0.61;
        tetherPositions[offset + 5] = -0.8 - travel * 9;
      }
      tetherGeometry.attributes.position.needsUpdate = true;
      capture.visible = active && elapsed < 0.46 && !reduced;
      capture.position.set(playerX, playerHeight + 0.6, -2.6);
      capture.scale.set(APERTURE.rx * (1 - smooth(0, 0.25, elapsed) * 0.35 + smooth(0.25, 0.46, elapsed) * 5),
        APERTURE.ry * (1 - smooth(0, 0.25, elapsed) * 0.35 + smooth(0.25, 0.46, elapsed) * 5), 1);
      captureMaterial.uniforms.phase.value = reduced ? 0 : elapsed;
      captureMaterial.uniforms.strength.value = (1 - smooth(0.27, 0.46, elapsed)) * 0.82;
      shock.visible = !reduced && (active && elapsed > 2.15 || revealing);
      shock.position.set(playerX, playerHeight + 0.7, -10);
      const shockAge = active ? elapsed - 2.15 : 0.25 + exitAge;
      shockRings.forEach((ring, index) => {
        const amount = clamp((shockAge - index * 0.045) / 0.52);
        ring.scale.setScalar(1 + amount * 30);
        ring.material.opacity = Math.sin(amount * Math.PI) * 0.65;
      });
      return response;
    }

    /** 返回当前演出、紧凑孔径与固定资源数量，用于浏览器验收。 */
    function getDiagnostics() {
      return { phase, active: response.active, gateVisible: gate.visible, gatePosition: gate.position.toArray(),
        aperture: APERTURE, strength: response.strength, fovOffset: response.fovOffset,
        hideScenery: response.hideScenery, streaks: tunnel.visible && streaks.visible ? STREAK_COUNT : 0,
        nearBands: nearBands.visible ? nearBands.count : 0, shipOffsetZ: response.shipOffsetZ,
        captureEnvelope: envelope.visible, resources: resources.size, disposed };
    }
    /** 解绑场景节点；几何和材质由调用者的 own 统一释放，避免双重处置。 */
    function dispose() { if (disposed) return; disposed = true; parent.remove(group); group.clear(); }
    return { update, getDiagnostics, dispose };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightWormhole = Object.freeze({ create, APERTURE });
})(globalThis);
