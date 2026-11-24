# Rendered UI Evaluation

仅在比较技能版本、验证实现能力或维护成品案例时读取。普通产品改动不运行整套评测。

## 输入与隔离

- 固定需求：[brief.json](../evals/rendered/brief.json)。三项为研究网站、既有后台局部修复、AI 排班工作台。
- 共同材料：[data.js](../evals/rendered/assets/data.js)、[mock.js](../evals/rendered/assets/mock.js)、原创 [shoreline.svg](../evals/rendered/assets/shoreline.svg)。均为示例；Mock 不调用真实模型或外部 API。
- 后台原始页：[operations-starter.html](../evals/rendered/operations-starter.html)，故意保留手机长标题和失败丢稿缺陷。
- 浏览器函数：[verify-case.js](../evals/rendered/verify-case.js)、[verify-stream-typing.js](../evals/rendered/verify-stream-typing.js)；批量发送的后续回归使用 [verify-agent-handoff.js](../evals/rendered/verify-agent-handoff.js)。它们是本套 Mock/data-eval 契约的 Playwright CLI `run-code` 函数，不是产品代码或任意站点的通用扫描器。

复制到隔离目录，按 `/runs/<label>/<scenario>/index.html` 建立两个版本的页面，每页同目录放 `assets`。两个执行者分别收到一个冻结技能副本、同一 brief 和相同输出预算，不互读，不提供评分项或期待的改进。明确给出工作根和输出文件的绝对路径，避免把报告写进当前项目。

任务完成后记录 HTML 大小、输入/技能/实现哈希、实际读取的参考、工具/模型设置及未能控制的差异。实现先冻结，修复放入独立目录。固定 60KB 是本套配对约束，不是所有 UI 的性能预算。

## 浏览器复跑

在隔离目录提供仅绑定 `127.0.0.1` 的本地静态服务，创建 `output/playwright`，复用一个由当前任务拥有的具名 headless 会话。先导航、读取快照，再运行函数：

```bash
playwright-cli -s=ui-eval goto http://127.0.0.1:<port>/runs/<label>/<scenario>/index.html
playwright-cli -s=ui-eval snapshot
playwright-cli -s=ui-eval --raw run-code --filename=verify-case.js
```

`verify-case.js` 只使用原始契约中的 `data-eval`、真实 DOM、localStorage 和 Mock snapshot 断言；逐项报告 passed/failed/blocked。截图写到当前会话工作目录的 `output/playwright`。复制函数到工作目录后运行，保留其原始结果与版本。

流式任务再运行逐键输入函数；其中输入节奏是模拟人的键入，不是用固定睡眠等待断言。键盘快捷键需匹配运行 OS。失败值/焦点检查不能因为其他步骤通过而略去。原生 IME、真实屏读、触控设备和生产 API 不在此脚本的证明范围。

后续回归函数验证选择跨更新保持、审阅内容变化后不可直接发送、标签边界文本按原文显示，以及未知结果先查询且发送计数不增加。这些来自首轮后的诊断，不追溯改写原 A/B 的通过项或偏好。修复代码和回归结果应保存在新目录，保留初次失败；不把手工修复演示称为新一轮独立生成或技能因果评测。

截图应等待实际布局与字体/图像就绪，明确记录视口与首屏/整页范围。检查异常重复、裁切或空白，必要时重新采集；保留有问题的原始捕获，不能用损坏的截图评价设计。布局宽度、关键状态和实际交互都要独立断言。

## 盲评与结论

先收集相同初始状态的桌面和手机视口截图，再按场景随机化 A/B 标签，映射单独保存。评审者只收到原始请求和盲化截图；至少独立查看每张图，并区分直接观察与行为未知。可以另给行为记录做综合评审，但不要让截图替代它。

可见状态不一致本身需要报告；先确认是否为实现缺陷，不能自动解释为合理的流程差异。遮挡或主链失败会限制审美比较，后续修复的诊断结果不得并入首轮胜率。

报告逐场景的 Agent 偏好、实际通过/失败、修复与剩余边界；没有多轮独立生成和实际用户证据，不宣称稳定全面领先。源文件、浏览器函数、断言、截图及评审可用 `scripts/ui-artifacts.mjs` 绑定，内容哈希不等于真实性鉴定。结束后关闭自己创建的浏览器及本地服务，保留用户原会话。
