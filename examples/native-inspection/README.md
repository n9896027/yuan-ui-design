# 岸线巡检 · 原生 App

在 Xcode 中打开 `NativeInspection.xcodeproj`，选择 iPhone 设备或模拟器。记录现场观察、拍照、保存本机草稿，再重新打开核对记录及照片。取消拍照或存储失败时保留已有草稿。「模拟上传超时」演示一次失败反馈，示例只向本机 Application Support 目录写入数据。

在本目录运行 `swift test` 可验证取消、相机不可用、提交失败、确认后的清理，以及草稿 JSON 和照片字节重新读回。macOS 支持 `swift run NativeInspection` 查看不含相机的界面。

安装了完整 Xcode 和 iOS SDK 时，下面的命令会创建模拟器架构的 App 包。它可以在没有已下载模拟器 runtime 的环境中编译。

```sh
xcodebuild -project NativeInspection.xcodeproj -scheme NativeInspection \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

本次在 iOS Simulator SDK 27.2 编译并检查了 App 包和相机用途字段。模型测试运行于 macOS。真机相机、系统权限弹窗、前后台切换后的界面恢复仍需在对应设备操作。
