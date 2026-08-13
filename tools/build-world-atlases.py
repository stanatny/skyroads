#!/usr/bin/env python3
"""Build Nebula Cruise world atlases from AI-generated master sprites.

Pipeline (docs/assets/world-art.md):
  assets-src/masters/<id>.png  -- AI master sprites (front view, transparent)
  assets-src/atlas-anchors.json -- world anchors reused from the v3 atlas
  ->
  assets/world/<id>.png        -- 2240x960 upright atlas (7 yaw x 3 pitch cells)
  assets/world/gap-edge.png    -- 3584x512 road-edge atlas (7 yaw cells)
  assets/ship/player-{neutral,thrust}.png
  src/world-art.js             -- GENERATED_UPRIGHT_ATLAS_DATA re-spliced

Every step is deterministic: same masters + anchors => same atlases.
"""
import copy
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / 'assets-src' / 'masters'
ANCHORS_PATH = ROOT / 'assets-src' / 'atlas-anchors.json'
WORLD_ART_JS = ROOT / 'src' / 'world-art.js'
SHIP_MASTER = ROOT / 'art-options' / 'style2-realistic' / 'ship.png'

CELL = 320
ATLAS_W, ATLAS_H = 2240, 960
YAW = [-80, -55, -30, 0, 30, 55, 80]
PITCH = [20, 55, 80]
LEGACY_YAW = [-30, -20, -10, 0, 10, 20, 30]

# Non-drone frames must strictly shorten as pitch rises (tests/assets.test.js).
# Row height / column width ratios come from the v3 atlas: they encode real
# 3D foreshortening and are reused as shape envelopes for the new sprites.
HEIGHT_STRETCH_CAP = 1.6  # max vertical distortion to approach worldHeight

# Realistic textures need more source pixels per world unit than the old
# flat-shaded low-poly art, or they upscale into mush on screen. Each slot's
# pixelsPerWorldUnit is recomputed as CENTER_PX / worldWidth, so on-screen
# world size is unchanged; only source pixel density rises.
CENTER_PX = 136
CELL_CONTENT = CELL - 2  # 1px transparent border on every side

RUNTIME_KEYS = {
    'drone-scout': 'droneScout', 'drone-striker': 'droneStriker',
    'turret-sentry': 'turretSentry', 'turret-heavy': 'turretHeavy',
    'barrier-rail': 'barrierRail', 'barrier-crate': 'barrierCrate',
    'structure-pylon': 'structurePylon', 'structure-bastion': 'structureBastion',
    'structure-reactor': 'structureReactor', 'structure-tower': 'structureTower',
    'corridor-low': 'corridorLow', 'corridor-medium': 'corridorMedium',
}
SLOT_IDS = list(RUNTIME_KEYS.keys())


def load_rgba(path):
    return Image.open(path).convert('RGBA')


def erase_watermark(im):
    """Zero the AI-watermark text in the bottom-left corner.

    The watermark is near-white text over transparency; detect near-white
    pixels inside the corner zone and erase their bounding box (plus pad).
    """
    arr = np.array(im)
    h, w = arr.shape[:2]
    zone = np.zeros((h, w), dtype=bool)
    zone[int(h * 0.90):, : int(w * 0.22)] = True
    white = (arr[..., 0] > 200) & (arr[..., 1] > 200) & (arr[..., 2] > 200) & (arr[..., 3] > 150)
    hits = np.argwhere(white & zone)
    if hits.size == 0:
        return im
    y0, x0 = hits.min(axis=0)
    y1, x1 = hits.max(axis=0)
    pad = 8
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad + 1), min(h, y1 + pad + 1)
    arr[y0:y1, x0:x1, :] = 0
    return Image.fromarray(arr)


def clean_master(im):
    """Watermark removal, alpha denoise, chroma-fringe removal, trim."""
    im = erase_watermark(im)
    arr = np.array(im).astype(np.int16)
    alpha = arr[..., 3]
    # 1. hard denoise: nearly-invisible pixels vanish
    alpha[alpha < 48] = 0
    # 2. chroma fringe: vivid semi-transparent pixels are generation noise
    rgb = arr[..., :3]
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    fringe = (spread > 90) & (alpha < 210)
    alpha[fringe] = 0
    arr[..., 3] = alpha
    # 3. zero hidden RGB (repo invariant)
    hidden = alpha == 0
    arr[..., 0][hidden] = 0
    arr[..., 1][hidden] = 0
    arr[..., 2][hidden] = 0
    im = Image.fromarray(arr.astype(np.uint8))
    return trim(im), im


