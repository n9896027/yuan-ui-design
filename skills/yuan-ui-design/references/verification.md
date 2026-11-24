# UI Verification and Evidence

在做浏览器验收、截图、Axe、状态矩阵、回归测试、发布证据或正式质量声明时读取本文件。

## 先定义声明

把“页面不错”改写为可证声明，例如：

- 在本地真实应用链中，键盘用户可以创建草稿、触发验证失败、修正并提交；
- 在 390×844 CSS px 视口中，主任务无整页横向滚动；
- Reduced Motion 下核心状态反馈仍存在且无持续位移动画；
- 生产构建在某个真实时间窗内测得对应字段数据。

每条声明写清证据级别：`static | mock | local-runtime | staging | production`。

## 状态与输入矩阵

根据产品实际范围选择，不机械制造无关状态：

| 维度 | 至少考虑 |
|---|---|
| 生命周期 | initial、loading、ready、empty、success、error/recovery |
| 权限/数据 | locked、disabled、stale、partial、offline（适用时） |
| 历史 | persisted、refresh、replay/undo（适用时） |
| 输入 | pointer、keyboard、touch、drag alternative |
| 环境 | desktop、mobile、Reduced Motion、forced colors、no-WebGL |

含状态/异步行为的改动，主链和一个适用的高风险失败链必须真实操作；纯内容/样式只验证受影响能力，不虚构失败路径。不要只验证页面能打开。

### AI / agent 界面的附加覆盖

仅对实际存在的能力选择检查，不给普通表单增加 agent 状态：

| 能力 | 需要验证的后果 |
|---|---|
| 流式生成 | 逐键输入跨后续更新，确认文本、焦点和插入点保留；更新通知不逐 token 打断用户 |
| 外部执行 | 提议、授权与执行结果可辨；动作对象/内容改变时按授权范围重新判断 |
| 停止/取消 | 区分请求停止、确认停止和仍在执行；已成功副作用保留，不能显示“已撤销” |
| 部分完成/结果未知 | 已完成项目、未执行项目和待查项目分别可见；重连先查状态，不盲目重发 |
| 中断/恢复 | 返回页面后恢复到同一任务及有效版本；过期审批不能作用于新内容 |
| 动态生成 UI | 非法组件/props/动作被拒绝或降级；键盘顺序、用户输入与组件身份可预测 |
| 批量执行 | 勾选范围跨更新不变；审阅后修改使旧确认失效；未知结果查询不新增副作用 |

Mock 事件可以证明上述 UI 契约在替身上的行为，不能证明模型质量、真实工具调用、权限执行或服务端幂等。模型输出质量另测来源缺失/陈旧、冲突、不确定、拒答和工具失败等与产品相关的样本；不能用一次回答好看判为通过。

## 宿主与证据

先确认任务跑在浏览器、安装后的应用、原生模拟器还是真机。按 [platform-surfaces.md](platform-surfaces.md) 核对涉及的返回、系统权限、窗口或前后台恢复。使用对应宿主的状态、平台 UI 树、请求或读回结果证明后果，DOM 与浏览器工具用于网页部分。

## 浏览器证据

记录：

- 路由、commit/build/bundle 身份和运行环境；
- 浏览器、OS、viewport、zoom、颜色/动效偏好和输入方式；
- 前置状态、精确操作、等待条件、断言和结果；
- console errors、page errors、失败请求、横向溢出和关键截断；
- screenshot、trace、video、DOM/state/API 断言的位置；
- 失败、重试、豁免和未测试项目。

固定睡眠不是可靠等待条件。等待具体响应、状态、DOM、路由或可观测事件；非预期状态立即失败。

### 会话归属与清理

