# 跨媒介节目出稿样例

传入的节目 JSON 是唯一排片事实源；图片与各自的 `.provenance.json` 由调用方提供，工具不修改它们。图片字段相对 JSON 所在目录解析。

从仓库根目录运行：

```bash
python3 /path/to/skills/yuan-ui-design/scripts/render-silent-programme.py \
  --data /path/to/programme.json --out /path/to/output
```

会重建指定的输出目录：

- `programme.html`：内嵌图片、无外部网络依赖的中文节目页；
- `programme.pptx`：文字均为 PowerPoint 文本框，照片为单独图片对象；
- `programme.pdf`：由同一 HTML 的 headless Chromium 打印结果；
- `social-cover.png` 与 `social-{film-id}.png`：可在 HTML 中编辑文字后重新导出的封面和三个场次竖版画面；
- `social.mp4`、`social.gif`：封面、三部片场次各停留三秒的四场景时间轴；它们不含影片片段；
- `timeline.json`：包含场景 ID、顺序与时长；可编辑后通过 `--timeline /path/to/timeline.json` 复用；
- `manifest.json`：源 JSON、场次时间、每张图的作者/署名/许可/来源页及导出画面/时间轴采样哈希，供快速复核。

运行依赖：Python 3、`python-pptx`、Playwright、FFmpeg。运行脚本的项目须可由 Node 解析 `playwright`（可设置 `NODE_PATH=/path/to/node_modules`）；Playwright 浏览器路径可按其惯例安装，或以 `PLAYWRIGHT_EXECUTABLE_PATH` 显式传入。没有网络下载、webfont 或在线图片。Playwright 浏览器在 `try/finally` 中关闭。

可用临时 JSON 验证数据联动，不触碰原始排片：

```bash
python3 /path/to/skills/yuan-ui-design/scripts/render-silent-programme.py \
  --data /tmp/programme-time-check.json --out /tmp/silent-programme-time-check
```

`film.id` 必须唯一、不能为保留的 `cover`，并匹配 `[a-z0-9][a-z0-9_-]*`，以安全地生成 `social-{film.id}` 文件名；所有图片与 sidecar 必须位于输入 JSON 目录内，缺失时脚本会给出明确错误。每次出稿会对图片 SHA-256 与 sidecar 的 `asset.sha256` 交叉核对。

所有成品均明确“虚构策展示例”。工具支持 Wikimedia sidecar 的 `author`、`credit`、`license`、`file_page`，以及 `image_provenance.py import-local` 产生的 `reference`、`rights_note`、`author`；没有这些字段时不会猜测作者、许可或“公共领域”。HTML/PDF/PPTX 与社交画面均写入实际可用的来源/权利文字。

限制：PDF、PNG、MP4 与 GIF 是最终渲染，文字不可编辑；PPTX 的文本可编辑但最终字体会随审阅机器可用字体回退。PPTX 将图片按原始比例置入，且每个来源页最多三条。来源页记录可追溯性，不能独自替代公开发布前的权利与适用性复核。