def trim(im, pad=2):
    arr = np.array(im)
    ys, xs = np.nonzero(arr[..., 3])
    if len(xs) == 0:
        raise ValueError('master has no visible pixels')
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
    return im.crop((x0, y0, x1, y1))


def yaw_width_factor(deg):
    return 0.55 + 0.45 * math.cos(math.radians(abs(deg)))


def shear_content(im, deg):
    """Fake yaw rotation: lean the sprite top opposite the yaw direction."""
    if deg == 0:
        return im
    k = -math.copysign(0.30 * math.sin(math.radians(abs(deg))), deg)
    # forward: x' = x + k*(y - cy); inverse: x = x' - k*(y - cy)
    cy = im.height / 2
    return im.transform(im.size, Image.AFFINE, (1, -k, k * cy, 0, 1, 0),
                        resample=Image.BICUBIC)


def feather_edge(im, edge_alpha=216):
    """Feather the 1px silhouette ring to a consistent high partial alpha.

    tests/assets.test.js recovers subpixel silhouette edges from the modal
    partial alpha of the outermost columns; a uniform ring keeps the measured
    armor envelope inside the +/-2 world-unit tolerance for every slot.
    """
    arr = np.array(im)
    alpha = arr[..., 3]
    solid = alpha > 0
    padded = np.pad(solid, 1)
    interior = (padded[1:-1, 1:-1] & padded[:-2, 1:-1] & padded[2:, 1:-1]
                & padded[1:-1, :-2] & padded[1:-1, 2:])
    ring = solid & ~interior
    arr[..., 3] = np.where(ring, 216, alpha)
    return Image.fromarray(arr)


def render_cell(content, yaw_deg, width, height):
    frame = content.resize((max(2, width), max(2, height)), Image.LANCZOS)
    frame = shear_content(frame, yaw_deg)
    return feather_edge(trim(frame, pad=0))


def paste_anchored(atlas, frame, cell_x, cell_y, anchor_x, anchor_y):
    """Paste so frame bbox bottom-center lands on (anchor_x, anchor_y).

    The paste point is clamped inside the cell's 1px transparent border; a
    sub-pixel nudge is invisible because draw plans use (origin - source)
    deltas. Rescales down only if the frame exceeds the whole content area.
    """
    while frame.width > CELL_CONTENT or frame.height > CELL_CONTENT:
        scale = min(CELL_CONTENT / frame.width, CELL_CONTENT / frame.height) * 0.98
        frame = frame.resize((max(2, round(frame.width * scale)),
                              max(2, round(frame.height * scale))), Image.LANCZOS)
    px = round(anchor_x - frame.width / 2)
    py = round(anchor_y - frame.height)
    px = max(cell_x + 1, min(px, cell_x + CELL - 1 - frame.width))
    py = max(cell_y + 1, min(py, cell_y + CELL - 1 - frame.height))
    atlas.alpha_composite(frame, (px, py))


def zero_hidden_rgb(im):
    arr = np.array(im)
    hidden = arr[..., 3] == 0
    arr[..., 0][hidden] = 0
    arr[..., 1][hidden] = 0
    arr[..., 2][hidden] = 0
    return Image.fromarray(arr)


def cell_bbox(atlas_arr, cell_x, cell_y):
    sub = atlas_arr[cell_y:cell_y + CELL, cell_x:cell_x + CELL, 3]
    ys, xs = np.nonzero(sub)
    if len(xs) == 0:
        raise ValueError(f'empty cell at {cell_x},{cell_y}')
    return {
        'sx': int(cell_x + xs.min()), 'sy': int(cell_y + ys.min()),
        'sw': int(xs.max() - xs.min() + 1), 'sh': int(ys.max() - ys.min() + 1),
    }


