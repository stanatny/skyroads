'use strict';

// 将官方 CommonJS 单文件包封装为 classic script，确保本地文件与 WebView 可离线使用。
// 用法：node tools/vendor_three.js /path/to/extracted/three/package
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const packageDirectory = process.argv[2];
if (!packageDirectory) throw new Error('Expected extracted three@0.170.0 package directory');
const metadata = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
if (metadata.version !== '0.170.0') throw new Error('Expected three@0.170.0');
const source = fs.readFileSync(path.join(packageDirectory, 'build/three.cjs'), 'utf8');
const root = path.resolve(__dirname, '..');
const output = '/*! Three.js r170 | MIT | https://github.com/mrdoob/three.js */\n'
  + '(function () {\nconst exports = {};\n' + source + '\nglobalThis.THREE = exports;\n}());\n';
fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets/vendor/three_r170.js'), output);
fs.copyFileSync(path.join(packageDirectory, 'LICENSE'), path.join(root, 'licenses/three_mit.txt'));
console.log(JSON.stringify({ version: metadata.version, bytes: Buffer.byteLength(output),
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  outputSha256: crypto.createHash('sha256').update(output).digest('hex') }, null, 2));
