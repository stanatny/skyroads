[中文](README.zh-CN.md)

# Nebula Cruise / 星云巡航

Nebula Cruise is a fast, polished sci-fi lane runner for the browser. Pilot a detailed starship through an endless procedural nebula, read the track ahead, chain jumps and charged shots, collect power-ups, and push for a place in your reliable local Top 15.

Play online: https://stanatny.github.io/skyroads/

## Highlights

- Responsive held movement: hold left or right to cross multiple lanes smoothly, with immediate reversal when you change direction.
- A bilingual interstellar command-center interface, detailed ship art, self-hosted UI assets, and the original adaptive three-stem **Nebula Cruise** soundtrack.
- An endless, progressively faster course with guaranteed reachable routes, fuel pressure, gaps, bridges, barriers, enemies, BOOST, super form, magnet, and slowdown power-ups.
- A reliable local Top 15 stored in this browser. Your first pilot name is chosen from a safe original sci-fi call-sign list, remembered for later missions, and can be renamed whenever you want.

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
| Return to command center (mission over) | — | Use the Command Center button |
| Toggle all audio | `M` | Use the separate music and SFX buttons |

Low barriers can be jumped; tall towers require a lane change, super-form jump, or weapon. Bullets and charged missiles have different collision rules, and holding jump while falling activates fuel-consuming glide. The HUD shows fuel, jumps, score, distance, time, speed, charge, power-up timers, and audio state.

## Language and local records

The game supports Simplified/Traditional Chinese system locales and English. If any browser system language is Chinese, the first launch uses Chinese; every other system language uses English. Use the `中文 / EN` control to switch manually. Your choice is remembered in this browser.

Each completed mission is ranked by score, distance, and elapsed time. The best 15 records are kept on this device only, using a recoverable local primary/backup store. The current pilot name is reused automatically; changing it is optional. Clearing browser site data also clears these records and preferences.

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

## macOS app

On macOS 12 or later with Xcode command-line tools installed, build the universal Apple Silicon + Intel wrapper with:

```bash
bash app/build.sh
```

The exact output is `Nebula Cruise.app` in the repository root. It runs the complete game and bundled assets locally in WebKit. Published builds are available from [GitHub Releases](https://github.com/stanatny/skyroads/releases).

## Third-party assets

Visual assets and fonts are copied into this repository; nothing is hotlinked at runtime. Sources, upstream licenses, selected files, and modifications are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with license texts in [`licenses/`](licenses/). The adaptive soundtrack is original to this project.

## AI assistance

Earlier versions of this project were developed with assistance from Kimi K3. This release also uses OpenAI Codex for implementation, testing, documentation, and visual iteration. The author reviews and edits the work and remains responsible for the final project. No affiliation, sponsorship, or endorsement by Moonshot AI or OpenAI is implied.

## Use and licensing

This repository is publicly available for demonstration and learning. Except for rights required to provide the GitHub service, the author has not granted an additional license to copy, modify, distribute, or use the project's original material commercially. This project-level notice does **not** replace, restrict, or override any third-party license: those assets remain governed by the licenses identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/).