- 创建前检查本任务是否已有会话，复用一个具名会话做路由和视口检查；只有并发隔离需要时才增加会话，并明确唯一控制者。
- 默认 headless；截图和视觉检查不要求 headed。用户要观看/操作或问题依赖可见环境时再使用可见浏览器。
- Playwright CLI 使用显式任务会话名，结束执行 `playwright-cli -s=<session> close` 并验证该会话已关闭；命令退出不代表浏览器关闭。
- 独立脚本用 `try/finally` 关闭自己创建的 context/browser；中断后恢复时补清理。协作者各自清理所拥有会话再报告。
- 最终回复前关闭本任务创建的浏览器会话和临时标签，除非用户要求保留。保留用户原有窗口、标签、登录配置和其他任务会话，不用 `pkill`、kill-all 或 close-all 清场。
- 归属或未保存内容不明时保留并报告具体会话，不因年代或 daemon 的父 PID 判断为可关闭。

## 视觉检查

- 面向桌面与移动的布局改动至少检查这两类代表视口；其他任务按受影响页面、目标设备或嵌入式尺寸选择，不强迫纯规格运行浏览器。
- 检查实际存在且受影响的关键状态，如 focus、loading、empty、error、success；无状态变化的纯内容不制造这些状态。
- 截图差异用于定位排版、溢出、遮挡和视觉回归；它不能证明点击、保存、网络或持久化。
- 浏览器视口缩小不能冒充真实 200% zoom；正式声明必须实际操作浏览器 zoom。

## 无障碍检查

- 用键盘完成主链并记录焦点顺序、可见性、overlay 进出和错误恢复。
- Axe 等扫描器用于发现自动可检问题；高严重度问题应修复或记录有事实依据的豁免。
- forced colors、Reduced Motion、拖拽替代和触控目标分别检查。
- 正式屏读声明需要真实屏读软件、相应浏览器或原生应用和任务记录；自动化不替代。

## 性能检查

- 记录工具、设备、网络、冷热缓存、采样次数和构建身份。
- 实验室结果明确为 lab；真实用户第 75 百分位结果才标 field。
- Lighthouse 的 TBT 不标成 INP。
- WebGL/Canvas 额外记录资源体积、加载失败、长任务、内存/帧率迹象和降级结果。

## 可机读记录

可使用如下结构，并用 `scripts/validate-ui-evidence.mjs` 检查声明边界：

沿用证据 `schemaVersion: "2.0"`，兼容已有报告。AI 行为检查使用已有 `interaction` / `recovery` 类别；例如在 interaction 的 `requiredCapabilities` 声明 `cancel-confirmation`、`preserve-user-edits` 或 `resume-same-run`，由相同类别的真实通过项覆盖。交互项仍须提供状态迁移与 DOM/state/network 等断言；写一个能力名称不代表已证明该行为。

```json
{
  "schemaVersion": "2.0",
  "requiredCategories": ["interaction", "responsive", "accessibility"],
  "requiredCapabilities": {
    "interaction": ["state-transition"],
    "responsive": ["reflow"],
    "accessibility": ["keyboard"]
  },
  "target": {
    "name": "lesson-l02",
    "url": "http://127.0.0.1:3000/zh/level/l02",
    "build": "git:abc123",
    "evidenceLevel": "local-runtime"
  },
  "environment": {
    "runtime": "Chromium 140 / macOS",
    "viewport": "390x844 CSS px",
    "input": "keyboard"
  },
  "checks": [
    {
      "id": "critical-build-flow",
      "category": "interaction",
      "status": "passed",
      "claim": "Placing a card changes the checked lesson state",
      "method": "Playwright keyboard flow plus DOM and response assertion",
      "evidence": ["test-results/l02/trace.zip"],
      "capabilities": ["state-transition"],
      "inputModes": ["keyboard", "pointer"],
      "assertions": [
        {
          "type": "client-state",
          "description": "checkable changed from false to true",
          "evidence": "test-results/l02/state-assertion.json"
        }
      ],
      "transition": {
        "from": "draft/incomplete",
        "action": "place context card",
        "to": "draft/checkable",
        "observable": "capacity warning clears and Check becomes enabled"
      }
    },
    {
      "id": "keyboard-focus",
      "category": "accessibility",
      "status": "passed",
      "claim": "Keyboard focus stays visible through the primary flow",
      "method": "Keyboard browser pass with focus assertions",
      "evidence": ["test-results/l02/keyboard-trace.zip"],
      "capabilities": ["keyboard"]
    },
    {
      "id": "mobile-reflow",
      "category": "responsive",
      "status": "passed",
      "claim": "The main task does not create page-level horizontal overflow",
      "method": "390x844 browser assertion",
      "evidence": ["test-results/l02/mobile.png"],
      "capabilities": ["reflow"]
    }
  ],
  "limitations": ["Real screen reader not run"]
}
```

