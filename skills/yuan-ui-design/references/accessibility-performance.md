# Accessibility and Performance Boundaries

本文用于 Web 与 WebView 内容。原生控件、系统界面和设备验收见 [platform-surfaces.md](platform-surfaces.md)。在实现 Web UI，或正式声称无障碍、响应式、zoom/reflow、屏读、Reduced Motion、forced colors、Core Web Vitals 或性能结果时读取本文件。

## WCAG 2.2 基线

优先使用原生 HTML 语义。自定义复合控件只有在原生元素无法表达时使用 ARIA，并遵循对应的 WAI-ARIA Authoring Practices 键盘模型。ARIA 不能修复错误的交互语义。

至少检查：

- 页面标题、语言、landmarks、heading 顺序和跳转路径；
- 控件的 accessible name、role、value、description 和错误关联；
- 完整键盘主链、可见 focus、无键盘陷阱，关闭 overlay 后焦点回到合理位置；
- sticky header、footer、cookie banner、drawer 或 toast 不完全遮住当前焦点；
- 拖拽功能有单指非拖拽替代，除非拖拽本质上不可替代；
- pointer target 至少 24×24 CSS px，或符合 WCAG 2.2 的间距/等价控件等例外；产品可选择更宽松的触控目标；
- 状态和图表不只靠颜色表达；文本与关键非文本元素具备足够对比；
- 重要异步结果被合适地宣布，但不把每次动画或数值变化塞入 live region；
- 图片、Canvas、SVG、3D 场景有与任务匹配的文本或结构化替代；装饰性内容不进入可访问名称。

权威入口：

- WCAG 2.2：https://www.w3.org/TR/WCAG22/
- WCAG 2.2 新增项：https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- ARIA APG：https://www.w3.org/WAI/ARIA/apg/

## 真实 zoom、reflow 与用户偏好

- 真实 200% zoom 要用浏览器自身缩放操作；改变 viewport、CSS `zoom` 或截图放大只能作为代理，不能冒充实测。
- 检查缩放后文本、控件、overlay、sticky 元素和主任务是否仍可见、可操作。
- 检查窄到 320 CSS px 时的 reflow；确需二维布局的内容可以使用有理由的局部滚动，而不是让整页横向漂移。
- 在 `prefers-reduced-motion: reduce` 下移除非必要位移、视差和持续动画，并保留状态反馈。
- 在 `forced-colors: active` 下检查 focus、选中、边框、图标和图表；阴影、渐变或背景图不能是唯一边界。

自动化只能覆盖一部分。只有使用实际屏读软件完成真实任务后，才能声称对应屏读组合已通过；Axe 或 DOM 语义检查不能替代。

## 性能

性能预算按产品与设备制定，不为了过门虚构统一包体阈值。至少关注：

- 加载：关键内容、字体、图片、3D 资源和 render-blocking 依赖；
- 交互：主线程长任务、输入反馈、重渲染和事件处理；
- 稳定：图片尺寸、字体切换、异步内容和动画造成的 layout shift；
- 运行：持续动画、Canvas/WebGL 帧率、内存、GPU/电量和后台标签行为；
- 网络：慢网、失败、缓存、离线或旧资源混配时的可恢复性。

当前 Core Web Vitals 关注：

- LCP：良好阈值不高于 2.5 秒；
- INP：良好阈值不高于 200 毫秒；
- CLS：良好阈值不高于 0.1；
- 正式字段结论看移动/桌面分段后的真实用户第 75 百分位。

权威入口：https://web.dev/articles/vitals

## 证据边界

- Lighthouse 无用户输入，不能直接测量 INP；TBT 只能作为实验室代理。
- 本地高性能电脑的结果不能证明中端手机或受限网络体验。
- 实验室模拟不能冒充真实用户字段数据。
- 没有运行测量时写“未测”，不要用代码结构推断分数。
- 性能优化不能破坏语义、内容、焦点或任务反馈；如果取舍存在，记录它。
