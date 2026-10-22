#!/usr/bin/env python3
"""v11 art set — "Full Redraw"（整屏重绘），FLUX.1-schnell on Hugging Face。

为什么还要再来一版：v10 把整屏的色相反转成霓虹深空，但两轮视觉复核的结论是一样的——

  * 局部裁切里飞船"看起来像一架被染色的旧飞船"，因为船体贴图对比度偏低（VLM 6/10），
    远距离被 mipmap 抹成一整块浅灰；
  * 墙/空间站贴图细节够（8/10），但边角料不是无缝的，平铺后出现硬接缝；
  * 行星"糊成一团"，因为云带频率太低，大球面上被拉伸。

v11 不动色相方向（用户已经接受"霓虹深空"），只把**每个元素都真的重画一遍**：

  * 细节密度：从"少量 greeble"改成"密集微刻线 + 铆钉阵列 + 细碎面板"，保证在 40-80px
    高的屏幕上仍然读得出是机械表面，而不是色块。
  * 对比度：每张图按"高微反差"重画（深黑底 + 极亮刻线），配光阶段再按槽位压。
  * 无缝：prompt 明确要求 4 边连续、图案跨越边界，配光阶段再做一次镜像接缝修正。
  * 行星：把云带做成**高频**细带 + 清晰风暴涡，避免大球面拉伸成糊。

  python gen_art_v11.py               # 只补缺失的
  python gen_art_v11.py --force ship_hull_11
"""
import json
import os
import pathlib
import sys
import time

os.environ.setdefault('HF_TOKEN', open(os.path.expanduser('~/.cache/huggingface/token')).read().strip())

ART = pathlib.Path(__file__).resolve().parent
MANIFEST = ART / 'manifest-v11.json'

STYLE = ('sci-fi video game art direction, extremely dense fine surface detail, sharp micro panel '
         'lines, rivet arrays, crisp hard edges, high micro-contrast, deep black substrate with '
         'saturated emissive accents, no text, no watermark, no logo, no UI, no border, no lettering')

SEAMLESS = ('seamless tileable texture, pattern continues across all four edges, no visible seam, '
            'no framing, no vignette, ')

