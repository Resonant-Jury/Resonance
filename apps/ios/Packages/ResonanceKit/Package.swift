// swift-tools-version: 6.2
import PackageDescription

// The app's non-UI core: the generated /api/v1 client (ResonanceAPI), the
// pieces around it (auth middleware, error mapping), and localization.
// Builds for macOS too, so `swift test` runs without a simulator.
let package = Package(
    name: "ResonanceKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "ResonanceKit", targets: ["ResonanceKit"]),
        .library(name: "ResonanceAPI", targets: ["ResonanceAPI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.1"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.1"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.1"),
    ],
    targets: [
        .target(
            name: "ResonanceAPI",
            dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .target(
            name: "ResonanceKit",
            dependencies: [
                "ResonanceAPI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ]
        ),
        .testTarget(name: "ResonanceKitTests", dependencies: ["ResonanceKit"]),
    ]
)
