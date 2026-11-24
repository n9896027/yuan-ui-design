# 交付平台与系统边界

当宿主影响导航、输入、系统能力或验收时读取。从简报、路由和工程入口判断用户从哪里进入。只写“App”且宿主会改变交付方案时，说明共同流程和仍需确定的平台决定。

## 用同一任务判断平台差异

内容网站让人从链接直达并读完一条内容。工具型 Web App 还需要在列表、编辑上下文和未完成工作之间往返。按任务选择下表中会改变设计的差异。

| 交付面 | 优先决定 | 适用时验证 |
|---|---|---|
| 网页与工具型 Web | 链接入口、浏览器前进后退、刷新恢复、上传和网络反馈 | 主任务在代表视口完成，刷新或返回后的草稿和结果，浏览器支持范围 |
| PWA | 安装后的启动入口与导航；承诺离线工作时再设计缓存、更新和同步 | 从独立窗口启动；按产品承诺检验重连、更新与草稿恢复 |
| WebView 或混合容器 | Web 与宿主谁负责导航、文件、认证、分享和返回 | 宿主返回、深链、键盘与安全区，宿主能力不可用或回调失败时的页面状态 |
| 原生 iOS / Android | 沿用 iOS 导航层级与返回手势或 Android 系统 Back 栈；适配文字缩放、安全区与软键盘 | 在目标应用验证返回及前后台切换；用到权限时验证允许与拒绝分支 |
| 桌面 App | 窗口、文件系统、拖入、菜单命令与快捷键 | 窗口关闭或恢复，文件访问拒绝，拖入与系统选择器，关键快捷键和不同窗口尺寸 |

## 设计约束

- 将本地草稿、附件上传和最终提交按实际确认点呈现。超时后只有在服务支持查询时才显示查询结果；缺少确认渠道时保留草稿，标出待核对的操作。
- 先确认谁执行系统操作以及它实际需要的权限。例如 Android 委托系统相机拍照可采用系统 Intent；自建取景器另核对相机权限。系统选择器仅授权所选内容时，区分取消、临时访问到期和确实被拒。见 [Android 权限最小化指南](https://developer.android.com/privacy-and-security/minimize-permission-requests)。
- 系统返回、浏览器返回、关闭窗口和切到后台都可能中断任务。先定义草稿、执行中操作和未确认结果如何恢复，再安排界面。
- 复用平台熟悉的导航、选择器、分享与键盘模式。自定义手势、沉浸全屏或隐藏系统 chrome 必须服务任务并保留可发现的退出路径。
- 只将实际跑过的宿主、OS、输入、网络和系统能力写进验收结论。浏览器模拟不等于真机权限、后台恢复或桌面文件系统验证。

## 证据记录

记录相关宿主、版本、输入与前置条件。宣称草稿可恢复时，按产品承诺区分切后台、关闭再开与进程回收。原生无障碍取证用目标平台的语义树与实际输入；声称屏读通过时，记录相应系统上 VoiceOver 或 TalkBack 的任务结果。

权威入口：[Android navigation principles](https://developer.android.com/guide/navigation/principles)、[Apple navigation and search](https://developer.apple.com/design/human-interface-guidelines/navigation-and-search)、[MDN PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)。