运行：

```bash
node scripts/validate-ui-evidence.mjs --strict --check-local-evidence path/to/evidence.json
```

`requiredCapabilities` 是项目级的“类别 → 必需能力”清单。严格模式只接受同一类别、`status: "passed"` 的检查所声明的 `capabilities`；例如 interaction 的通过项不能满足 accessibility 的 keyboard 要求。这里是声明性覆盖：脚本不会验证自报能力与 trace 内容的对应关系，验收者须复核每项实际检查，不能只写能力标签或把标签覆盖当行为通过。

报告存在 `status: "failed"` 且附有 `notes`、证据时，默认输出会明确显示“记录结构有效”及失败检查的 ID 和 claim，便于保留已知问题。`--strict` 仍以非零退出和“strict acceptance is not passed”拒绝这类记录作为完成或发布门槛；结构有效不等于验收通过。

严格模式默认拒绝远程 `http(s)` evidence 和 assertion URI。只有远程证据确为必要例外时，才显式运行：

```bash
node scripts/validate-ui-evidence.mjs --strict --check-local-evidence --allow-remote-evidence path/to/evidence.json
```

并在报告中精确登记每个 URI：

```json
"remoteEvidence": [
  {
    "uri": "https://review.example/immutable-trace.zip",
    "reason": "The protected review system is the system of record for this trace.",
    "reviewMethod": "Open the immutable trace with the assigned reviewer account."
  }
]
```

每个远程 evidence 或 assertion URI 必须和 `remoteEvidence` 中恰好一条记录完全相同；重复 URI、未登记 URI 和没有对应证据的记录都会失败。`limitations` 只能补充剩余边界，不能代替 `remoteEvidence`。脚本不抓取远程内容，`reviewMethod` 必须足以让验收者独立复核。

脚本会拒绝：通过项没有方法/证据、交互项没有 DOM/state/network/persistence/replay 断言元数据、静态证据声称运行能力、必需类别或声明能力缺失，或实验室测量冒充 field。`--check-local-evidence` 只检查本地路径可访问，正式记录校验应启用它。它不限制路径根目录、不校验 hash/媒体内容、不收集证据，也不证明断言发生。不得用无关现有文件充当工件；验收者应独立核对工件、生成命令、构建身份和断言结果，必要时复跑。结构校验通过不能单独作为任务验收通过。

## 工件内容一致性（可选）

多轮构建、截图或独立评审需要绑定同一批文件时，可创建并复核 SHA-256 清单：

```bash
node scripts/ui-artifacts.mjs create /abs/run /abs/run/artifacts.json runs output/results output/playwright
node scripts/ui-artifacts.mjs check /abs/run /abs/run/artifacts.json
```

创建命令只登记显式给出的相对路径；不把符号链接本身作为工件，解析后路径不得越出根目录。清单不能包含自身。检查命令检测已登记文件的缺失或内容变化，不发现未登记的新文件，不证明文件内容真实、任务已通过、清单可信或发布已获批准。独立复核者仍需检查断言与构建来源；它是原有证据结构校验的补充。

## 结束条件

只有当请求范围内的主任务、适用的失败恢复、必要输入和证据要求都通过，才能说“完成”。无法运行的项目列为未验证；失败项不能藏在总分里，也不能靠提高主观视觉分抵消。
