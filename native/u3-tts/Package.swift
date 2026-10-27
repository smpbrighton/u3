// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "u3-tts",
    platforms: [.macOS("15.0")],
    products: [.executable(name: "u3-tts", targets: ["U3TTS"])],
    dependencies: [
        .package(
            url: "https://github.com/AtomGradient/swift-qwen3-tts.git",
            revision: "27a5b5b2c5d55258bead2c6e851208987e1ca225"
        ),
        .package(url: "https://github.com/ml-explore/mlx-swift.git", exact: "0.29.1"),
    ],
    targets: [
        .executableTarget(
            name: "U3TTS",
            dependencies: [
                .product(name: "Qwen3TTS", package: "swift-qwen3-tts"),
                .product(name: "MLX", package: "mlx-swift"),
            ]
        ),
    ]
)
