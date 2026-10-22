'use strict';

// v1.3.4 美术回归守卫：这一版把整屏画面交给 Hugging Face 生成的贴图（assets/art/）。
// 贴图是运行时异步加载、失败静默回退的，所以路径写错、文件没提交、或 index.html 忘了
// 引 art-skins.js，游戏都不会报错——只会安静地画回程序化材质，看起来"改了什么都没变化"。
// 三轮美术返工里最贵的一次就是这么来的，这里用静态断言把它钉住。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ART_DIR = path.join(root, 'assets', 'art');
// 少一张就够让某个元素退回程序化材质，所以逐张列出而不是只数个数。
const REQUIRED = [
  'drone-shell', 'moon', 'nebula-veil', 'planet', 'road-deck',
  'ship-emissive', 'ship-hull', 'station-hull', 'wall-armor', 'wall-emissive', 'sky',
];
const CONSUMERS = [
  'src/flight_renderer.js', 'src/flight_obstacles.js', 'src/flight_objects.js',
  'src/flight_environment.js', 'src/flight_ship.js',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('every Hugging Face art texture referenced by src/ exists and carries real detail', () => {
  const referenced = new Set();
  for (const file of CONSUMERS) {
    const source = read(file);
    // 蒙皮走 artSkins.paint({ url: './assets/art/x.webp' })，环境贴图走 loadArt('x', ...)。
    for (const match of source.matchAll(/\.\/assets\/art\/([a-z0-9-]+)\.webp/g)) referenced.add(match[1]);
    for (const match of source.matchAll(/loadArt\('([a-z0-9-]+)'/g)) referenced.add(match[1]);
  }
  assert.deepEqual([...referenced].sort(), [...REQUIRED].sort(),
    'src/ 引用的贴图清单变了：新增/删除贴图时同步更新 REQUIRED');
  for (const name of REQUIRED) {
    const file = path.join(ART_DIR, `${name}.webp`);
    assert.ok(fs.existsSync(file), `${name}.webp 缺失，运行时该元素会静默退回程序化材质`);
    assert.ok(fs.statSync(file).size > 20 * 1024, `${name}.webp 过小，可能是占位图或烘图失败`);
  }
});

test('index.html loads art-skins.js before every module that paints a skin', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/<script defer src="\.\/(src\/[^"]+)"/g)].map((match) => match[1]);
  const skinIndex = order.indexOf('src/art-skins.js');
  assert.notEqual(skinIndex, -1, 'index.html 没有加载 art-skins.js，所有贴图层都不会生效');
  for (const consumer of CONSUMERS) {
    const index = order.indexOf(consumer);
    assert.notEqual(index, -1, `index.html 没有加载 ${consumer}`);
    assert.ok(skinIndex < index, `${consumer} 在 art-skins.js 之前加载，paint() 拿不到注入器`);
  }
});

test('art skins stay inert without three.js, a material or a texture loader', () => {
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const file of ['src/art-skins.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }
  const skins = sandbox.Skyroads.artSkins;
  // node 环境没有 TextureLoader：paint 必须返回 false 而不是抛错，材质保持程序化。
  const fakeMaterial = { onBeforeCompile() {}, customProgramCacheKey: () => '' };
  assert.equal(skins.paint(fakeMaterial, null, { key: 'wall' }), false);
  assert.equal(skins.paint(null, {}, { key: 'wall' }), false);
  assert.doesNotThrow(() => skins.stats());
  // vm 沙箱里的数组来自另一个 realm，先摊平再比结构。
  assert.deepEqual([...skins.stats().materials], []);
});

test('the ablation switch really disables a skin, per element', () => {
  // URLSearchParams 是宿主环境提供的 Web 全局，vm 沙箱里必须显式注入。
  const sandbox = { console, URLSearchParams, location: { search: '?noart=wall,ship' } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/art-skins.js'), 'utf8'), sandbox,
    { filename: 'src/art-skins.js' });
  const skins = sandbox.Skyroads.artSkins;
  const fakeMaterial = { onBeforeCompile() {}, customProgramCacheKey: () => '' };
  const THREE = { TextureLoader: function TextureLoader() { this.load = () => ({}); } };
  // 被消融的元素返回 false，paint 不挂任何图层；没被消融的元素请求了贴图应返回 true。
  assert.equal(skins.paint(fakeMaterial, THREE, { key: 'wall', albedo: { url: './assets/art/wall-armor.webp' } }), false);
  assert.equal(skins.paint(fakeMaterial, THREE, { key: 'ship-ceramic', albedo: { url: './assets/art/ship-hull.webp' } }), false);
  assert.equal(skins.paint(fakeMaterial, THREE, { key: 'drone-shell', albedo: { url: './assets/art/drone-shell.webp' } }), true);
  assert.deepEqual([...skins.stats().off], ['wall', 'ship']);
  assert.deepEqual([...skins.stats().materials], ['drone-shell']);
});
