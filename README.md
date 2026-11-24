# Yuan-UI-design

Yuan-UI-design 2.4.0 是一个用于设计、实现和审阅产品界面的 Codex skill。它根据实际运行平台和用户任务选择设计规则，覆盖 Web App、原生 App、AI 工作台和可交互的产品 3D。

例如，可以让它设计巡检工单在 Android 拍照后如何回到草稿，也可以让它审阅设备配置器在模型加载失败时能否继续选择和保存部件。

## 使用

技能目录是 [skills/yuan-ui-design](skills/yuan-ui-design/SKILL.md)。在本地克隆本仓库后，从仓库根目录执行以下命令即可安装到个人 Codex 技能目录。已有同名安装时，命令会保留现有目录。

```sh
skills_dir="${CODEX_HOME:-$HOME/.codex}/skills"
mkdir -p "$skills_dir"
if [ ! -e "$skills_dir/yuan-ui-design" ]; then
  cp -R skills/yuan-ui-design "$skills_dir/yuan-ui-design"
fi
```

在 Codex 中可这样调用：

> $yuan-ui-design 审阅这个设备配置器。检查更换外壳后接口是否仍然兼容，以及重新打开后草稿能否恢复。

## 参考与验证

- [网页、PWA、原生移动与桌面 App](skills/yuan-ui-design/references/platform-surfaces.md)
- [产品 3D、空间导航与 XR](skills/yuan-ui-design/references/spatial-product-ui.md)
- [AI 工作台与用户接管](skills/yuan-ui-design/references/agentic-ui.md)
- [平台与 3D 规格评测题](skills/yuan-ui-design/evals/platform-spatial.json)
- [设计方法来源与上游许可](skills/yuan-ui-design/references/huashu-adaptation.md)

使用支持 ES modules 的现代 Node.js，从仓库根目录运行两个自测：

```sh
node skills/yuan-ui-design/scripts/validate-ui-evidence.mjs --self-test
node skills/yuan-ui-design/scripts/ui-artifacts.mjs --self-test
```

正式验收时可分别核对记录结构、失败项和严格检查结果。详见[证据记录说明](skills/yuan-ui-design/references/verification.md)。
