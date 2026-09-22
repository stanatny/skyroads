'use strict';

// 银河由确定性星尘、暗带和恒星组成，只作为远景，不创建灯光或游戏实体。
(function attachFlightGalaxy(scope) {
  /** 创建银河远景；parent 接收网格，own 管理资源，返回像素比例设置和诊断接口。 */
  function create({ THREE, parent, own, sphere }) {
    const group = new THREE.Group();
    group.name = 'milky_way_starfield';
    parent.add(group);
    const material = own(new THREE.ShaderMaterial({
      vertexShader: `varying vec3 direction;
        void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 direction;
        float hash(vec3 p) { p=fract(p*0.3183099+vec3(0.13,0.27,0.39)); p*=17.0;
          return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 p) { vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p) { return noise(p)*0.53+noise(p*2.07+5.7)*0.28+noise(p*4.19+13.1)*0.13+noise(p*8.37)*0.06; }
        float square(float value) { return value*value; }
        void main() {
          vec3 d=normalize(direction);
          float broadCloud=fbm(d*6.0+vec3(2.0,9.0,1.0));
          float fineCloud=fbm(d*27.0+vec3(7.1,2.0,4.0));
          float grain=noise(d*180.0);
          float plane=dot(d,normalize(vec3(0.19,0.96,0.13)))+(broadCloud-0.5)*0.11;
          float halo=exp(-square(plane/0.20));
          float band=exp(-square(plane/0.078));
          float bulge=pow(max(0.0,dot(d,normalize(vec3(-0.35,0.20,-0.91)))),12.0);
          float clouds=smoothstep(0.22,0.80,fineCloud)*(0.74+grain*0.26);
          float rift=exp(-square((plane+0.009+(fineCloud-0.5)*0.085)/0.025));
          float dust=rift*smoothstep(0.32,0.62,fbm(d*38.0+11.0));
          vec3 color=vec3(0.006,0.011,0.022);
          color+=vec3(0.022,0.032,0.060)*halo*(0.5+broadCloud);
          color+=vec3(0.135,0.148,0.178)*band*(0.24+clouds*0.90);
          color+=vec3(0.140,0.111,0.092)*bulge*halo*clouds;
          color+=vec3(0.028,0.014,0.041)*halo*smoothstep(0.50,0.72,broadCloud);
          color*=1.0-dust*0.82;
          gl_FragColor=vec4(color,1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    const dome = new THREE.Mesh(sphere || own(new THREE.SphereGeometry(1, 40, 28)), material);
    dome.name = 'galactic_dust_dome';
    dome.scale.setScalar(1100);
    dome.renderOrder = -10;
    group.add(dome);
    const positions = [];
    const colors = [];
    const sizes = [];
    let seed = 9173;
    const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    const normal = new THREE.Vector3(0.19, 0.96, 0.13).normalize();
    const along = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 0, 1)).normalize();
    const across = new THREE.Vector3().crossVectors(normal, along).normalize();
    const direction = new THREE.Vector3();
    for (let index = 0; index < 3400; index += 1) {
      const azimuth = random() * Math.PI * 2;
      if (index < 2000) {
        const y = random() * 2 - 1;
        const radial = Math.sqrt(1 - y * y);
        direction.set(radial * Math.cos(azimuth), y, radial * Math.sin(azimuth));
      } else {
        // 银河平面中加入密集细星；沿完整天球铺设，转向时也没有贴图边界。
        const spread = (random() + random() + random() - 1.5) * 0.095;
        direction.copy(along).multiplyScalar(Math.cos(azimuth))
          .addScaledVector(across, Math.sin(azimuth)).addScaledVector(normal, spread).normalize();
      }
      const radius = 770 + random() * 180;
      positions.push(direction.x * radius, direction.y * radius, direction.z * radius);
      const bright = index < 2000 ? 0.30 + random() * 0.63 : 0.32 + random() * 0.52;
      const warm = random() > 0.82;
      colors.push(bright * (warm ? 1 : 0.77), bright * (warm ? 0.85 : 0.89), bright * (warm ? 0.68 : 1));
      sizes.push(index < 2000 ? 0.85 + Math.pow(random(), 4) * 1.8 : 0.8 + random() * 0.70);
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('starSize', new THREE.Float32BufferAttribute(sizes, 1));
    const starsMaterial = own(new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 } },
      // 恒星始终位于深空远裁面，避免有限半径星球把星点画到远站前面。
      vertexShader: `attribute vec3 color; attribute float starSize; uniform float pixelRatio; varying vec3 tint;
        void main() { tint=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          gl_Position.z=gl_Position.w*0.9999;
          gl_PointSize=starSize*pixelRatio; }`,
      fragmentShader: `varying vec3 tint;
        void main() { float radius=length(gl_PointCoord-0.5)*2.0;
          float alpha=1.0-smoothstep(0.12,1.0,radius); gl_FragColor=vec4(tint,alpha); }`,
      transparent: true, depthWrite: false, fog: false, toneMapped: false,
    }));
    const stars = new THREE.Points(geometry, starsMaterial);
    stars.name = 'galactic_stars';
    group.add(stars);
    return { group,
      setPixelRatio: ratio => { starsMaterial.uniforms.pixelRatio.value = Math.max(1, Math.min(2, Number(ratio) || 1)); },
      getDiagnostics: () => ({ name: group.name, stars: 3400, drawCalls: 2, animated: false, externalAssets: false }),
    };
  }
  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.flightGalaxy = Object.freeze({ create });
})(globalThis);
