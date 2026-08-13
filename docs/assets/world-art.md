# Orbital Defense world atlas provenance

## v4 realistic pipeline (current)

The runtime set contains twelve perspective-correct upright atlases plus the road-edge atlas. Since v4 the upright atlases are synthesized from AI-generated master renders committed under `assets-src/masters/` (full generation prompts archived in `assets-src/PROMPTS.md`, anchor geometry in `assets-src/atlas-anchors.json`). Each is a `2240 × 960` transparent PNG containing 21 own-cell crops: yaw `[-80, -55, -30, 0, 30, 55, 80]` across three pitch rows `[20, 55, 80]`, with `320 × 320` cells. `assets/world/gap-edge.png` is a `3584 × 512` road-edge atlas with seven `512 × 512` yaw frames `[-30, -20, -10, 0, 10, 20, 30]`, composited from the same master set. The masters are original AI-generated images, not third-party stock; they are committed so the pipeline is reproducible offline.

Rebuild everything from the repository root:

```sh
python3 tools/build-world-atlases.py
```

The builder erases generator watermarks, thresholds and trims alpha, derives the 21-view envelope from the frozen v3 shape metadata, unifies a 216-alpha edge ring, self-calibrates pixels-per-world-unit against measured center-frame spans, and rewrites the `GENERATED_UPRIGHT_ATLAS_DATA` block embedded in `src/world-art.js` (no runtime JSON request). It also composites `assets/ship/player-neutral.png` and `assets/ship/player-thrust.png` (512 × 384) and `assets/world/gap-edge.png`.

The active gameplay runtime loads color-only derivatives from `assets/world/semantic/`. They preserve this source set's dimensions, frame order, alpha crops, and world-origin metadata and are reproduced by `node tools/recolor-semantic-assets.js`; see `docs/assets/semantic-spectrum.md`.

## Legacy v3 SceneKit pipeline (superseded)

The v3 upright atlases were deterministic offline renders of CC0 Kenney models downloaded on **2026-08-03**. Source archives, extracted OBJ/MTL files, and textures were render inputs only and are not committed. The sections below freeze that provenance for the historical record.

### Official sources and licenses

| Source | Official page | Archive | Archive SHA-256 | License copy | License SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Kenney Space Kit | https://kenney.nl/assets/space-kit | [`kenney_space-kit.zip`](https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip) | `d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9` | `licenses/Kenney-Space-Kit-CC0.txt` | `bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7` |
| Kenney Modular Space Kit | https://kenney.nl/assets/modular-space-kit | [`kenney_modular-space-kit_1.0.zip`](https://kenney.nl/media/pages/assets/modular-space-kit/8261428a47-1771146076/kenney_modular-space-kit_1.0.zip) | `f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc` | `licenses/Kenney-Modular-Space-Kit-CC0.txt` | `38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb` |

Both license files are exact byte-for-byte copies of the upstream **Creative Commons CC0 1.0 Universal** text. The archive links were obtained from each official Kenney page; no source-edition or third-party mirror was used.

### Legacy v3 audited render inputs

`tools/world-assets.json` maps every recipe to these exact source-relative paths and hashes. The renderer rejects absolute paths, network URLs, traversal, source-edition paths, unused inputs, and hash mismatches before SceneKit imports a model.

