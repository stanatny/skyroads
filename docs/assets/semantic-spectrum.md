# Semantic Spectrum Asset Recipe

The gameplay runtime uses deterministic semantic-color derivatives that preserve source materials while adding localized role-specific accents. Geometry remains the already approved ship and world-art geometry.

## Reproduction

From the repository root:

```sh
node tools/recolor-semantic-assets.js
```

The command verifies every source SHA-256 declared in `tools/semantic-assets.json`, decodes only non-interlaced 8-bit RGBA PNGs, applies a light role-specific color matrix, changes only eligible bright energy samples to the semantic accent, preserves every alpha byte, clears hidden RGB, and atomically writes the outputs.

Generator and manifest:

- `tools/recolor-semantic-assets.js` — SHA-256 `a79f8eb5357283e51f2fbecbde4a09f33725554275aec00545f6f47a06d87fd4`
- `tools/semantic-assets.json` — SHA-256 `89165c4a44513603ffa7bf72c1d32a51ae327a077953fe4b7f4bce4ce09bef35`

## Output hashes

| Repository path | SHA-256 |
| --- | --- |
| `assets/ship/semantic/player-neutral.png` | `0bc0dd260990e796f0b216047b8c84804a487ab002f76677dbec4ba09d2afb61` |
| `assets/ship/semantic/player-thrust.png` | `bd50701b84d957c9f920b1c7436a9410461e19366f6a7b53e72030da4c0baab5` |
| `assets/world/semantic/drone-scout.png` | `5d3370b8e2b8225a5a49eab89df1af313b9d5984d31c7201ba8b1a2b5cdf96da` |
| `assets/world/semantic/drone-striker.png` | `472c96a8e8bd74a4c89f60a1ce7a28d1e7888b660871b67f0c6ebe03d854e890` |
| `assets/world/semantic/turret-sentry.png` | `302fd8ea751529f05f3837c1b3cd89dbff810a4937e62f3e0f5a0f274413b4ea` |
| `assets/world/semantic/turret-heavy.png` | `e80c2e733fed058b0b5e2c30a768f4c6f79f393bbdbce3348ba9201799723647` |
| `assets/world/semantic/barrier-rail.png` | `e7e0118f6f625899d064cbae98a38a609c2822dfe226289d01e02b0ba563ac95` |
| `assets/world/semantic/barrier-crate.png` | `c458b0161ff07f7db304fe444e8e86488f02bfb26a8fbc2eb562d2d31b646fb7` |
| `assets/world/semantic/structure-pylon.png` | `006661050c13f2facbed7b52f0f7d5c4536d4d725b97e3f493833edb11f28f0b` |
| `assets/world/semantic/structure-bastion.png` | `4d4cc9959af316a30bd7a8c988ea23c5d5ed5305eab0676cb3dbbd095c3be1ca` |
| `assets/world/semantic/structure-reactor.png` | `230b67746700a2da38f1856349f2cba79e64ca61100a2d0677221d15be3c1e51` |
| `assets/world/semantic/structure-tower.png` | `871c255efc49aa5a38f28e824bc0cd41444a4a7857315096cbf5fc866e41fec5` |
| `assets/world/semantic/corridor-low.png` | `b56687ac816a6599c7580f23e81d22c6719338eef685c8c990691d2172939b2d` |
| `assets/world/semantic/corridor-medium.png` | `b236753d7efcd5cee37212a52098734ea04b8bd430309793886036f252360a3d` |
| `assets/world/semantic/gap-edge.png` | `876f1524c44e8476c860dc44efd7abd4f73ab917706f096bef73f94f63928950` |

## Invariants

- Player outputs remain 512×384.
- Upright world outputs remain 2240×960 with the existing 21-frame metadata.
- Gap edge remains 3584×512 with the existing seven-yaw contract.
- Source and output alpha planes are byte-identical.
- Transparent pixels have zero RGB.
- Two fresh temporary generations are byte-identical.
- Every semantic output retains at least 75% of the source color entropy, 45% of the quantized color count, and 65% of the source edge energy.
- Semantic accents have upper coverage bounds so gold, orange, magenta, or fracture red cannot flatten a complete asset.
- Runtime fallbacks remain independent per asset category.

## HUD sources

The active HUD also uses two byte-identical CC0 files:

- Wenrexa `Panel Empty.png` → `assets/ui/hologram-panel.png`;
- Anton Revin `progress_overlay.png` → `assets/ui/industrial-meter-overlay.png`.

Exact source pages, archives, hashes, selected paths, and the shared official CC0 legal-code copy are recorded in `THIRD_PARTY_NOTICES.md`.
