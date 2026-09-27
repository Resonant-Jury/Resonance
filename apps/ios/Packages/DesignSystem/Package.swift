// swift-tools-version: 6.2
import PackageDescription

// The hand-drawn design language for iOS: generated tokens, the web's type
// stack with CSS line boxes, the procedural geometry (ResonanceGeometry, the
// Swift port of src/lib/design), grain, and the organic components.
let package = Package(
    name: "DesignSystem",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
    ],
    dependencies: [
        .package(name: "ResonanceGeometry", path: "../../../../native/geometry/swift"),
    ],
    targets: [
        .target(
            name: "DesignSystem",
            dependencies: [.product(name: "ResonanceGeometry", package: "ResonanceGeometry")],
            resources: [.process("Resources")],
            swiftSettings: [.defaultIsolation(MainActor.self)]
        ),
        .testTarget(name: "DesignSystemTests", dependencies: ["DesignSystem"]),
    ]
)
