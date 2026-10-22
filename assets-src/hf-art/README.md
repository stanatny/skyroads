# Hugging Face 贴图源（v1.3.4 画面重构）

`assets/art/*.webp` 的 11 张运行时贴图全部由 Hugging Face 推理端点上的
**FLUX.1-schnell** 文生图生成，没有使用任何第三方素材库图片。

| 环节 | 文件 |
| --- | --- |
| 提示词 + 随机种子 + 原始输出 | `gen_art_v11.py` / `manifest-v11.json` |
| 确定性配光（曝光、对比度、饱和度、锐化、接缝） | `build_art_v11.py` |
| 运行时消费方 | `src/art-skins.js`（三轴投影蒙皮）、`src/flight_renderer.js`（天空穹顶 / 星云 / 行星 / 月面 / 甲板） |

## 复现

```bash
# 需要 HF token：~/.cache/huggingface/token（Space 为公开 Space，会产生 GPU 配额消耗）
python assets-src/hf-art/gen_art_v11.py            # 只补 manifest 里缺失的
python assets-src/hf-art/gen_art_v11.py --force ship_hull_11
python assets-src/hf-art/build_art_v11.py          # 生成 assets/art/*.webp
```

`manifest-v11.json` 记录了每个槽位的完整提示词与随机种子，因此贴图可以逐字节复现；
Flux 输出本身有极小概率随机差异，配光阶段是确定性的，重烘不会改变已有画面。

## 槽位契约

每张贴图服务的渲染位置、铺图频率（`scale`）与固有色混入比例都写在
`src/flight_renderer.js`、`src/flight_obstacles.js`、`src/flight_objects.js`、
`src/flight_environment.js`、`src/flight_ship.js` 的 `artSkins.paint(...)` 调用里。
**这些几何体没有 uv 属性**（初始化时合并网格，只保留 position/normal/color），
所以贴图靠物体空间三轴投影采样：改 `scale` 就是改"面板密度"，不要指望 uv 平铺。

| 槽位 | 吃它的几何 |
| --- | --- |
| `sky` | 天空穹顶（equirect 全景，mix 1.0） |
| `nebula-veil` | 赛道两侧星云 billboard |
| `planet` / `moon` | 远景行星 / 冰卫 |
| `road-deck` | 甲板上表面 |
| `wall-armor` + `wall-emissive` | 低/中/高障碍墙、护栏 |
| `station-hull` | 空间站外壳、奖励机体细节 |
| `drone-shell` | 无人机 / 炮台（敌机涂装） |
| `ship-hull` + `ship-emissive` | 玩家飞船各材质槽 |

## 许可与归属

这些图是为本仓库生成的原创 AI 美术，按仓库项目许可分发，与 v4 的
`assets-src/masters/` 处理方式一致（见 `THIRD_PARTY_NOTICES.md`）。
FLUX.1-schnell 权重以 Apache-2.0 发布；本目录只存放生成脚本、提示词与种子，
不重新分发模型权重。
