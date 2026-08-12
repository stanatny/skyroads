#!/usr/bin/env node
'use strict';

// 本地开发静态服务器：npm run dev [-- --port 7100] [-- --host 127.0.0.1]
// 零依赖，直接服务仓库根目录（index.html + src/ + styles/ + assets/）。

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
let port = Number(process.env.PORT) || 7100;
let host = process.env.HOST || '127.0.0.1';
for (let i = 0; i < args.length; i += 1) {
  if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
    port = Number(args[i + 1]) || port;
    i += 1;
  } else if (args[i] === '--host' && args[i + 1]) {
    host = args[i + 1];
    i += 1;
  } else if (args[i].startsWith('--port=')) {
    port = Number(args[i].slice(7)) || port;
  } else if (args[i].startsWith('--host=')) {
    host = args[i].slice(7);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Nebula Cruise dev server: http://${host}:${port}/`);
});
