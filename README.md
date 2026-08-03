[中文](README.zh-CN.md)

# Nebula Cruise / 星云巡航

Nebula Cruise is a fast, polished sci-fi lane runner for the browser. Pilot a detailed starship through an endless procedural nebula, read the track ahead, chain jumps and charged shots, collect power-ups, and push for a place in your reliable local Top 15.

Play online: https://stanatny.github.io/skyroads/

Current version: [v1.1.0](https://github.com/stanatny/skyroads/releases/tag/v1.1.0)

## Highlights

- Responsive held movement crosses multiple lanes smoothly and reverses immediately; `Space` / `Enter` starts or restarts a mission, and `P` pauses or resumes play.
- A bilingual interstellar command center follows Chinese system languages and otherwise starts in English, with a remembered manual language switch and a compact `V1.1` identity.
- The original 144 BPM, three-stem adaptive **Nebula Cruise** soundtrack keeps its cinematic electronic palette while adding a faster, joyful, slightly tense pulse.
- Perspective-aware **Orbital Defense** world art gives low, medium, and high structures distinct silhouettes, connected defense corridors, and larger drones that preserve their warning and movement-direction cues.
- A reliable local Top 15 stays in this browser. The first pilot name comes from a safe original sci-fi call-sign list, is reused automatically, and can be changed whenever you want.
- An endless, progressively faster course keeps ordinary bypass lanes around the new advanced defenses while retaining fuel pressure, gaps, bridges, enemies, BOOST, super form, magnet, and slowdown power-ups.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Hold `A` / `D` or `←` / `→` | Swipe left or right |
| Jump | `K`, `Space`, `W`, or `↑` | Tap |
| Double jump | Press jump again in the air; costs 3 fuel | Tap again in the air |
| Glide | Hold a jump key while falling; consumes fuel | Keyboard only |
| Fire | Tap `J` | Keyboard only |
| Charged missile | Hold `J` for 3 seconds, then release | Keyboard only |
| Start / fly again | `Space` or `Enter` | Use the on-screen button |
| Pause / resume | `P` | Keyboard only |
| Return to command center (mission over) | `Esc` | Use the Command Center button |
| Toggle all audio | `M` | Use the separate music and SFX buttons |

Low barriers can be jumped; tall towers require a lane change, super-form jump, or weapon. Bullets and charged missiles have different collision rules, and holding jump while falling activates fuel-consuming glide. The HUD shows fuel, jumps, score, distance, time, speed, charge, power-up timers, and audio state.

## Obstacle route language

Defense modules use a consistent visual language:

- **1 cyan band — 600 world units:** clear it with one jump.
- **2 cyan bands — 1,250 world units:** clear it with two jumps.
- **Gold beacon — 2,000 world units:** clear it with the super-form third jump.
- **Low lit corridor:** primarily uses one jump followed by hold-to-glide while descending; a well-timed second jump is also accepted.
- **Medium lit corridor:** requires two jumps followed by hold-to-glide while descending.
- Every newly added advanced building or corridor challenge keeps an ordinary bypass lane. The existing intentional seven-lane all-gap challenge remains unchanged.

## Language and local records

The game supports Simplified/Traditional Chinese system locales and English. If any browser system language is Chinese, the first launch uses Chinese; every other system language uses English. Use the `中文 / EN` control to switch manually. Your choice is remembered in this browser.

Each completed mission is ranked by score, distance, and elapsed time. The local Top 15 is kept in this browser only, using a recoverable local primary/backup store. The current pilot name is reused automatically; changing it is optional. Clearing browser site data also clears these records and preferences.

## Run locally

No package install or web build step is required. You can open `index.html` directly in a modern browser:

```bash
open index.html
```

For the most browser-compatible local run, serve the repository directory:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

Developers can run the complete automated checks with:

```bash
npm test
npm run check
```

The versioned repository Skill at [`.agent/skills/ship-browser-games`](.agent/skills/ship-browser-games/SKILL.md) captures the design, asset, testing, browser-proof, and release practices used for this game so future iterations can reuse them.

## macOS app

On macOS 12 or later with Xcode command-line tools installed, build the universal Apple Silicon + Intel wrapper with:

```bash
bash app/build.sh
```

The exact output is `Nebula Cruise.app` in the repository root. It runs the complete game and bundled assets locally in WebKit. After merge and release verification, the V1.1 workflow targets the universal release asset `Nebula-Cruise-macOS-v1.1.0.zip`; releases are listed on [GitHub Releases](https://github.com/stanatny/skyroads/releases).

## Third-party assets

Visual assets and fonts are copied into this repository; nothing is hotlinked at runtime. Sources, upstream licenses, selected files, and modifications are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with license texts in [`licenses/`](licenses/). The adaptive soundtrack is original to this project.

## AI assistance

Earlier versions of this project were developed with assistance from Kimi K3. This release also uses OpenAI Codex for implementation, testing, documentation, and visual iteration. The author reviews and edits the work and remains responsible for the final project. No affiliation, sponsorship, or endorsement by Moonshot AI or OpenAI is implied.

## Use and licensing

This repository is publicly available for demonstration and learning. Except for rights required to provide the GitHub service, the author has not granted an additional license to copy, modify, distribute, or use the project's original material commercially. This project-level notice does **not** replace, restrict, or override any third-party license: those assets remain governed by the licenses identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/).
