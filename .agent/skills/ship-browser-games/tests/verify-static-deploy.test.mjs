import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(skillRoot, 'scripts/verify-static-deploy.mjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-deploy-test-'));
  const publicRoot = path.join(root, 'public');
  fs.mkdirSync(publicRoot);
  fs.writeFileSync(path.join(root, 'alpha.txt'), 'same\n');
  fs.writeFileSync(path.join(root, 'file with space.txt'), 'space\n');
  fs.writeFileSync(path.join(publicRoot, 'alpha.txt'), 'same\n');
  fs.writeFileSync(path.join(publicRoot, 'file with space.txt'), 'space\n');
  git(root, 'init');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'add', 'alpha.txt', 'file with space.txt');
  git(root, 'commit', '-m', 'fixture');
  const ref = git(root, 'rev-parse', 'HEAD');
  return { root, publicRoot, ref };
}

async function withServer(publicRoot, callback) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const target = path.join(publicRoot, pathname);
    if (!fs.existsSync(target)) {
      response.writeHead(404);
      response.end('missing');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.end(fs.readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('close', (status, signal) => resolve({
      status,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

test('matching files report equal SHA-256 without mutating the checkout', async () => {
  const repo = fixture();
  const before = git(repo.root, 'status', '--porcelain=v1');
  await withServer(repo.publicRoot, async (baseUrl) => {
    const result = await run([
      '--root', repo.root,
      '--ref', repo.ref,
      '--base-url', baseUrl,
      '--file', 'alpha.txt',
      '--file', 'file with space.txt',
      '--cache-bust', 'commit=test',
      '--json',
    ]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.evidenceBoundary, 'static-bytes-only');
    assert.equal(report.files.length, 2);
    assert.ok(report.files.every((file) => file.match && file.httpStatus === 200));
  });
  assert.equal(git(repo.root, 'status', '--porcelain=v1'), before);
});

test('cache busting preserves encoded file paths', async () => {
  const repo = fixture();
  await withServer(repo.publicRoot, async (baseUrl, requests) => {
    const result = await run([
      '--root', repo.root,
      '--ref', repo.ref,
      '--base-url', baseUrl,
      '--file', 'file with space.txt',
      '--cache-bust', 'verify=abc',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(requests.some((url) => url.startsWith('/file%20with%20space.txt?verify=abc')));
  });
});

test('mismatch and missing remote files fail with per-file evidence', async () => {
  const repo = fixture();
  fs.writeFileSync(path.join(repo.publicRoot, 'alpha.txt'), 'different\n');
  fs.rmSync(path.join(repo.publicRoot, 'file with space.txt'));
  await withServer(repo.publicRoot, async (baseUrl) => {
    const mismatch = await run([
      '--root', repo.root,
      '--ref', repo.ref,
      '--base-url', baseUrl,
      '--file', 'alpha.txt',
      '--json',
    ]);
    assert.notEqual(mismatch.status, 0);
    const mismatchReport = JSON.parse(mismatch.stdout);
    assert.equal(mismatchReport.ok, false);
    assert.equal(mismatchReport.files[0].match, false);

    const missing = await run([
      '--root', repo.root,
      '--ref', repo.ref,
      '--base-url', baseUrl,
      '--file', 'file with space.txt',
      '--json',
    ]);
    assert.notEqual(missing.status, 0);
    const missingReport = JSON.parse(missing.stdout);
    assert.equal(missingReport.ok, false);
    assert.equal(missingReport.files[0].httpStatus, 404);
  });
});

test('invalid input fails without an unhandled stack trace', async () => {
  const result = await run(['--root', '/missing', '--base-url', 'not-a-url']);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.match(result.stderr, /Usage:|invalid|missing/i);
});
