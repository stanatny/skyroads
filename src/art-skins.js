'use strict';

// v8 美术方向：Hugging Face（FLUX.1-schnell）生成的贴图直接接管程序化几何的固有色、
// 自发光与粗糙度。
//
// 为什么需要三轴投影：飞行渲染器里的墙、无人机、炮塔、空间站和飞船都是代码生成的
// 合并网格，合并时只保留 position/normal/color（见 flight_obstacles.js:finish 等），
// 没有 uv 属性。直接给材质塞 map 会采样 (0,0) 那个 texel，整块变成纯色。这里用
// onBeforeCompile 注入三轴投影，用物体空间坐标采样，替代缺失的 uv。
//
// 与 v7 的区别：v7 只让贴图调制亮度（`diffuseColor *= gain`），所以换贴图几乎看不出
// 变化。v8 的 albedo 层会把贴图的**固有色**混进材质（`artAlbedoMix`），并额外提供
// 自发光层（发光导管/警示灯）和粗糙度调制，整个画面因此会真正换色。
//
// 一个材质可能同时要 albedo + emissive + detail，而 onBeforeCompile 是单槽位：这里
// 用 `paint()` 累积图层，只注入一次；同时通过 `chain()` 与别的注入（例如
// flight_renderer 的坡面剪切法线）共存，不会互相覆盖。
(function attachArtSkins(scope) {
  const textures = new Map();
  const painters = new WeakMap();
  const loadedUrls = [];
  const paintedKeys = new Set();
  const painterList = new Set();
  // 逐元素消融开关：`?noart=wall,ship` 或 globalThis.SKYROADS_ART_OFF = ['wall']
  // 让截图脚本能单独关掉某一类元素的美术层，用像素差证明"这张贴图真的出现在画面上"。
  const ablated = new Set(readAblations());

  function readAblations() {
    const keys = new Set();
    const global = scope.SKYROADS_ART_OFF;
    if (typeof global === 'string' || Array.isArray(global)) {
      for (const key of [].concat(global)) keys.add(String(key).trim());
    }
    try {
      const search = scope.location && scope.location.search;
      if (search) {
        const query = new URLSearchParams(search).get('noart');
        if (query) for (const key of query.split(',')) keys.add(key.trim());
      }
    } catch (_) { /* 非浏览器环境没有 location */ }
    return [...keys].filter(Boolean);
  }

  /** 某个 key 的前缀是否被消融（wall 同时关掉 wall-armor / wall-* 相关层）。 */
  function ablatedFor(key) {
    if (!key || !ablated.size) return false;
    for (const entry of ablated) {
      if (key === entry || key.startsWith(`${entry}-`) || key.startsWith(`${entry}_`)) return true;
    }
    return false;
  }

  function configure(texture, THREE, { srgb = true, repeat = 0, wrap = 'mirror' } = {}) {
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    // v11：HF 贴图的图案会跨边界被切断，直接 Repeat 会在每块重复处留下硬接缝。
    // 镜像重复让边界连续（代价是偶对称，远看不可辨），比切成 Repeat 干净得多。
    const mode = wrap === 'repeat' ? THREE.RepeatWrapping : THREE.MirroredRepeatWrapping;
    texture.wrapS = mode;
    texture.wrapT = mode;
    if (repeat > 0) texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
    return texture;
  }

  /** 懒加载一张美术贴图；同一 URL 只请求一次，就绪后回调（可多层回调）。 */
  function loadTexture(THREE, url, options = {}) {
    if (!THREE || typeof THREE.TextureLoader !== 'function') return null;
    const key = url;
    let entry = textures.get(key);
    if (!entry) {
      entry = { texture: null, ready: false, waiters: [] };
      textures.set(key, entry);
      try {
        const loader = new THREE.TextureLoader();
        const handle = loader.load(url, (loaded) => {
          entry.texture = configure(loaded, THREE, options);
          entry.ready = true;
          loadedUrls.push(url);
          for (const waiter of entry.waiters.splice(0)) {
            try { waiter(entry.texture); } catch (_) { /* 单个消费者失败不影响其它材质 */ }
          }
        }, undefined, () => { entry.waiters.length = 0; });
        if (handle) entry.pending = configure(handle, THREE, options);
      } catch (_) {
        textures.delete(key);
        return null;
      }
    }
    if (typeof options.onReady === 'function') {
      if (entry.ready) options.onReady(entry.texture);
      else entry.waiters.push(options.onReady);
    }
    return entry.texture || entry.pending || null;
  }

  const VERTEX_DECL = `varying vec3 vArtPos; varying vec3 vArtNormal;
    vec3 vArtPos; vec3 vArtNormal;`;

  const SAMPLE = `
    vec3 artSampleTri(sampler2D tex, vec3 p, vec3 n, float scale) {
      vec3 weight = pow(abs(normalize(n)), vec3(4.0));
      weight /= max(weight.x + weight.y + weight.z, 1e-4);
      return texture2D(tex, p.zy * scale).rgb * weight.x
           + texture2D(tex, p.xz * scale).rgb * weight.y
           + texture2D(tex, p.xy * scale).rgb * weight.z;
    }`;

  /** 把注入函数挂到材质上，但保留已有的注入（地形剪切法线等）。 */
  function chain(material, compile, cacheKey) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = function chained(shader, renderer) {
      if (typeof previous === 'function') previous.call(this, shader, renderer);
      compile(shader, renderer);
    };
    material.customProgramCacheKey = function chainedKey() {
      const inherited = typeof previousKey === 'function' ? previousKey.call(this) : '';
      return `${inherited}|${cacheKey}`;
    };
  }

  function ensurePainter(material, THREE, key) {
    let painter = painters.get(material);
    if (painter) return painter;
    painter = { albedo: null, emissive: null, detail: null, rough: 0, key, version: 0 };
    painters.set(material, painter);
    painterList.add(painter);
    // 注入函数只挂一次，编译时现读 painter 状态；缓存键带版本号——材质通常在贴图
    // 到达前就已经渲染过一次，固定缓存键会让 three 复用没有图层的旧 program。
    chain(material, (shader) => compile(shader, painter), `skyroads_art_${key}_${painter.version}`);
    return painter;
  }

  /** 图层变化后重新编译：换缓存键 + needsUpdate，不重复挂 onBeforeCompile。 */
  function bump(material, painter) {
    painter.version += 1;
    const previousKey = material.userData && material.userData.artBaseKey;
    material.customProgramCacheKey = () => `skyroads_art_${painter.key}_${painter.version}${previousKey || ''}`;
    material.needsUpdate = true;
  }

  function compile(shader, painter) {
    const defines = [];
    const uniforms = [];
    if (painter.albedo) {
      defines.push('#define SKYROADS_ART_ALBEDO');
      uniforms.push('uniform sampler2D artAlbedoMap; uniform float artAlbedoScale;',
        'uniform float artAlbedoMix; uniform float artAlbedoLuma; uniform float artAlbedoGain;',
        'uniform vec3 artAlbedoTint;');
      shader.uniforms.artAlbedoMap = { value: painter.albedo.texture };
      shader.uniforms.artAlbedoScale = { value: painter.albedo.scale };
      shader.uniforms.artAlbedoMix = { value: painter.albedo.mix };
      shader.uniforms.artAlbedoLuma = { value: painter.albedo.luma };
      shader.uniforms.artAlbedoGain = { value: painter.albedo.gain };
      shader.uniforms.artAlbedoTint = { value: painter.albedo.tint };
      painter.albedo.bound = shader.uniforms;
    }
    if (painter.emissive) {
      defines.push('#define SKYROADS_ART_EMISSIVE');
      uniforms.push('uniform sampler2D artEmissiveMap; uniform float artEmissiveScale;',
        'uniform vec3 artEmissiveColor; uniform float artEmissiveGain;');
      shader.uniforms.artEmissiveMap = { value: painter.emissive.texture };
      shader.uniforms.artEmissiveScale = { value: painter.emissive.scale };
      shader.uniforms.artEmissiveColor = { value: painter.emissive.color };
      shader.uniforms.artEmissiveGain = { value: painter.emissive.gain };
      painter.emissive.bound = shader.uniforms;
    }
    if (painter.detail) {
      defines.push('#define SKYROADS_ART_DETAIL');
      uniforms.push('uniform sampler2D artDetailMap; uniform float artDetailScale;',
        'uniform float artDetailStrength; uniform float artDetailContrast;');
      shader.uniforms.artDetailMap = { value: painter.detail.texture };
      shader.uniforms.artDetailScale = { value: painter.detail.scale };
      shader.uniforms.artDetailStrength = { value: painter.detail.strength };
      shader.uniforms.artDetailContrast = { value: painter.detail.contrast };
      painter.detail.bound = shader.uniforms;
    }
    if (painter.rim) {
      defines.push('#define SKYROADS_ART_RIM');
      uniforms.push('uniform vec3 artRimColor; uniform float artRimGain;');
      shader.uniforms.artRimColor = { value: painter.rim.color };
      shader.uniforms.artRimGain = { value: painter.rim.gain };
      painter.rim.bound = shader.uniforms;
    }
    if (painter.bump && painter.albedo) {
      defines.push('#define SKYROADS_ART_BUMP');
      uniforms.push('uniform float artBumpGain;');
      shader.uniforms.artBumpGain = { value: painter.bump.gain };
      painter.bump.bound = shader.uniforms;
    }
    painter.compiled = defines.slice();
    if (!defines.length) return;

    shader.vertexShader = `${defines.join('\n')}\nvarying vec3 vArtPos;\nvarying vec3 vArtNormal;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vArtPos = transformed;\n  vArtNormal = objectNormal;');

    let fragment = `${defines.join('\n')}\nvarying vec3 vArtPos;\nvarying vec3 vArtNormal;\n${uniforms.join('\n')}\n${SAMPLE}\n${shader.fragmentShader}`;

    const albedoChunk = [];
    if (painter.albedo) {
      albedoChunk.push(`
        vec3 artAlbedo = artSampleTri(artAlbedoMap, vArtPos, vArtNormal, artAlbedoScale);
        float artAlbedoLumaValue = dot(artAlbedo, vec3(0.299, 0.587, 0.114));
        vec3 artHue = artAlbedo / max(artAlbedoLumaValue, 1e-3);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * artHue * artAlbedoTint, artAlbedoLuma);
        diffuseColor.rgb = mix(diffuseColor.rgb, artAlbedo * artAlbedoTint, artAlbedoMix);
        diffuseColor.rgb *= 1.0 + (artAlbedoLumaValue - 0.42) * artAlbedoGain;`);
    }
    if (painter.detail) {
      albedoChunk.push(`
        float artDetailLuma = dot(artSampleTri(artDetailMap, vArtPos, vArtNormal, artDetailScale),
          vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= mix(1.0, 1.0 + (artDetailLuma - 0.48) * artDetailContrast, artDetailStrength);`);
    }
    if (albedoChunk.length) {
      fragment = fragment.replace('#include <map_fragment>', `#include <map_fragment>${albedoChunk.join('')}`);
    }
    if (painter.emissive) {
      fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += artSampleTri(artEmissiveMap, vArtPos, vArtNormal, artEmissiveScale)
          * artEmissiveColor * artEmissiveGain;`);
    }
    if (painter.rim) {
      // 边缘光：让机体从满屏霓虹里"立"起来。用 fresnel 加在自发光通道，不引入新的光照 pass。
      fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float artRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0),
            ${painter.rim.power.toFixed(2)});
          totalEmissiveRadiance += artRimColor * artRim * artRimGain;
        }`);
    }
    if (painter.bump && painter.albedo) {
      // 无 uv 几何的假凹凸：用贴图亮度当高度场，按屏幕空间导数改写法线
      // （Mikkelsen 的 surface-gradient 法）。板缝因此真的会被光照"勾"出立体感，
      // 而不是只有一张平涂的图贴在盒子上。
      fragment = fragment.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float artBumpHeight = dot(artSampleTri(artAlbedoMap, vArtPos, vArtNormal, artAlbedoScale),
            vec3(0.299, 0.587, 0.114));
          vec3 artViewPos = -vViewPosition;
          vec3 artDpdx = dFdx(artViewPos);
          vec3 artDpdy = dFdy(artViewPos);
          vec3 artR1 = cross(artDpdy, normal);
          vec3 artR2 = cross(normal, artDpdx);
          float artDet = dot(artDpdx, artR1);
          vec3 artGradient = sign(artDet) * (dFdx(artBumpHeight) * artR1 + dFdy(artBumpHeight) * artR2);
          normal = normalize(abs(artDet) * normal - artBumpGain * artGradient);
        }`);
    }
    if (painter.rough && painter.albedo) {
      fragment = fragment.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.42 + artAlbedoLumaValue * 1.35, ${painter.rough.toFixed(2)}), 0.06, 1.0);`);
    }
    shader.fragmentShader = fragment;
  }

  function textureUrl(value) {
    return typeof value === 'string' ? value : (value && value.url) || null;
  }

  /**
   * 给一个 MeshStandardMaterial/MeshPhysicalMaterial 上美术皮肤。
   *
   *   paint(material, THREE, {
   *     key: 'wall',
   *     albedo:   { url, scale, mix (0-1 固有色占比), luma (0-1 亮度色相占比), tint, gain },
   *     emissive: { url, scale, color, gain },
   *     detail:   { url, scale, strength, contrast },
   *     rough:    0-1 用 albedo 亮度调制粗糙度,
   *   })
   *
   * 贴图异步加载；未就绪前材质保持原样（程序化回退），加载完成后重建着色器。
   */
  function paint(material, THREE, options = {}) {
    if (!material || typeof material.onBeforeCompile !== 'function' || !THREE) return false;
    const key = options.key || 'skin';
    if (ablatedFor(key)) return false;
    const painter = ensurePainter(material, THREE, key);
    const started = [];
    if (options.albedo && textureUrl(options.albedo)) {
      const spec = options.albedo;
      started.push(loadTexture(THREE, textureUrl(spec), {
        onReady: (texture) => {
          painter.albedo = {
            texture,
            scale: spec.scale === undefined ? 0.5 : spec.scale,
            mix: spec.mix === undefined ? 0.55 : spec.mix,
            luma: spec.luma === undefined ? 0.45 : spec.luma,
            gain: spec.gain === undefined ? 0.55 : spec.gain,
            tint: new THREE.Color(spec.tint === undefined ? 0xffffff : spec.tint),
          };
          bump(material, painter);
        },
      }));
    }
    if (options.emissive && textureUrl(options.emissive)) {
      const spec = options.emissive;
      started.push(loadTexture(THREE, textureUrl(spec), {
        onReady: (texture) => {
          painter.emissive = {
            texture,
            scale: spec.scale === undefined ? 0.5 : spec.scale,
            color: new THREE.Color(spec.color === undefined ? 0xffffff : spec.color),
            gain: spec.gain === undefined ? 1.0 : spec.gain,
          };
          bump(material, painter);
        },
      }));
    }
    if (options.detail && textureUrl(options.detail)) {
      const spec = options.detail;
      started.push(loadTexture(THREE, textureUrl(spec), {
        onReady: (texture) => {
          painter.detail = {
            texture,
            scale: spec.scale === undefined ? 0.5 : spec.scale,
            strength: spec.strength === undefined ? 0.4 : spec.strength,
            contrast: spec.contrast === undefined ? 2.0 : spec.contrast,
          };
          bump(material, painter);
        },
      }));
    }
    if (options.rough) painter.rough = Math.max(0, Math.min(1, options.rough));
    if (options.bump && options.albedo) {
      painter.bump = { gain: Math.max(0, Math.min(4, options.bump)) };
      bump(material, painter);
    }
    if (options.rim) {
      painter.rim = {
        color: new THREE.Color(options.rim.color === undefined ? 0x7df3ff : options.rim.color),
        gain: options.rim.gain === undefined ? 0.35 : options.rim.gain,
        power: options.rim.power === undefined ? 3.0 : options.rim.power,
      };
      bump(material, painter);
    }
    if (material.userData) material.userData.artKey = painter.key;
    paintedKeys.add(painter.key);
    return started.some(Boolean);
  }

  /** v7 兼容：只叠亮度细节，不接管色相。 */
  function triplanarDetail(material, THREE, url, { scale = 1, strength = 0.6, contrast = 3.2, key } = {}) {
    return paint(material, THREE, { key: key || url, detail: { url, scale, strength, contrast } });
  }

  /** 诊断：贴图是否真的下载/挂载成功，截图脚本据此判断是不是拍到了回退材质。 */
  function stats() {
    return { textures: loadedUrls.slice(),
      materials: [...paintedKeys].sort(),
      off: [...ablated],
      layers: [...painterList].reduce((sum, painter) =>
        sum + (painter.albedo ? 1 : 0) + (painter.emissive ? 1 : 0) + (painter.detail ? 1 : 0)
        + (painter.rim ? 1 : 0) + (painter.bump ? 1 : 0), 0),
      // 诊断：贴图有没有真的进到编译后的着色器里。'compiled' 为空数组说明
      // onBeforeCompile 注入被别的注入顶掉了，此时换贴图不会改变画面。
      painters: [...painterList].map((painter) => ({
        key: painter.key,
        compiled: painter.compiled || [],
        albedoMix: painter.albedo ? painter.albedo.mix : null,
        albedoScale: painter.albedo ? painter.albedo.scale : null,
        bound: painter.albedo && painter.albedo.bound ? painter.albedo.bound.artAlbedoMix.value : null,
        bump: painter.bump ? painter.bump.gain : null,
        rim: painter.rim ? painter.rim.gain : null,
      })) };
  }

  scope.Skyroads = scope.Skyroads || {};
  scope.Skyroads.artSkins = Object.freeze({ loadTexture, paint, triplanarDetail, chain, stats });
})(globalThis);
