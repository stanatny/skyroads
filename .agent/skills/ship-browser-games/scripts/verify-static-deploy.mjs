#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const usage = [
  'Usage: verify-static-deploy.mjs --root <checkout> --ref <git-ref> --base-url <url>',
  '  --file <path> [--file <path> ...] [--cache-bust <query>] [--timeout-ms <ms>] [--json]',
].join('\n');

function parseArgs(argv) {
  const result = { files: [], timeoutMs: 120000, json: false, cacheBust: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      result.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${argument}`);
    if (argument === '--root') result.root = value;
    else if (argument === '--ref') result.ref = value;
    else if (argument === '--base-url') result.baseUrl = value;
    else if (argument === '--file') result.files.push(value);
    else if (argument === '--cache-bust') result.cacheBust = value.replace(/^\?/, '');
    else if (argument === '--timeout-ms') result.timeoutMs = Number(value);
    else throw new Error(`unknown argument: ${argument}`);
    index += 1;
  }
  if (!result.root || !result.ref || !result.baseUrl || result.files.length === 0) {
    throw new Error('missing required arguments');
  }
  if (!fs.existsSync(result.root)) throw new Error(`invalid root: ${result.root}`);
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs <= 0) {
    throw new Error('invalid timeout-ms');
  }
  const base = new URL(result.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('invalid base-url');
  result.base = base;
  return result;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitFile(root, ref, file) {
  const result = spawnSync('git', ['show', `${ref}:${file}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const message = Buffer.from(result.stderr || '').toString('utf8').trim();
    throw new Error(message || `git show failed for ${file}`);
  }
  return Buffer.from(result.stdout);
}

function remoteUrl(base, file, cacheBust) {
  const url = new URL(base.toString());
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}${file.split('/').map(encodeURIComponent).join('/')}`.replace(/\/+/g, '/');
  if (cacheBust) url.search = cacheBust;
  return url;
}

async function inspectFile(options, file) {
  let local;
  try {
    local = gitFile(options.root, options.ref, file);
  } catch (error) {
    return {
      file,
      url: remoteUrl(options.base, file, options.cacheBust).toString(),
      httpStatus: null,
      bytes: null,
      localSha256: null,
      remoteSha256: null,
      match: false,
      error: error.message,
    };
  }

  const url = remoteUrl(options.base, file, options.cacheBust);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs) });
    const remote = Buffer.from(await response.arrayBuffer());
    const localSha256 = hash(local);
    const remoteSha256 = hash(remote);
    return {
      file,
      url: url.toString(),
      httpStatus: response.status,
      bytes: remote.length,
      localSha256,
      remoteSha256,
      match: response.ok && localSha256 === remoteSha256,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      file,
      url: url.toString(),
      httpStatus: null,
      bytes: null,
      localSha256: hash(local),
      remoteSha256: null,
      match: false,
      error: error.message,
    };
  }
}

function textReport(report) {
  const lines = report.files.map((file) => [
    file.match ? 'MATCH' : 'FAIL',
    file.file,
    file.httpStatus ?? '-',
    file.bytes ?? '-',
    file.localSha256 ?? '-',
    file.remoteSha256 ?? '-',
    file.error ?? '',
  ].join('\t'));
  lines.push(`result\t${report.ok ? 'ok' : 'failed'}`);
  lines.push('evidence-boundary\tstatic-bytes-only; verify runtime behavior separately');
  return `${lines.join('\n')}\n`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${usage}\nError: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const files = [];
  for (const file of options.files) files.push(await inspectFile(options, file));
  const report = {
    ok: files.every((file) => file.match),
    root: path.resolve(options.root),
    ref: options.ref,
    baseUrl: options.base.toString(),
    cacheBust: options.cacheBust || null,
    evidenceBoundary: 'static-bytes-only',
    note: 'Static byte equality does not prove gameplay, console, service worker, authentication, backend, or packaged-runtime behavior.',
    files,
  };
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : textReport(report));
  if (!report.ok) process.exitCode = 1;
}

await main();