JOBS = {
    # --- 天空穹顶 -----------------------------------------------------------
    'sky_11': dict(
        w=2048, h=1024, seed=110101,
        prompt=('seamless equirectangular panorama of a neon deep-space sky, one colossal magenta to '
                'violet emission nebula arc sweeping along the horizon band, dense electric cyan '
                'filament structure inside it, layered wispy gas with visible internal detail, intense '
                'star points with soft glow, deep indigo black void above and below the arc, '
                'continuous wrap left to right, no planets, no ships, no vignette, ' + STYLE)),
    # --- 星云 billboard -----------------------------------------------------
    'nebula_veil_11': dict(
        w=1024, h=1024, seed=110102,
        prompt=('one bright wispy nebula cloud on pure black background, vivid magenta violet gas with '
                'electric cyan filaments and bright star points inside it, dense layered billowing '
                'structure with fine internal striations, soft irregular edges fading to pure black '
                'well before the image border, centered, most of the image pure black, no frame, '
                'no border, ' + STYLE)),
    # --- 气态巨行星：高频云带，避免大球面拉伸成糊 --------------------------
    'planet_11': dict(
        w=2048, h=1024, seed=110103,
        prompt=('seamless equirectangular planet map of a vivid gas giant, many narrow high-frequency '
                'horizontal storm bands, alternating hot magenta, deep violet, indigo and pale cream, '
                'sharp band boundaries with turbulent curl filaments, several crisp anticyclone ovals, '
                'fine-scale streaked detail everywhere, continuous wrap in both directions, flat even '
                'lighting, no terminator, no shadow, no stars, ' + STYLE)),
    'moon_11': dict(
        w=2048, h=1024, seed=110104,
        prompt=('seamless equirectangular planet map of a cold violet ice moon, dark indigo and pale '
                'lavender fractured ice sheets, dense fine crack networks, long glowing cyan canyon '
                'rifts, crisp small craters with bright rims, continuous wrap in both directions, flat '
                'even lighting, no terminator, no shadow, no stars, ' + STYLE)),
    # --- 路面 ---------------------------------------------------------------
    'road_deck_11': dict(
        w=1024, h=1024, seed=110105,
        prompt=(SEAMLESS + 'orthographic top-down view straight down onto a futuristic space-racing '
                'road deck, polished black obsidian metal plates with dense fine brushed inlays, two '
                'bold glowing ELECTRIC CYAN lane strips running vertically, thin magenta edge lines, '
                'embedded chevron arrows, fine wear scratches and small bolt details, perfectly even '
                'studio lighting, no perspective, no horizon, no objects, ' + STYLE)),
    # --- 障碍装甲 -----------------------------------------------------------
    'wall_armor_11': dict(
        w=1024, h=1024, seed=110106,
        prompt=(SEAMLESS + 'heavy futuristic barrier armor, bold black obsidian plates with bright '
                'electric cyan glowing seams, wide magenta hazard chevron stripe bands, dense fine '
                'panel line grid, rivet arrays, chunky industrial bolts, small caution decal plates, '
                'fine edge scratches, flat orthographic lighting, no perspective, no objects, ' + STYLE)),
    'wall_emissive_11': dict(
        w=1024, h=1024, seed=110107,
        prompt=(SEAMLESS + 'emissive texture, almost entirely black metal substrate with several thin '
                'intense electric cyan energy conduits and small magenta warning lamps arranged in a '
                'regular grid, eighty percent of the image pure black, crisp bright thin lines, flat '
                'orthographic lighting, no perspective, no objects, ' + STYLE)),
    # --- 飞船：AI 重画的机身涂装（骨白 + 电青 + 珊瑚红编织纹） --------------
    'ship_hull_11': dict(
        w=1024, h=1024, seed=110108,
        prompt=(SEAMLESS + 'futuristic racing starship hull skin, bright ivory white ceramic armor '
                'plates with one bold coral red racing stripe crossing the deck, electric cyan edge '
                'trim strips, dense crisp panel line grid, rows of small rivets, narrow dark vent '
                'slots, fine grime in the seams, small warning decals, subtle metallic sheen streaks, '
                'strong value contrast between white panels and dark seams, evenly lit, flat '
                'orthographic lighting, no perspective, no objects, no cockpit, ' + STYLE)),
    'ship_emissive_11': dict(
        w=1024, h=1024, seed=110109,
        prompt=(SEAMLESS + 'emissive texture, black substrate with long thin bright electric cyan '
                'light strips in a regular layout, small coral red status lamps, fine glowing '
                'micro-vents, most of the image black, flat orthographic lighting, no perspective, '
                'no objects, ' + STYLE)),
    # --- 无人机 -------------------------------------------------------------
    'drone_shell_11': dict(
        w=1024, h=1024, seed=110110,
        prompt=(SEAMLESS + 'hostile military drone hull skin, matte gunmetal grey armor plates with '
                'sharp black panel gaps, dense fine fasteners, glowing magenta sensor slits, small '
                'cyan technical markings and stencil bars, scuffed chipped edges, visible plate '
                'thickness, flat orthographic lighting, no perspective, no objects, ' + STYLE)),
    # --- 空间站外板 ---------------------------------------------------------
    'station_hull_11': dict(
        w=1024, h=1024, seed=110111,
        prompt=(SEAMLESS + 'orbital station exterior plating, dark graphite steel panels with bright '
                'electric cyan seams, rows of magenta lit windows, large radiator fins, dense fine '
                'panel grid with bolts, light weathering streaks, flat orthographic lighting, '
                'no perspective, no objects, ' + STYLE)),
}


def client_class():
    from gradio_client import Client
    return Client('black-forest-labs/FLUX.1-schnell', token=os.environ['HF_TOKEN'], verbose=False,
                  download_files=str(ART), httpx_kwargs={'timeout': 300})


def generate(client, job, tries=4):
    last = None
    for attempt in range(tries):
        try:
            return client.predict(job['prompt'], job['seed'], False,
                                  job['w'], job['h'], 4, api_name='/infer')
        except Exception as error:  # noqa: BLE001 - 网络抖动，重试后上报
            last = error
            print(f'  retry {attempt + 1}/{tries}: {type(error).__name__}: {error}', flush=True)
            time.sleep(5 * (attempt + 1))
    raise last


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    ART.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    todo = [n for n in (args or JOBS) if force or n not in manifest]
    if not todo:
        print(json.dumps({'up_to_date': sorted(manifest)}))
        return
    client = client_class()
    for name in todo:
        job = JOBS[name]
        started = time.time()
        result, used_seed = generate(client, job)
        path = result['path'] if isinstance(result, dict) else result
        manifest[name] = {'prompt': job['prompt'], 'seed': used_seed, 'file': str(path),
                          'width': job['w'], 'height': job['h'],
                          'seconds': round(time.time() - started, 1)}
        MANIFEST.write_text(json.dumps(manifest, indent=2))
        print(json.dumps({name: manifest[name]}), flush=True)


if __name__ == '__main__':
    main()
