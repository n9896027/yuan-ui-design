# 网址改稿基线

在仓库根目录运行 `npm run test:url-baseline`。测试在本机提供受控页面，原页经 HTTP 打开，副本在断网的浏览器上下文里重放。检查除了可见文本，还包括实际使用的自托管字体、图片载入状态、失去动态画面时的像素差异、只在运行时注册的字体是否被点名，以及缺图是否进入清单。静态夹具使用本仓库为测试绘制的单字形字体。[测试入口](check.cjs) · [捕获工具与使用说明](../../skills/yuan-ui-design/references/unslop.md)

另实测了 CERN 保留的万维网项目页。在 Chrome 158 的 390 × 844 视口，初版为原始 HTML 添加了现代文档声明，导致约 26.03% 的像素改变。保留原始文档类型后，原网页和离线可编辑副本逐像素一致。这个结果适用于所测视口、浏览器和当时的页面。[实测清单](cern-mobile.json) · [原页面](https://info.cern.ch/hypertext/WWW/TheProject.html)