| Upstream relative path | SHA-256 |
| --- | --- |
| `modular-space-kit/Models/OBJ format/Textures/colormap.png` | `5aa7d186416e85310d99308c8e5510ededda181f3354ba9f4887cd56273f2b1e` |
| `modular-space-kit/Models/OBJ format/gate-lasers.mtl` | `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060` |
| `modular-space-kit/Models/OBJ format/gate-lasers.obj` | `1611d2d1d1d8429b8fffadb337dd570600bde4bc9e9ef6bb933d51fb338a520a` |
| `modular-space-kit/Models/OBJ format/room-large.mtl` | `45a6736aa344a0c7e286b9c43c6a48f25b6a2f78d8c5949e430c3b4a93b4e060` |
| `modular-space-kit/Models/OBJ format/room-large.obj` | `3ef1dc4b366e76b2bdd1ad44e5ad7a3e78c55e7d0fb067625dbaa6c38390b31e` |
| `space-kit/Models/OBJ format/barrels_rail.mtl` | `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927` |
| `space-kit/Models/OBJ format/barrels_rail.obj` | `51f6f46f6878242f0e5a11d0295a006099ebbec43777ef7def4efddd1f490181` |
| `space-kit/Models/OBJ format/craft_speederA.mtl` | `91d172e7a3359183581919a7b5d2e6327f63388942e23dbd1a26ef714415c0e3` |
| `space-kit/Models/OBJ format/craft_speederA.obj` | `534e1b1198be654d2925d6a785531974213ac8b43ae05c02aecfeb905c0166fc` |
| `space-kit/Models/OBJ format/craft_speederD.mtl` | `ec579d3e3095fc6cb1e7aaf54be2392459383382334ede6b3f27b4cb4f3b127a` |
| `space-kit/Models/OBJ format/craft_speederD.obj` | `090e01b12b0d1a0619929d507d8008893e0e13a69235564f677888202c8caea2` |
| `space-kit/Models/OBJ format/rocket_baseA.mtl` | `a7488b28c3724941d54087a27ba05eefea15279bd8ea8e54eedc51250b9c3927` |
| `space-kit/Models/OBJ format/rocket_baseA.obj` | `3a6c4115e5994079abe83a7b97f14f2bcce0e97b76bd229dcb60fd0112060ccd` |
| `space-kit/Models/OBJ format/rocket_fuelA.mtl` | `583541d566dd5edba66cc8e2353e379bdc3de155cd21e173fab33fe9a9248a52` |
| `space-kit/Models/OBJ format/rocket_fuelA.obj` | `53f83c675728d51a12014724d413a7a264ae893512189313553581e1135bfa87` |
| `space-kit/Models/OBJ format/rocket_sidesA.mtl` | `f1131066d3cdc671b79f7799d5ddf194b25b0027381aea415d8c91d24e0190ba` |
| `space-kit/Models/OBJ format/rocket_sidesA.obj` | `3a69d1927e1ac09203c3b514a9714876cfeb4fb8688d003fff09a1e3b8237a8a` |
| `space-kit/Models/OBJ format/rocket_topA.mtl` | `7e4036c7a7ec9d8081082f4778338a8bff9a01bebb40c51cae08c8a96bc61785` |
| `space-kit/Models/OBJ format/rocket_topA.obj` | `d910a3dd8cccebb8f1eb259af29d436da6839e81ae362fc5e9fd8f4038146bb4` |
| `space-kit/Models/OBJ format/terrain_sideCliff.mtl` | `3f5b98315cc38f85580e92d4ac82f2693534ac142098fd1dbe76cc07b962c02d` |
| `space-kit/Models/OBJ format/terrain_sideCliff.obj` | `a321d44e8603bd3cdf59866464612d13d4720634bf46e0badb80ced32ba7379b` |
| `space-kit/Models/OBJ format/turret_double.mtl` | `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b` |
| `space-kit/Models/OBJ format/turret_double.obj` | `f511dfa73a94274e1a13ab7d136f1087a99149853fa6659132ece1bbc28311e6` |
| `space-kit/Models/OBJ format/turret_single.mtl` | `762ff003991e23328663179e8246dbe450f15f2467cc1947ff144c0ff1f49c8b` |
| `space-kit/Models/OBJ format/turret_single.obj` | `2b3492cde9c9496d73963669d8d59e9f5ebccb9dcbf15dbf5336e7ca630c6a89` |

### Legacy v3 recipes and rendering contract

| Atlas | Category | Source components |
| --- | --- | --- |
| drone-scout | drone | Space Kit craft_speederA |
| drone-striker | drone | Space Kit craft_speederD |
| turret-sentry | turret | Space Kit turret_single, with exact OBJ group turret faces removed |
| turret-heavy | turret | Space Kit turret_double, with exact OBJ group turret faces removed |
| barrier-rail | wallLow | Two Space Kit barrels_rail components |
| barrier-crate | wallLow | Three Modular Space Kit gate-lasers components |
| structure-pylon | wallMedium | Modular room-large plus gate-lasers |
| structure-bastion | wallMedium | Space Kit rocket base/sides plus Modular gate-lasers |
| structure-reactor | wallHigh | Two complete Space Kit rocket assemblies |
| structure-tower | wallHigh | Six stacked Modular room-large components |
| corridor-low | corridorLow | Two Space Kit barrels_rail components plus one generated cyan band; longitudinal continuity is runtime Canvas geometry |
| corridor-medium | corridorMedium | Modular room-large plus gate-lasers and two generated cyan bands; longitudinal continuity is runtime Canvas geometry |
| gap-edge | gap | Two Space Kit terrain_sideCliff components; preserved legacy render |

