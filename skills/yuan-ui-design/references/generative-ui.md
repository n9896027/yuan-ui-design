# Generative UI Boundaries

在运行时模型要选择、配置、更新或组合任务界面时读取本文件。目标是让上下文适合的任务 UI 出现，同时保持品牌、数据、权限与交互稳定；不是让模型接管 DOM 或设计系统。开发期间由编码 agent 编写普通前端，不因此被强制引入 registry 或生成式 UI 协议。

## 受限组合，不是任意执行

- 建立由应用拥有的 component registry：每个组件有稳定身份、语义用途、允许的 props、状态、可访问名称和数据需求。
- 模型只能从注册表中选择并组合组件。模型输出经过结构、类型、语义和权限校验后才可渲染；不得将模型文本直接作为可执行 HTML、脚本或样式。模型提供的链接按应用的 URL 策略校验，action 由受信任映射解析，不能直接执行模型字符串。
- 服务端或受信任应用层绑定敏感数据、子组件和真实 action。数据读取、写入和权限在服务端再次验证，不能因 UI 已渲染就获得执行权。
- 动态表单、批准或编辑界面使用受信任 schema；明确默认值、必填条件、约束、提交目标和失败处理。

## 保持用户控制与界面稳定

- 组件 identity、用户输入、焦点、已展开区域和滚动位置在增量更新中保持稳定。不能稳定合并时，显示可审查的替换或差异。
- 已渲染的提议与已经提交的结果必须区分。生成的新控件不能绕过现有批准、确认、版本或权限边界。
- 生成失败、schema 不通过、宿主不支持或模型超时时，回退到可读文本、既有表单或人工路径，并保留用户已有输入。
- 不以“个性化”为由捏造数据、权限、完成结果或数据来源。用可见的来源、时间和不确定性说明限制。

## 协议与宿主的选择

三层可以组合，也可以完全不用：

| 层 | 适合解决的问题 |
|---|---|
| A2UI | agent 描述受限的原生组件树；宿主用自身设计系统渲染。 |
| AG-UI | 前端与 agent runtime 之间的运行、状态、进度、interrupt/resume 事件。 |
| MCP Apps | 在支持的聊天宿主中以隔离交互视图提供表单、图表、工作流或媒体。 |

这些都是可选协议，不是普通产品 UI 的前提。检测版本、宿主能力、组件目录与权限后再启用；不支持时提供文本或现有页面的等价路径。不得声称所有宿主、所有版本或所有 SDK 已支持同一能力。

MCP Apps 的开发者自编写 HTML/组件可在其隔离宿主中运行；本文件对“模型生成 UI”限制的是不可信的模型输出，不能借此限制开发者受审查的应用代码。嵌入式视图应按宿主授予的能力通信，不能假定可读取父页面、cookie、本地存储或直接调用任何工具。

## 验证

对实际启用的生成式 UI，验证：

1. 非法组件、props、schema、权限或 action 被拒绝且有安全回退；
2. 增量更新不会丢失用户输入或移动焦点；
3. 高影响动作仍走真实授权与服务端验证；
4. 降级宿主仍能理解结果并完成核心任务；
5. UI 声明、数据来源和真实 action 在 trace 或状态断言中一致。

## 权威起点

- [A2UI 1.0 announcement and design model](https://developers.googleblog.com/a2ui-10-build-delightful-fast-reliable-agentic-experiences/)
- [MCP Apps overview and security model](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/apps/overview.mdx)
- [AG-UI 1.0 specification](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/index.mdx)