def build_upright(slot_id, anchors):
    master, _ = clean_master(load_rgba(MASTERS / f'{slot_id}.png'))
    category = anchors['category']
    geom_h = anchors['worldBounds']['maxY'] - anchors['worldBounds']['minY']
    geom_w = anchors['worldBounds']['maxX'] - anchors['worldBounds']['minX']

    frames = anchors['frames']
    center = frames[10]  # middle pitch row, zero yaw
    delta_x = center['origin']['x'] - (center['source']['sx'] + center['source']['sw'] / 2)
    delta_y = center['origin']['y'] - (center['source']['sy'] + center['source']['sh'])

    # Shape envelope from the v3 atlas: column width ratios and row height
    # ratios encode real foreshortening and are guaranteed to fit the cells.
    old_cw = [frames[r * 7 + 3]['source']['sw'] for r in range(3)]
    old_ch = [frames[r * 7 + 3]['source']['sh'] for r in range(3)]
    width_ratio = [[frames[r * 7 + c]['source']['sw'] / old_cw[r] for c in range(7)]
                   for r in range(3)]
    height_ratio = [old_ch[r] / old_ch[0] for r in range(3)]

    w0 = CENTER_PX
    ppwu = w0 / geom_w
    wanted_h = geom_h * ppwu
    natural_h = w0 * master.height / master.width
    base_h = min(max(natural_h, wanted_h * 0.8), wanted_h * 1.3)
    base_h = min(base_h, natural_h * HEIGHT_STRETCH_CAP, CELL_CONTENT)
    row_h = [min(CELL_CONTENT, base_h * ratio) for ratio in height_ratio]
    if category != 'drone':
        # tests require strictly decreasing center heights across pitch rows
        row_h[1] = min(row_h[1], row_h[0] - 2)
        row_h[2] = min(row_h[2], row_h[1] - 2)

    atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    new_frames = []
    for row in range(3):
        for col, yaw_deg in enumerate(YAW):
            w = max(2, round(w0 * width_ratio[row][col]))
            h = max(2, round(row_h[row]))
            frame = render_cell(master, yaw_deg, w, h)
            cell_x, cell_y = col * CELL, row * CELL
            # Anchor at the cell's bottom margin: only the (origin - content)
            # delta matters to the draw plan, and the old anchors capped how
            # many pixels tall objects could have. Content bottom sits at
            # origin.y - delta_y exactly as before.
            anchor_x = cell_x + CELL / 2 + delta_x
            anchor_y = cell_y + CELL - 1 + delta_y
            paste_anchored(atlas, frame, cell_x, cell_y, anchor_x, anchor_y)
            new_frames.append({
                'origin': {'x': round(anchor_x, 6), 'y': round(anchor_y, 6)},
                'source': None,  # filled after the bbox scan
            })
    atlas = zero_hidden_rgb(atlas)
    atlas.save(ROOT / 'assets' / 'world' / f'{slot_id}.png')

    arr = np.array(atlas)
    for index, frame in enumerate(new_frames):
        col, row = index % 7, index // 7
        frame['source'] = cell_bbox(arr, col * CELL, row * CELL)

    # Self-calibrate pixelsPerWorldUnit: measure the center low-pitch
    # silhouette with the exact algorithm tests/assets.test.js uses, so the
    # reported armor envelope equals worldWidth by construction.
    ppwu = measure_center_span(arr, 3) / geom_w
    return {
        'atlasHeight': ATLAS_H, 'atlasWidth': ATLAS_W,
        'detailFrontZ': anchors['detailFrontZ'],
        'frameHeight': CELL, 'frameWidth': CELL,
        'frames': new_frames, 'layout': 'upright',
        'pitchDegrees': PITCH, 'pixelsPerWorldUnit': ppwu,
        'worldBounds': anchors['worldBounds'], 'yawDegrees': YAW,
    }


