[中文](README.zh-CN.md)

# Nebula Cruise / 星云巡航

The game now includes a **3D chase camera and layered tracks**: a camera that follows the craft, a mechanically unfolding super form, rolling ramps, elevated fuel routes, and physical drops. Run `npm run dev -- --port 7101` and open `http://localhost:7101` on the host, or open `index.html` directly. All runtime assets are bundled locally. If 3D becomes unavailable, rendering and elevation physics switch together to the playable flat-track compatibility mode. See [design notes and verification](docs/cockpit_exploration.md).

Nebula Cruise is a fast, polished sci-fi lane runner for the browser. Pilot a detailed starship through an endless procedural nebula, read the track ahead, chain jumps and charged shots, collect power-ups, and push for a place in your reliable local Top 15.

Play online: https://stanatny.github.io/skyroads/

Current version: [v1.1.1](https://github.com/stanatny/skyroads/releases/tag/v1.1.1)

## Highlights

- Each new mission shuffles four road profiles: ridges, canyon-first climbs, double peaks and long plateaus. Floating islands and bridge gaps are optional, with varied branch sides, heights, challenges and rewards. Power-up types also use a shuffled bag; existing fuel generation and super-form spacing rules remain in place. See the [route generation notes](docs/route_randomness.md).
- Drones patrol sideways at fixed heights, with a warning before each move. Most block low flight and can be jumped over; a smaller group intercepts single jumps and can be passed underneath. Cruise speed now rises continuously: quicker initial acceleration, followed by gentler growth beyond 36 segments/s. BOOST always stays faster than cruise.
- Fuel and power-ups are more sparse. BOOST lasts 5 seconds with 1.5 seconds of exit protection; super form lasts 20 seconds. Neither can be refreshed while active, and matching pickups are temporarily hidden. Same-type reward spacing grows with speed, allowing at least an estimated 7 seconds for BOOST and 20 seconds for super form across all sources. See the [balance notes](docs/endless_cruise_balance.md).
- Rare high-altitude wormholes reward a well-timed double or triple jump from an elevated route with a **6,000 m warp**. The first opportunity is at 11.36–11.68 km, depending on the route; after a successful warp, another 8.4–10.8 km of ordinary flight separates the next opportunity. Fuel and all active power-up timers pause during transit, then resume at a protected exit. See the [wormhole design and validation](docs/wormhole_reward_design.md).
- Responsive held movement crosses multiple lanes smoothly and reverses immediately; `Space` / `Enter` starts or restarts a mission, and `P` pauses or resumes play.
- A bilingual interstellar command center follows Chinese system languages and otherwise starts in English, with a remembered manual language switch and a compact `V1.1` identity.
- The original 144 BPM, three-stem adaptive **Nebula Cruise** soundtrack keeps its cinematic electronic palette while adding a faster, joyful, slightly tense pulse.
- Perspective-aware **Orbital Defense** world art gives low, medium, and high structures distinct silhouettes, connected defense corridors, a dangerous event-horizon treatment for missing road, and Heavy Swarm drones that preserve their warning and movement-direction cues.
- Semantic Spectrum colors separate the gold player ship, graphite/orange structures, crimson hostile units, and cold-black gaps, while vector jets and synchronized propulsion audio distinguish second jump, third jump, glide, and BOOST.
- A reliable local Top 15 stays in this browser. The first pilot name comes from a safe original sci-fi call-sign list, is reused automatically, and can be changed whenever you want.
- An endless, progressively faster course keeps ordinary bypass lanes around the new advanced defenses while retaining fuel pressure, gaps, bridges, enemies, BOOST, super form, magnet, and slowdown power-ups.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Hold `A` / `D` or `←` / `→` | Swipe left or right |
| Jump | `K` or `Space` | Tap |
| Double jump | Press jump again in the air; costs 3 fuel | Tap again in the air |
| Glide | Hold a jump key while falling; consumes fuel | Keyboard only |
| Fire | Tap `J` | Keyboard only |
| Charged missile | Hold `J` for 1.5 seconds, then release | Keyboard only |
| Fuel burst | While grounded with at least 70% fuel, hold `W` / `↑` for 1 second | Keyboard only |
| Start / fly again | `Space` or `Enter` | Use the on-screen button |
| Pause / resume | `P` | Keyboard only |
| Return to command center (mission over) | `Esc` | Use the Command Center button |
| Toggle all audio | `M` | Use the separate music and SFX buttons |

Low barriers can be jumped; tall towers require a lane change, super-form jump, or weapon. Bullets and charged missiles have different collision rules, and holding jump while falling activates fuel-consuming glide. The HUD shows fuel, jumps, score, distance, time, speed, power-up timers, and audio state; charge appears only after a deliberate hold so quick tap fire does not flash the status stack.

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

The exact output is `Nebula Cruise.app` in the repository root. It runs the complete game and bundled assets locally in WebKit. After merge and release verification, the V1.1.1 workflow targets the universal release asset `Nebula-Cruise-macOS-v1.1.1.zip`; releases are listed on [GitHub Releases](https://github.com/stanatny/skyroads/releases).

## Third-party assets

Visual assets and fonts are copied into this repository; nothing is hotlinked at runtime. Gameplay uses local Semantic Spectrum color derivatives so the ship, structures, hostile units, and gaps keep distinct visual roles without changing their geometry, anchors, or collision. The deterministic recipe and hashes are in [`docs/assets/semantic-spectrum.md`](docs/assets/semantic-spectrum.md). Sources, upstream licenses, selected files, and modifications are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with license texts in [`licenses/`](licenses/). The adaptive soundtrack is original to this project.

## AI assistance

Earlier versions of this project were developed with assistance from Kimi K3. This release also uses OpenAI Codex for implementation, testing, documentation, and visual iteration. The author reviews and edits the work and remains responsible for the final project. No affiliation, sponsorship, or endorsement by Moonshot AI or OpenAI is implied.

## Use and licensing

This repository is publicly available for demonstration and learning. Except for rights required to provide the GitHub service, the author has not granted an additional license to copy, modify, distribute, or use the project's original material commercially. This project-level notice does **not** replace, restrict, or override any third-party license: those assets remain governed by the licenses identified in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/).
