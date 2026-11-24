# 银幕之前 · 早期电影选映

[打开节目页](output/programme.html) · [打印版 PDF](output/programme.pdf) · [可编辑演示稿](output/programme.pptx) · [看片单短片](output/social.mp4)

这是一份虚构放映活动的节目单。三张剧照来自有作者、文件页及授权记录的历史照片。影片信息、场次和引导文共享[同一份源文件](programme.json)。可以单独打开[社交封面](output/social-cover.png)及[园丁](output/social-garden.png)、[月球](output/social-moon.png)、[火车](output/social-train.png)三张内页。微信版本见[工程与运行说明](wechat/README.md)。

[月球剧照裁切前后](moon-comparison.jpg)展示同一张竖版内页，左侧是旧稿，右侧是按原片画幅重新导出的成品。

## 修改一个场次

按[出稿工具的环境说明](../../skills/yuan-ui-design/references/media-delivery.md)安装依赖，在仓库根目录修改 `examples/silent-programme/programme.json` 的场次。用独立的输出目录保存改稿，便于与原稿并排审阅。

```sh
python3 skills/yuan-ui-design/scripts/render-silent-programme.py \
  --data examples/silent-programme/programme.json \
  --timeline examples/silent-programme/output/timeline.json \
  --out revised-programme
python3 examples/silent-programme/wechat/scripts/sync_programme.py
```

打开新的 HTML、PDF 和 PPTX 核对该片的开场时间。演示稿中的标题、时间、说明和照片可单独移动或编辑。竖图与短片用于最终展示，各张图另有 HTML 源稿；改动[分镜顺序与时长](output/timeline.json)可重新出片。影片原片与音轨均未包含在宣传短片中。