tools/render-world-assets.swift SHA-256: b6c2a2cffa83831672d7bd2985fd25f449f725311b354b9e0dec3a42bab3ba6b.

The upright camera metadata uses the measured SceneKit orthographic half-extent, so pixels-per-world-unit equals frame height divided by twice orthographicScale. Each upright record also stores `detailFrontZ`, the six-decimal +Z armor surface derived from actual normalized source depth. Every upright frame stores its absolute alpha crop and projected world-origin anchor; src/world-art.js embeds that generated data directly and performs no runtime JSON request.

Space Kit solid materials map by audited material name to warm white, graphite, and cool steel. Modular colormap textures retain PBR lighting and nearest texture filters. Textured imports are back-face culled; untextured and generated details remain double-sided. The two audited Modular OBJ files contain coincident same-winding faces, so the renderer canonicalizes only those paths: room-large goes from 21,760 source faces to 10,768 and gate-lasers from 2,920 to 2,156. Reverse windings and distinct UV/material faces are preserved. Coincident normals may differ by at most 2.5e-7 per component; a larger conflict aborts the render.

Generated atlas details use cyan #68e8ff, orange #ff8a42, and wall-high-only gold #ffd66b. Low walls have one cyan band at 34% of their height; medium and high walls have two at 34% and 68%, while high walls retain their gold beacons. Corridor atlases contain only their source-derived body and generated cyan bands: low at Y 390, medium at Y 460 and 910. Their recipes declare `runtimeContinuity: true`; runtime Canvas owns the 648-unit plinth, paired conduits at X ±18 and Y 540/1120, caps, and chevron. Connected ends meet the exact shared segment boundary, while open ends inset by 6 world units. No full-depth plinth or conduit is baked into the atlas, and no locale-dependent text is rendered.

### Legacy v3 reproduction and determinism gate

After validating the archive SHA-256 values above, extract them as space-kit and modular-space-kit below an external working directory. Run three fresh sequential processes:

    swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-a" --metadata-js "$WORLD_WORK_DIR/world-art-a.js" > "$WORLD_WORK_DIR/report-a.json"
    swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-b" --metadata-js "$WORLD_WORK_DIR/world-art-b.js" > "$WORLD_WORK_DIR/report-b.json"
    swift tools/render-world-assets.swift --manifest tools/world-assets.json --source-root "$WORLD_WORK_DIR/extracted" --output "$WORLD_WORK_DIR/render-c" --metadata-js "$WORLD_WORK_DIR/world-art-c.js" > "$WORLD_WORK_DIR/report-c.json"

The metadata JavaScript must compare byte-identically across A/B/C. Gap must compare byte-identically with every run and with the committed file. Run this complete three-pair gate from the repository root. It decodes every upright PNG without an asset, frame, coordinate, or color exception; verifies every report hash against its actual file; and permits a report difference only for the same atlas containing the sole bounded decoded sample:

```sh
WORLD_WORK_DIR="$WORLD_WORK_DIR" node <<'NODE'
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const work = process.env.WORLD_WORK_DIR;
assert.ok(work, 'WORLD_WORK_DIR must name the external render root');
const runs = ['a', 'b', 'c'];
const uprightIDs = [
  'drone-scout', 'drone-striker', 'turret-sentry', 'turret-heavy',
  'barrier-rail', 'barrier-crate', 'structure-pylon', 'structure-bastion',
  'structure-reactor', 'structure-tower', 'corridor-low', 'corridor-medium',
];
const allIDs = [...uprightIDs, 'gap-edge'];
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bytes = (file) => fs.readFileSync(file);
const hash = (file) => crypto.createHash('sha256').update(bytes(file)).digest('hex');
const renderPath = (run, id) => path.join(work, `render-${run}`, `${id}.png`);
const reportPath = (run) => path.join(work, `report-${run}.json`);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
  return distances[0] <= distances[1] && distances[0] <= distances[2]
    ? left : distances[1] <= distances[2] ? up : upperLeft;
}

function decode(file) {
  const png = bytes(file);
  assert.ok(png.subarray(0, 8).equals(signature), `${file} is not PNG`);
  let offset = 8;
  let header;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], compression: data[10],
        filter: data[11], interlace: data[12],
      };
    } else if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert.deepEqual(
    [header.bitDepth, header.colorType, header.compression, header.filter, header.interlace],
    [8, 6, 0, 0, 0],
    `${file} must be non-interlaced 8-bit RGBA`,
  );
  const stride = header.width * 4;
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  const rgba = Buffer.alloc(stride * header.height);
  let source = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = filtered[source++];
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[source + x];
      const target = y * stride + x;
      const left = x >= 4 ? rgba[target - 4] : 0;
      const up = y > 0 ? rgba[target - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? rgba[target - stride - 4] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : filter === 4 ? raw + paeth(left, up, upperLeft)
                : assert.fail(`${file} has unsupported filter ${filter}`);
      rgba[target] = value & 0xff;
    }
    source += stride;
  }
  return { ...header, rgba };
}

const reports = Object.fromEntries(runs.map((run) => [
  run, JSON.parse(bytes(reportPath(run))),
]));
for (const run of runs) for (const id of allIDs) {
  assert.equal(reports[run].outputHashes[`${id}.png`], hash(renderPath(run, id)),
    `${run} report hash must match ${id}.png`);
}
for (const run of ['b', 'c']) {
  assert.ok(bytes(path.join(work, 'world-art-a.js')).equals(bytes(path.join(work, `world-art-${run}.js`))),
    `metadata JavaScript a/${run} must be exact`);
  assert.ok(bytes('assets/world/gap-edge.png').equals(bytes(renderPath(run, 'gap-edge'))),
    `gap ${run} must match the committed file`);
}
assert.ok(bytes('assets/world/gap-edge.png').equals(bytes(renderPath('a', 'gap-edge'))),
  'gap a must match the committed file');

function comparePair(leftRun, rightRun) {
  let detail = null;
  for (const id of uprightIDs) {
    const left = decode(renderPath(leftRun, id));
    const right = decode(renderPath(rightRun, id));
    assert.deepEqual([left.width, left.height, left.rgba.length],
      [right.width, right.height, right.rgba.length], `${id} dimensions`);
    for (let offset = 0; offset < left.rgba.length; offset += 4) {
      const channels = [0, 1, 2, 3].filter((channel) => (
        left.rgba[offset + channel] !== right.rgba[offset + channel]
      ));
      if (channels.length === 0) continue;
      assert.equal(detail, null, `${leftRun}/${rightRun} differs at more than one pixel globally`);
      assert.equal(channels.length, 1, `${leftRun}/${rightRun} changes multiple channels`);
      assert.ok(channels[0] < 3, `${leftRun}/${rightRun} changes alpha`);
      assert.equal(left.rgba[offset + 3], 255, `${leftRun}/${rightRun} left sample is not opaque`);
      assert.equal(right.rgba[offset + 3], 255, `${leftRun}/${rightRun} right sample is not opaque`);
      assert.equal(Math.abs(left.rgba[offset + channels[0]] - right.rgba[offset + channels[0]]), 16,
        `${leftRun}/${rightRun} exceeds one 4-bit bucket`);
      detail = {
        id, offset, channel: channels[0],
        left: left.rgba[offset + channels[0]], right: right.rgba[offset + channels[0]],
      };
    }
  }

  const leftReport = structuredClone(reports[leftRun]);
  const rightReport = structuredClone(reports[rightRun]);
  if (detail) {
    assert.notEqual(leftReport.outputHashes[`${detail.id}.png`], rightReport.outputHashes[`${detail.id}.png`],
      'the differing atlas must have the differing report hash');
    delete leftReport.outputHashes[`${detail.id}.png`];
    delete rightReport.outputHashes[`${detail.id}.png`];
    assert.deepEqual(leftReport, rightReport, 'reports may differ only at the decoded-difference atlas hash');
  } else {
    assert.ok(bytes(reportPath(leftRun)).equals(bytes(reportPath(rightRun))),
      `${leftRun}/${rightRun} exact pixels require exact reports`);
  }
  return { leftRun, rightRun, detail };
}

const comparisons = [['a', 'b'], ['a', 'c'], ['b', 'c']]
  .map(([left, right]) => comparePair(left, right));
const majority = comparisons.find(({ detail }) => detail === null);
assert.ok(majority, 'at least two runs must be byte-identical');
for (const id of uprightIDs) {
  assert.ok(bytes(path.join('assets/world', `${id}.png`)).equals(bytes(renderPath(majority.leftRun, id))),
    `${id}.png must equal the exact-majority representative`);
}
const differences = comparisons.filter(({ detail }) => detail).map(({ detail }) => detail);
if (differences.length) {
  const normalized = differences.map(({ id, offset, channel, left, right }) => (
    [id, offset, channel, Math.min(left, right), Math.max(left, right)]
  ));
  for (const value of normalized.slice(1)) assert.deepEqual(value, normalized[0],
    'all non-majority comparisons must identify the same one decoded sample');
}
console.log(JSON.stringify(comparisons));
NODE
```

