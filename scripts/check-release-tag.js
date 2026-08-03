'use strict';

const packageJson = require('../package.json');

function expectedReleaseTag(version) { return `v${String(version)}`; }

function validateReleaseTag(actual, version) {
  return String(actual || '') === expectedReleaseTag(version);
}

if (require.main === module) {
  const actual = process.argv[2] || process.env.RELEASE_TAG || '';
  const expected = expectedReleaseTag(packageJson.version);
  if (!validateReleaseTag(actual, packageJson.version)) {
    console.error(`Release tag ${actual || '<empty>'} does not match ${expected}`);
    process.exitCode = 1;
  }
}

module.exports = { expectedReleaseTag, validateReleaseTag };
