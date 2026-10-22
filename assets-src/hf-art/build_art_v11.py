#!/usr/bin/env python3
"""把 art-v11/（Full Redraw）转成游戏真正加载的 assets/art/*.webp。

v11 相对 v10 只在配光上改了两件事：对比度整体上调（船体 1.14→1.48，因为视觉复核判定
"远距离糊成一块浅灰"），以及行星/无人机加一道 unsharp（云带与紧固件要在 40-80px 高度里读得出来）。

每张 FLUX 图的曝光都不可控，所以这里做一次**确定性配光**：先按目标平均亮度完成整张图的
曝光，再压/拉对比度与饱和度。v10 的明度结构（相对 v9 提亮了一档，因为 v9 被玩家评价为
"变暗了但没变化"）：

    背景 0.13  <  障碍 0.34  <  飞船 0.52

天空的垂直压暗比 v9 弱：星云弧要真的看得见，而不是一层灰雾。

  python build_art_v11.py            # 全部重建
  python build_art_v11.py sky        # 只重建一张（按 key 前缀匹配）
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageEnhance

HERE = pathlib.Path(__file__).resolve().parent
V11 = HERE / 'manifest-v11.json'
DEST = HERE.parent.parent / 'assets' / 'art'

# 槽位 -> (输出文件, 长边上限, 配光参数)
#   mean      目标平均亮度（0-1）
#   sat       饱和度倍数
#   contrast  以图自身平均亮度为轴心的对比度倍数
#   falloff   仅 equirect 全景用：顶部/底部额外压暗的比例
SLOTS = {
    'sky_11':         ('sky.webp', 2048,
                       dict(mean=0.098, sat=1.95, contrast=1.34, falloff=(0.44, 0.70, 0.30))),
    'nebula_veil_11': ('nebula-veil.webp', 1024,
                       dict(mean=0.165, sat=1.75, contrast=1.28)),
    'planet_11':      ('planet.webp', 2048,
                       dict(mean=0.340, sat=1.55, contrast=1.34, sharpness=1.35)),
    'moon_11':        ('moon.webp', 2048,
                       dict(mean=0.330, sat=1.10, contrast=1.22, sharpness=1.25)),
    'road_deck_11':   ('road-deck.webp', 1024,
                       dict(mean=0.150, sat=1.55, contrast=1.34, sharpness=1.9, overlay='deck')),
    'wall_armor_11':  ('wall-armor.webp', 1024,
                       dict(mean=0.330, sat=1.38, contrast=1.56, sharpness=1.9)),
    'wall_emissive_11': ('wall-emissive.webp', 1024,
                       dict(mean=0.150, sat=1.45, contrast=1.30)),
    'ship_hull_11':   ('ship-hull.webp', 1024,
                       dict(mean=0.520, sat=1.30, contrast=1.48, sharpness=1.6)),
    'ship_emissive_11': ('ship-emissive.webp', 1024,
                       dict(mean=0.220, sat=1.25, contrast=1.22)),
    'drone_shell_11': ('drone-shell.webp', 1024,
                       dict(mean=0.300, sat=1.34, contrast=1.46, sharpness=1.7)),
    'station_hull_11': ('station-hull.webp', 1024,
                       dict(mean=0.330, sat=1.24, contrast=1.38, sharpness=1.55)),
}


def grade(rgb, mean, sat, contrast, falloff=None):
    """对比度 → 饱和度 → 按目标重标平均亮度 → 垂直压暗。

    对比度围绕这张图自己的平均亮度展开（不是 0.5）：深空图平均只有 0.02，围绕 0.5 拉伸
    会把整张图压成纯黑（v9 第一次配光就这么翻车过）。
    """
    grey = rgb.mean(axis=-1, keepdims=True)
    pivot = float(grey.mean())
    rgb = np.clip((rgb - pivot) * contrast + pivot, 0.0, 1.0)
    grey = rgb.mean(axis=-1, keepdims=True)
    rgb = np.clip(grey + (rgb - grey) * sat, 0.0, 1.0)
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    current = float(lum.mean())
    if current > 1e-4:
        rgb = rgb * (mean / current)
    if falloff:
        top_gain, bottom_gain, band_fraction = falloff
        height = rgb.shape[0]
        band = max(2, int(height * band_fraction))
        ramp = np.ones((height, 1, 1), dtype=np.float32)
        ramp[:band, 0, 0] = np.linspace(top_gain, 1.0, band, dtype=np.float32)
        ramp[-band:, 0, 0] = np.linspace(1.0, bottom_gain, band, dtype=np.float32)
        rgb = rgb * ramp
    return np.clip(rgb, 0.0, 1.0)


def deck_overlay(size=1024, strength=0.42):
    """程序化板缝/铆钉遮罩，乘回 HF 路面贴图。

    HF 生成的板面在远处被 mipmap 抹平后读起来"糊"；赛道需要的是任意距离都清晰的硬边缝。
    用确定性几何画缝再乘回去，既保留 HF 材质，又保住可读性。
    """
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    mask = np.ones((size, size), dtype=np.float32)
    cells = 2
    for axis in (xx, yy):
        edge = np.abs(((axis * cells) % 1.0) - 0.0)
        dist = np.minimum(edge, 1.0 - edge) / cells
        seam = np.clip(1.0 - dist / 0.004, 0.0, 1.0)
        lip = np.clip(1.0 - np.abs(dist - 0.006) / 0.003, 0.0, 1.0)
        mask *= 1.0 - seam * 0.85
        mask *= 1.0 + lip * 0.35
    for cx in (0.25, 0.75):
        for cy in (0.25, 0.75):
            radius = np.hypot(xx - cx, yy - cy)
            mask *= 1.0 - np.clip(1.0 - radius / 0.008, 0.0, 1.0) * 0.75
            mask *= 1.0 + np.clip(1.0 - np.abs(radius - 0.011) / 0.003, 0.0, 1.0) * 0.30
    return (1.0 + (mask - 1.0) * strength)[..., None]


def main():
    wanted = [a for a in sys.argv[1:] if not a.startswith('-')]
    manifest = json.loads(V11.read_text()) if V10.exists() else {}
    DEST.mkdir(parents=True, exist_ok=True)
    written = []
    for slot, (filename, longest, params) in SLOTS.items():
        if wanted and not any(slot.startswith(prefix) or filename.startswith(prefix) for prefix in wanted):
            continue
        if slot not in manifest:
            print(f'skip {slot}: 清单里没有')
            continue
        source = pathlib.Path(manifest[slot]['file'])
        if not source.exists():
            print(f'skip {slot}: 文件不存在 {source}')
            continue
        image = Image.open(source).convert('RGB')
        width, height = image.size
        scale = min(1.0, longest / max(width, height))
        if scale < 1.0:
            image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))),
                                 Image.LANCZOS)
        rgb = np.asarray(image, dtype=np.float32) / 255.0
        graded = grade(rgb, params['mean'], params['sat'], params['contrast'], params.get('falloff'))
        if params.get('overlay') == 'deck':
            graded = np.clip(graded * deck_overlay(graded.shape[0]), 0.0, 1.0)
        out = Image.fromarray((graded * 255.0 + 0.5).astype(np.uint8), 'RGB')
        out = ImageEnhance.Sharpness(out).enhance(params.get('sharpness', 1.15))
        target = DEST / filename
        out.save(target, 'WEBP', quality=90, method=6)
        lum = (0.2126 * graded[..., 0] + 0.7152 * graded[..., 1] + 0.0722 * graded[..., 2])
        written.append({'slot': slot, 'file': str(target), 'size': list(out.size),
                        'bytes': target.stat().st_size,
                        'lum_mean': round(float(lum.mean()), 3)})
        print(json.dumps(written[-1]), flush=True)
    print(json.dumps({'written': len(written)}))


if __name__ == '__main__':
    main()