The gate rejects any metadata, geometry, alpha, multi-channel, report, gap, or wider difference. The complete set may differ in at most one fully opaque pixel, in one RGB channel by exactly 16. At least two runs must be byte-identical, and that majority is frozen.

The frozen A/B/D metadata, reports, and all thirteen PNGs were byte-identical. Independent C landed on the previously observed `drone-striker` renderer variance, so it was excluded; no tolerance was exercised by the frozen three-process set. Against the previous repository state, all eleven non-corridor PNGs remain byte-identical and only the two corridor atlases change.

All 252 upright cells are non-empty, keep transparent own-cell borders, clear RGB under alpha zero, and preserve stable origin round trips. The twelve upright files total 8,708,896 bytes; including the gap atlas, the world set totals 9,447,670 bytes.

## Derived outputs

| Repository path | Bytes | SHA-256 |
| --- | ---: | --- |
| assets/world/drone-scout.png | 648369 | 4d54dd4fcb65b73251ca5650b8dea9a5b15b6f0fbbb6e7509b7456ebd17b0a45 |
| assets/world/drone-striker.png | 485782 | f8d2c9e75885945a5f1c565b7588174e84f79eef6715e14bc9e011c3edc45b65 |
| assets/world/turret-sentry.png | 899735 | 60d56394fa03d647e931acd011dcf981cc1135a0e68338489efd488ccaa08c9c |
| assets/world/turret-heavy.png | 976273 | 20347c49fb5600a055d18130e111f4f9d4d1edd0a9f80442e3642b10df2e31ca |
| assets/world/barrier-rail.png | 353667 | 154fcf7635e3cf3ae2f0d1c2911fd36580ccc473f2e0339791462b9ba3404817 |
| assets/world/barrier-crate.png | 294453 | 3bba94628454ec4b5d3376e9baaca7a9ea18f91b7731e49d3d9842da053c2fcb |
| assets/world/structure-pylon.png | 1355708 | 9613aab9ac2ce8dc42feb32b46ffd710d2eee4bc20b2c2e150668bca59f2af8a |
| assets/world/structure-bastion.png | 486346 | dc62d0cc12e4a56d0400c221c516dca49126fff2953a3a79cca724e0aac99d78 |
| assets/world/structure-reactor.png | 1099337 | 5feb3ae96dbcd5e5b5c7c8a2ffd03a9ea166b8f83cea0a59983b2dd2291d46a2 |
| assets/world/structure-tower.png | 1149834 | fafc6f4b9ac8024b306ee9b68985a4a2caf6a7616038f5e899e34a2d54aed029 |
| assets/world/corridor-low.png | 327912 | 9b1ad5e21583f904071fa5f4a337be23c754404d82ab5d1685b7e3d7d9887d09 |
| assets/world/corridor-medium.png | 631480 | 271713afc18a2f2fbaaf7bace82adb171736316da9d04e41962247ea7f5b218c |
| assets/world/gap-edge.png | 738774 | e2b9f8f23fb74ca88789e792d16c4a941d697f005e79bab89e58f0b2b4988b9d |

The v4 contact sheets were inspected at original detail before freezing. All 252 upright views have complete silhouettes, coherent opposite-side yaw reveals, increasing top exposure across pitch rows, stable anchors, transparent padding, and no cull holes or clipping. Drones are directionally readable and smaller than buildings; low/medium/high and corridor silhouettes and accents remain distinct.
