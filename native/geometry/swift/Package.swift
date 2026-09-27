// swift-tools-version: 6.0
import PackageDescription

// Swift port of src/lib/design (the procedural "hand-drawn" geometry).
// Verified against native/fixtures/geometry.json — see Tests/.
let package = Package(
    name: "ResonanceGeometry",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ResonanceGeometry", targets: ["ResonanceGeometry"]),
    ],
    targets: [
        .target(name: "ResonanceGeometry"),
        .testTarget(name: "ResonanceGeometryTests", dependencies: ["ResonanceGeometry"]),
    ]
)
