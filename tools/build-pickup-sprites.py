#!/usr/bin/env python3
"""Clean AI-generated pickup masters -> assets/pickups/*.png (512x512).

Steps per master: watermark erase -> alpha threshold -> keep significant
connected components -> trim -> square pad -> resize 512.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "assets-src" / "masters" / "pickups"
OUT = ROOT / "assets" / "pickups"
IDS = ["boost", "slow", "triple", "magnet"]
WATERMARK_BOX = (0, 0.90, 0.16, 1.0)  # x0,y0,x1,y1 relative
ALPHA_THRESHOLD = 48
MIN_COMPONENT_RATIO = 0.02
TARGET = 512
MARGIN_RATIO = 0.05


def keep_significant_components(alpha: np.ndarray) -> np.ndarray:
    mask = alpha > 0
    if not mask.any():
        return mask
    labels = np.zeros(mask.shape, dtype=np.int32)
    current = 0
    # Iterative dilation labeling: seed each unlabeled pixel, grow until stable.
    seeds = np.argwhere(mask)
    for sy, sx in seeds:
        if labels[sy, sx] != 0:
            continue
        current += 1
        region = np.zeros(mask.shape, dtype=bool)
        region[sy, sx] = True
        while True:
            grown = region.copy()
            grown[1:, :] |= region[:-1, :]
            grown[:-1, :] |= region[1:, :]
            grown[:, 1:] |= region[:, :-1]
            grown[:, :-1] |= region[:, 1:]
            grown &= mask
            grown |= region
            if (grown == region).all():
                break
            region = grown
        labels[region] = current
    sizes = np.bincount(labels.ravel())
    largest = sizes[1:].max() if len(sizes) > 1 else 0
    keep = np.zeros_like(mask)
    for label in range(1, len(sizes)):
        if sizes[label] >= largest * MIN_COMPONENT_RATIO:
            keep |= labels == label
    return keep


def process(asset_id: str) -> None:
    source = Image.open(MASTERS / f"{asset_id}.png").convert("RGBA")
    data = np.array(source)
    height, width = data.shape[:2]

    x0, y0 = int(WATERMARK_BOX[0] * width), int(WATERMARK_BOX[1] * height)
    x1, y1 = int(WATERMARK_BOX[2] * width), int(WATERMARK_BOX[3] * height)
    data[y0:y1, x0:x1, 3] = 0

    data[data[:, :, 3] < ALPHA_THRESHOLD, 3] = 0
    keep = keep_significant_components(data[:, :, 3])
    data[~keep, 3] = 0
    data[data[:, :, 3] == 0, :3] = 0

    ys, xs = np.nonzero(data[:, :, 3])
    top, bottom = ys.min(), ys.max()
    left, right = xs.min(), xs.max()
    cropped = data[top:bottom + 1, left:right + 1]

    side = int(max(cropped.shape[0], cropped.shape[1]) * (1 + 2 * MARGIN_RATIO))
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    oy = (side - cropped.shape[0]) // 2
    ox = (side - cropped.shape[1]) // 2
    canvas[oy:oy + cropped.shape[0], ox:ox + cropped.shape[1]] = cropped

    image = Image.fromarray(canvas, "RGBA").resize((TARGET, TARGET), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{asset_id}.png", optimize=True)
    print(asset_id, "trim", (right - left + 1, bottom - top + 1), "->", image.size)


for asset_id in IDS:
    process(asset_id)