def measure_center_span(atlas_arr, frame_index):
    """Pixel span of a frame's silhouette with subpixel edge recovery."""
    cell_x = (frame_index % 7) * CELL
    cell_y = (frame_index // 7) * CELL
    sub = atlas_arr[cell_y:cell_y + CELL, cell_x:cell_x + CELL, 3]
    columns = [x for x in range(CELL) if sub[:, x].max() >= 16]

    def modal_partial(x):
        values = sub[:, x]
        partials = values[(values >= 16) & (values < 255)]
        unique, counts = np.unique(partials, return_counts=True)
        order = np.lexsort((unique, -counts))
        return int(unique[order[0]])

    left, right = columns[0], columns[-1]
    left_edge = left + 1 - modal_partial(left) / 255
    right_edge = right + modal_partial(right) / 255
    return right_edge - left_edge


def build_gap_edge():
    master, _ = clean_master(load_rgba(MASTERS / 'gap-edge.png'))
    frame_w, frame_h = 512, 512
    atlas = Image.new('RGBA', (frame_w * 7, frame_h), (0, 0, 0, 0))
    for col, yaw_deg in enumerate(LEGACY_YAW):
        w = round(400 * (0.62 + 0.38 * math.cos(math.radians(abs(yaw_deg)))))
        h = round(w * master.height / master.width * 0.9)
        frame = master.resize((w, h), Image.LANCZOS)
        frame = shear_content(frame, yaw_deg * 2)  # exaggerate lean for depth
        frame = trim(frame, pad=0)
        px = col * frame_w + round((frame_w - frame.width) / 2)
        py = 420 - frame.height
        atlas.alpha_composite(frame, (px, py))
    atlas = zero_hidden_rgb(atlas)
    atlas.save(ROOT / 'assets' / 'world' / 'gap-edge.png')


def flame_mask(arr):
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    h = arr.shape[0]
    lower = np.zeros(h, dtype=bool)
    lower[int(h * 0.45):] = True
    warm = (r > 200) & (g > 70) & (g < 210) & (b < 140) & (r > g) & (a > 60)
    return warm & lower[:, None]


def build_ship():
    master, _ = clean_master(load_rgba(SHIP_MASTER))
    arr = np.array(master)
    flames = flame_mask(arr)

    def variant(brightness, glow):
        out = arr.copy()
        rgb = out[..., :3].astype(np.float32)
        rgb[flames] = np.clip(rgb[flames] * brightness, 0, 255)
        out[..., :3] = rgb.astype(np.uint8)
        im = Image.fromarray(out)
        if glow > 0:
            mask_im = Image.fromarray((flames * 255).astype(np.uint8)).filter(
                __import__('PIL.ImageFilter', fromlist=['GaussianBlur']).GaussianBlur(18))
            boost = np.array(mask_im).astype(np.float32) * glow
            rgb = np.array(im)[..., :3].astype(np.float32)
            gold = np.array([255.0, 190.0, 90.0])
            rgb = np.clip(rgb + boost[..., None] * gold / 255.0, 0, 255)
            im = Image.fromarray(np.dstack([rgb.astype(np.uint8), out[..., 3]]))
        return im

    def compose(im):
        content = trim(im, pad=1)
        scale = min(500 / content.width, 380 / content.height)
        content = content.resize((round(content.width * scale),
                                  round(content.height * scale)), Image.LANCZOS)
        canvas = Image.new('RGBA', (512, 384), (0, 0, 0, 0))
        canvas.alpha_composite(content, (round((512 - content.width) / 2),
                                         382 - content.height))
        return zero_hidden_rgb(canvas)

    compose(variant(0.42, 0)).save(ROOT / 'assets' / 'ship' / 'player-neutral.png')
    compose(variant(1.18, 0.55)).save(ROOT / 'assets' / 'ship' / 'player-thrust.png')


def splice_metadata(metadata):
    source = WORLD_ART_JS.read_text()
    lines = []
    for slot_id in SLOT_IDS:
        lines.append(f'      "{slot_id}": {json.dumps(metadata[slot_id], separators=(",", ":"))},')
    body = 'return deepFreeze({\n' + '\n'.join(lines) + '\n    });'
    start_marker = 'return deepFreeze({'
    end_marker = '\n    });\n  })();'
    start = source.index(start_marker)
    end = source.index(end_marker)
    updated = source[:start] + body + source[end + len('\n    });'):]
    WORLD_ART_JS.write_text(updated)


def main():
    anchors = json.loads(ANCHORS_PATH.read_text())['slots']
    metadata = {}
    for slot_id in SLOT_IDS:
        metadata[slot_id] = build_upright(slot_id, anchors[RUNTIME_KEYS[slot_id]])
        print(f'built upright atlas {slot_id}')
    build_gap_edge()
    print('built gap-edge road atlas')
    build_ship()
    print('built ship frames')
    splice_metadata(metadata)
    print('spliced GENERATED_UPRIGHT_ATLAS_DATA into src/world-art.js')


if __name__ == '__main__':
    sys.exit(main())
