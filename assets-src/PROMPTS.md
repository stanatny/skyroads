# v4 Master Generation Prompts

All masters in `assets-src/masters/` were generated on 2026-08-12 with the local AI image-generation plugin (`image_generation_tool.py generate --background transparent`, 1K). Every prompt shared this style brief:

> Realistic metallic sci-fi game asset, gunmetal grey armored hull with panel lines, rivets and weathering, glowing orange warning lights and markings, dramatic studio lighting, crisp silhouette, video-game sprite, centered, transparent background, no text, no watermark.

Weapon-related wording (`weapon`, `turret cannon`, `gun barrel`) was rejected by the generator's safety policy, so turret prompts use "survey / floodlight / ground-station machine" phrasing instead. Each generated file carried an "AI生成" watermark in the lower-left corner, which `tools/build-world-atlases.py` detects and erases during the build.

## Per-slot prompts

- `drone-scout.png` — small agile reconnaissance survey drone, sleek rounded hull, single large glowing orange sensor eye, rear engine glow, three-quarter rear-top view.
- `drone-striker.png` — heavier attack drone, angular armored hull, twin glowing orange sensor eyes, side thrusters, three-quarter rear-top view.
- `turret-sentry.png` — compact ground-station sentry machine, squat armored base with a single rotating floodlight/sensor head, glowing orange lens.
- `turret-heavy.png` — heavy ground-station machine, wide reinforced armored base with dual floodlight/sensor heads, glowing orange lenses.
- `barrier-rail.png` — low armored road barrier rail, long horizontal barricade with yellow-black hazard striping and orange warning lights, slight perspective.
- `barrier-crate.png` — stack of armored supply crates forming a low barricade, hazard markings, orange status lights.
- `structure-pylon.png` — medium-height armored support pylon / comms mast, reinforced column with platform, orange beacon lights.
- `structure-bastion.png` — medium armored bastion structure, bunker-like fortification with sloped armor plates, orange warning lights.
- `structure-reactor.png` — tall armored reactor silo, cylindrical tower with cooling fins and glowing orange core vents, warning beacons.
- `structure-tower.png` — tall armored command tower, stacked fortified segments with antenna array, orange aviation beacons.
- `corridor-low.png` — low armored corridor wall segment, long horizontal fortified wall with conduit pipes and orange marker lights, straight-on side view.
- `corridor-medium.png` — medium armored corridor wall segment, taller fortified wall with layered plating, conduit pipes and orange marker lights, straight-on side view.
- `gap-edge.png` — broken armored road edge / cliff rim, jagged fractured platform edge with exposed rebar, hazard striping and orange warning lights, side view.

The player ship frames (`assets/ship/player-neutral.png`, `assets/ship/player-thrust.png`) are composited from `art-options/style2-realistic/ship.png`, generated with the same style brief as "sleek realistic metallic sci-fi space interceptor, rear view with glowing engine exhaust, gunmetal hull, orange accent lights".

## Pickup sprites (assets-src/masters/pickups/)

Generated 2026-08-13, same style brief, 1K transparent. Cleaned by `tools/build-pickup-sprites.py` into `assets/pickups/` (512 × 512).

- `boost.png` — small hovering golden energy capsule device, armored gunmetal ring frame, bright glowing yellow lightning bolt emblem in its core, orange warning lights.
- `slow.png` — small hovering violet time-dilation device, armored gunmetal ring frame, glowing purple hourglass emblem in its core, violet energy glow.
- `triple.png` — small hovering cyan star-energy device, armored gunmetal ring frame, bright glowing cyan five-pointed star crystal in its core, cyan energy glow.
- `magnet.png` — small hovering red horseshoe magnet device, classic U-shaped red magnet with white silver pole caps, crackling cyan electric arcs between its poles.

## Menu backdrop

`assets/ui/menu-backdrop.jpg` is derived from `art-options/style2-realistic/environment.png` (2K, generated 2026-08-12): "epic realistic sci-fi canyon landscape at sunset, a sleek metallic roadway running along the canyon toward the horizon, huge ringed planet and nebula in the sky, warm orange sunlight, cinematic game key art". The generator watermark was texture-patched and the image resized to 1600 × 900 JPEG.

## Environment textures (assets-src/masters/bg/)

Generated 2026-08-13. Watermark-patched and compressed into `assets/bg/`.

- `galaxy.png` → `assets/bg/galaxy.jpg` (1920 × 1080 JPEG) — "breathtaking realistic deep-space milky way panorama, dense star field, luminous galaxy band with purple teal and warm orange nebula clouds, cinematic astrophotography style, pure sky".
- `planet.png` → `assets/bg/planet.png` (512 × 512 transparent) — "realistic desert ringed planet, rusty orange sandy sphere with visible craters and dust storms, thin elegant ice ring system tilted, warm sunlight, transparent background".
- `moon.png` → `assets/bg/moon.png` (512 × 512 transparent) — "realistic icy moon sphere, pale blue-white frozen surface with cracks craters and frost texture, cold rim light, transparent background".
- `road-surface.png` → `assets/bg/road-surface.jpg` (1024 × 1024 JPEG) — "seamless top-down texture of a futuristic Mars canyon roadway surface, weathered rusty-red rock and dust mixed with dark gunmetal armored plating strips, flat orthographic top view, tileable pattern".
