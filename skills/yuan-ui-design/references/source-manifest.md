# Source Manifest and Maintenance

v2.5.0-dev.2 核对于 2026-11-24。既有屏幕的分级诊断与分层精修改编自 Damir Sokolovsky 的 Unslop，固定提交 `620163eedb3529d9cd23a3994ed8d287d06f760d`。[改编范围、作者与 CC BY 4.0 许可](unslop.md#来源与改编)

v2.4.0 平台与空间交互审阅（2026-11-24）。平台导航依据 [Android 导航原则](https://developer.android.com/guide/navigation/principles)，PWA 安装与启动依据 [MDN 安装指南](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)。模型显示与加载参考 [model-viewer 实例](https://modelviewer.dev/examples/loading/)，头显输入与舒适度参考 [Apple visionOS 设计指南](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)。具体能力按目标宿主和版本验证。

v2.3.0 审阅：2026-11-24。WCAG/ARIA、Web Vitals、DTCG 与既有 AI 协议结论沿用同日 v2.1 核对，视觉方法来源保留 v2.2 的固定 Huashu 快照。此次增量来自已有 React 仓库的本地保存/恢复实施，并核对 React 官方 Effect 与状态更新说明，以及 PDF.js 已安装 6.2.108 类型与官方 API 的资源清理所有者；不扩展外部协议结论。检索日期不是规范或产品发布日期。

## 规范来源

- 本轮仓库集成：React [useEffect](https://react.dev/reference/react/useEffect)、[useState](https://react.dev/reference/react/useState)；PDF.js [display/api.js](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)（可变主分支仅辅助说明，实际方法以目标依赖的类型及运行验证为准）。

- WCAG 2.2 Recommendation：https://www.w3.org/TR/WCAG22/
- WCAG 2.2 新成功标准说明：https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- WAI-ARIA Authoring Practices Guide：https://www.w3.org/WAI/ARIA/apg/
- APG Keyboard Interface：https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- Core Web Vitals：https://web.dev/articles/vitals
- Interaction to Next Paint：https://web.dev/articles/inp
- Design Tokens Format Module 2025.10（2025-10-28 Final Community Group Report）：https://www.designtokens.org/tr/2025.10/format/
- forced-colors：https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/forced-colors
- prefers-reduced-motion：https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

DTCG 是 Design Tokens Community Group 规范，不把它表述为 W3C Recommendation。MDN 用于浏览器实现说明，不替代规范本身。

## AI 设计方法与协议

以下是决策依据与可选适配，不是工具安装清单。维护可变文档时记录核对日期；做具体集成时重新查目标版本、宿主和 SDK。

| 来源 | 本轮确认与适用边界 |
|---|---|
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 当前可变主分支：主题驱动、先比较设计计划再实现、识别新模板默认；学习方法，不克隆品牌或导入全部指令。 |
| [Claude Design 发布说明](https://www.anthropic.com/news/claude-design-anthropic-labs) | 2026-04-17 发布时为 research preview；支持广泛探索、直接编辑和设计系统交接的方法，不据此推断当前套餐或可用性。 |
| [Vercel AI-powered prototyping with design systems](https://vercel.com/blog/ai-powered-prototyping-with-design-systems) | 2025-08-22：模型需要组件行为、组合规则和设计语境；不要求项目迁移至 v0 或 shadcn/ui。 |
| [Figma Code Connect and MCP](https://help.figma.com/hc/en-us/articles/42495296821911-Code-Connect-and-MCP) | 当前文档：传递真实组件属性、import 和调用片段；依赖已连接组件及账户能力，没有 Figma 时直接以仓库为准。 |
| [AG-UI 1.0 规范](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/index.mdx) | 事件流、共享状态、interrupt/resume 与信任边界；规范字段不保证每个 adapter 的实现覆盖。 |
| [Google A2UI 1.0](https://developers.googleblog.com/a2ui-10-build-delightful-fast-reliable-agentic-experiences/) | 2026-11-11 发布首个稳定协议；受注册组件约束的生成式 UI。部分宿主/renderer 在发布文中仍停留 0.9.x，必须探测能力。 |
| [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) | MCP 扩展，工具关联 UI 资源并在宿主中隔离呈现；是开发者编写的交互应用，并不强制采用生成式布局。 |
| [OpenAI UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines) | inline、fullscreen、PiP 按任务选用；是 ChatGPT 宿主设计要求，不外推为独立网站的字体、颜色或导航限制。 |

## 维护规则

### Huashu Design 方法来源

用户指定参考 [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design)。本次固定提交 `59065698ad63f87ea1532c126c87f488d4f93fd6`，SKILL 元数据为 3.5.0；已实际阅读方向、素材、中文排印、批评等参考，并查看网页/东亚样张总览。只吸收与本机生产 UI 范围兼容的方法；来源映射、未采用项及 MIT 版权许可见 [huashu-adaptation.md](huashu-adaptation.md)。源码和样张表明其方法与示例，不独自证明设计质量提升。

### 更新步骤

升级本 skill 时：

1. 修改外部规范/协议结论时，先核对相应来源的当前状态、替代项和发布日期；同日仅改本地回归时可沿用明确记录的核对，不声称重新检索；
2. 更新 frontmatter 的 `version` 与 `last-reviewed`；
3. 只把会改变设计或验收决定的内容写入 skill；
4. 行业工具、实验性指标和浏览器能力要标明证据边界；
5. 按 [skill-evaluation.md](skill-evaluation.md) 用固定任务独立前向测试；涉及空间规则时增加教学/空间任务；规格测试不能冒充成品视觉对测；
6. 运行 `skill-creator/scripts/quick_validate.py` 与本 skill 的证据脚本自测。

触发复核的事件包括：WCAG/ARIA 要求变化、Core Web Vitals 指标替换、Playwright/浏览器能力变化、DTCG 或 AI UI 协议版本变化，或固定任务/真实项目反复暴露同一设计失败。不要因为单个项目偏好无限堆规则；项目特例应进入按需 adapter。

## 本地成品案例

v2.3 的既有项目接入方法见 [repository-integration.md](repository-integration.md)。核对的 React 官方资料：[useEffect](https://react.dev/reference/react/useEffect)、[useState](https://react.dev/reference/react/useState)。本地应用案例的实际检查、首轮失败与修复结论应以各次工件为准，不能由规范或方法文本推断通过。

2026-11-24：使用三类固定材料独立生成六页，对照 v2.0.0 与 v2.1.0；同一继承模型/设置和代码预算，精确 token 及耗时遥测未获取。两名独立 Agent 仅盲评固定视口截图，行为由本地浏览器另验；首轮与后续修复分别保存。样本一次/任务/版本，不外推稳定或人类偏好结论。素材、案例与复跑入口见 [visual-case-library.md](visual-case-library.md) 和 [rendered-evaluation.md](rendered-evaluation.md)。

同日后续：在新目录诊断并修复手机局部表格、流式 DOM 身份、勾选范围、失效审阅与未知结果重发。共享 Mock 未修改。320/390/1280 内容检查及实际键入/状态断言通过，新增可复跑的批量交接函数；合成 composition 事件仅证明处理器边界，未证明原生 IME。此为定向修复与回归，不计入原 A/B，也不证明技能版本稳定优势。
