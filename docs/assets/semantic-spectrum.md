# Semantic Spectrum Asset Recipe

The gameplay runtime uses deterministic semantic-color derivatives that preserve source materials while adding localized role-specific accents. Geometry remains the already approved ship and world-art geometry.

## Reproduction

From the repository root:

```sh
node tools/recolor-semantic-assets.js
```

The command verifies every source SHA-256 declared in `tools/semantic-assets.json`, decodes only non-interlaced 8-bit RGBA PNGs, applies HSV-space hue pulls toward role-specific accents (preserving lightness and texture detail), changes only eligible energy samples to the semantic accent, preserves every alpha byte, clears hidden RGB, and atomically writes the outputs.

Generator and manifest:

- `tools/recolor-semantic-assets.js` — SHA-256 `af98d54964a3cb3a8d01ec9d347b090952e8c078db63d8481aea772dc7acc41e`
- `tools/semantic-assets.json` — SHA-256 `76ef59efbd4192a874f812e4b1c97af68b43d0a4fab85a0a0dac859e80e8b71f`

## Output hashes

| Repository path | SHA-256 |
| --- | --- |
| `assets/ship/semantic/player-neutral.png` | `4b5e0e43904d3a5c5e1ace3442e21c918c8d7146029b63b8df7c518330e8c458` |
| `assets/ship/semantic/player-thrust.png` | `2adca16b8271784a1c258cf6cd5cd9322ee37b2cbd065b1871c941a1288f4fe5` |
| `assets/world/semantic/drone-scout.png` | `9c9fe6882946e676552b304003fb07201d6acb52c14fc026a340e91c2d072513` |
| `assets/world/semantic/drone-striker.png` | `6135f6df9d4ca7c424e5908d3ded99281dfb03f3e0307ea31612bcaf13c9f832` |
| `assets/world/semantic/turret-sentry.png` | `2f1331712fe20f18255567a1bcd0580468d4996b2a8425a952718b71296d14a6` |
| `assets/world/semantic/turret-heavy.png` | `0e1c4dc0718895f231d7f73eb9b944c8dd41647bdba82aa781342e9a642d2d5b` |
| `assets/world/semantic/barrier-rail.png` | `01aa12c9686a67d64017d2b942c7df73749dfad9281d64c4e5de7e95208641c4` |
| `assets/world/semantic/barrier-crate.png` | `66eca93c539aa2a47b3603d2d6e30985ac2b26a73ac39a02487219e76b1b7da3` |
| `assets/world/semantic/structure-pylon.png` | `c9e00a25509e0ec70b147243ae623e0892c2bdd3a47080ffad1864385050d262` |
| `assets/world/semantic/structure-bastion.png` | `413e3babbd227b7fa0c6d65b9188ee4bf91526ea6a0db2b0dc0bd8b674ad87ee` |
| `assets/world/semantic/structure-reactor.png` | `ad118e659203276d0eb04181278d54e0a84cc6b44ec734f25185ee8fa8a83dd5` |
| `assets/world/semantic/structure-tower.png` | `2719fc773ce29093945d7fce4b63baa6ba8385fefeb9b2b288ed456e563ee007` |
| `assets/world/semantic/corridor-low.png` | `88e34fa5757bb24915551e065471405ca3b7ab150c4dc3745a26a0784ab76ca0` |
| `assets/world/semantic/corridor-medium.png` | `b0159dc4fc81458c46167facf68369e107bfcd383f0aca6cb6b4be6ea9e39190` |
| `assets/world/semantic/gap-edge.png` | `4c76900fb7f3c2faad454ca43118057abf60135d1294d8d4971e9674e58b0dcd` |

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
