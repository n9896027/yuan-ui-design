# Huashu Design 方法借鉴记录

来源：[alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/SKILL.md)，固定提交 `59065698ad63f87ea1532c126c87f488d4f93fd6`，核对日期 2026-11-24。此提交的 SKILL 元数据为 3.5.0；仓库简介与版本标题可能滞后，以固定文件为准。

本机目标仍是生产产品 UI；上游主要面向 HTML 高保真原型与视觉物料。这是择取方法、重新表述的适配，没有安装其 skill、运行脚本，或随本机 skill 打包其风格库、图片、字体与生成工具。

| 借鉴的方法 | 本机落点与适用边界 |
|---|---|
| [参考的问题/机制/表达分层](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/references/directions.md) | visual-quality 的参考提炼：实际查看来源、说明采用关系、从自身内容重做表达；没有测量不编数值。 |
| [可见方向与内容形成的 form](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/references/directions.md) | 仅高视觉新建/骨架重做，用同内容与相近素材完成度比较代表画面；保留本机 2–3 轻量方向与现有授权，不强制三套完整实现。 |
| [关键素材前置](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/references/materials.md) | 区分内容证据、解释与装饰，确认必要素材再定骨架；不强加图片，不把生成替身当具体真实对象。 |
| [内容/语言驱动的排印](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/references/typography.md) | 阅读类型、语言、行长/行高先于字体选择；检查中文混排与字体回退，沿用已有设计系统。 |
| [逐屏批评与保留有效决定](https://github.com/alchaincyf/huashu-design/blob/59065698ad63f87ea1532c126c87f488d4f93fd6/references/polish-loop.md) | 查看实际视口/关键区段，先结构和素材再细节；按真实缺陷迭代，不强制轮数或日志文件。 |

刻意不移入：所有新设计强制停等选择、自动记忆/外观账本、默认调参面板或浏览器存储、下载/安装脚本、原型 CDN 起手式、固定字号/留白/色彩配额和字体禁令。它们各有上游情境，不是本机生产 UI 的默认要求。

上游整体 LICENSE 为 MIT。其 README 另注明小红书演示贴纸有独立许可；本次未取用或分发该目录。审阅用的网页与东亚样张只留在本次评估快照，未移入本机技能。下面保留上游版权与许可原文，适用于本次方法文本适配中涉及的上游部分；不为第三方素材另授许可。

## 上游许可原文

```text
MIT License

Copyright (c) 2026 alchaincyf (花叔 · 花生)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
