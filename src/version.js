'use strict';

(function attachVersion(root) {
  const semver = '1.1.1';
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!match) throw new TypeError(`Invalid product version: ${semver}`);
  const api = Object.freeze({
    semver,
    display: `V${match[1]}.${match[2]}`,
    accessible: `${match[1]}.${match[2]}`,
    tag: `v${semver}`,
  });
  root.Skyroads = root.Skyroads || {};
  root.Skyroads.version = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
