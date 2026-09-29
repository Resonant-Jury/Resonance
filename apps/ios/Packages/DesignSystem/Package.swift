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
        .package(name: "ResonanceKit", path: "../ResonanceKit"),
        // Remote images: decoding off the main thread, memory + disk caches, prefetching.
        .package(url: "https://github.com/kean/Nuke", from: "13.2.0"),
    ],
    targets: [
        .target(
            name: "DesignSystem",
            dependencies: [
                .product(name: "ResonanceGeometry", package: "ResonanceGeometry"),
                .product(name: "StoryFormat", package: "ResonanceKit"),
                .product(name: "Nuke", package: "Nuke"),
                .product(name: "NukeUI", package: "Nuke"),
            ],
            resources: [.process("Resources")],
            swiftSettings: [.defaultIsolation(MainActor.self)]
        ),
    ]
)
