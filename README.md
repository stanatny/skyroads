# 太空跳跳车 SkyRoads

一款致敬经典 SkyRoads 的太空跑酷网页游戏。单文件 HTML，浏览器打开即玩。

## 运行

直接用浏览器打开 `index.html` 即可。

或用本地服务器（推荐，避免 file:// 限制）：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/
```

## 玩法

- **目标**：在无限延伸的太空跑道上尽可能跑远。
- **操作**：
  - `←/→` 或 `A/D`：左右变道（3 条车道）
  - `空格` / `W` / `↑`：跳跃（跨过缺口）
  - `空格` / `Enter`：开始 / 重开
  - `Esc`：回主菜单
- **死亡条件**：
  - 坠入虚空（缺口未跳跃）
  - 撞上障碍物（红色方块）
  - 燃料耗尽
- **燃料**：跑道上的青绿色胶囊可补充燃料。
- **记录**：最佳距离自动保存到浏览器本地存储。

## 技术栈

原生 HTML5 Canvas 2D + JavaScript。零依赖、零构建。

## 设计文档

- 设计：`docs/superpowers/specs/2026-06-22-skyroads-design.md`
- 实现计划：`docs/superpowers/plans/2026-06-22-skyroads-implementation.md`
