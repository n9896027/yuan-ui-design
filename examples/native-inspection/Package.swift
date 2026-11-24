// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "NativeInspection",
  platforms: [.macOS(.v13), .iOS(.v16)],
  products: [
    .library(name: "InspectionCore", targets: ["InspectionCore"]),
    .executable(name: "NativeInspection", targets: ["NativeInspection"])
  ],
  targets: [
    .target(name: "InspectionCore"),
    .executableTarget(name: "NativeInspection", dependencies: ["InspectionCore"]),
    .testTarget(name: "InspectionCoreTests", dependencies: ["InspectionCore"])
  ]
)
