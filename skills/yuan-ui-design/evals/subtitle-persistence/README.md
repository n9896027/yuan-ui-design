# 字幕旧数据保护回归练习

在浏览器中打开 [字幕编辑器](reference/index.html)。它把字幕保存在本机，回执顺序可控。[保留缺陷的版本](regression-broken.html)能复现两个问题：打开已有字幕后直接保存会清空原文，保存后继续输入会被迟到的回执覆盖。

在仓库根目录安装测试依赖并启动无头浏览器。

```sh
npm ci
npx --no-install playwright install chromium
npm run test:editor
```

机器上已经安装 Chrome 时，也可以执行 `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:editor`。

测试先输出 `WITNESS`，确认原始页面会清空数据、回滚草稿。随后用独立的浏览器上下文检查参考实现是否能保住历史值、空字幕和未知字段，切换字幕再回来是否保留草稿，乱序回执后刷新是否读到最后保存的内容。它还会核对未编辑保存、键盘提交和存储损坏时的界面。所有断言通过后输出 `PASS`，随后关闭测试浏览器。
