#!/usr/bin/env swift

import AppKit
import CryptoKit
import Foundation
import ImageIO
import SceneKit

struct FrameContract: Decodable {
    let width: Int
    let height: Int
    let yawDegrees: [Double]
}

struct GeometryDimensions: Decodable, Equatable {
    let worldWidth: Double
    let worldHeight: Double
    let baseY: Double
}

// Keep these category dimensions byte-for-byte aligned with src/world-art.js.
let WORLD_GEOMETRY: [String: GeometryDimensions] = [
    "drone": GeometryDimensions(worldWidth: 380, worldHeight: 360, baseY: 140),
    "turret": GeometryDimensions(worldWidth: 489.6, worldHeight: 1900, baseY: 0),
    "wallLow": GeometryDimensions(worldWidth: 576, worldHeight: 600, baseY: 0),
    "wallHigh": GeometryDimensions(worldWidth: 576, worldHeight: 2000, baseY: 0),
]

struct UpstreamRecord: Decodable {
    let id: String
    let uploadId: Int
    let archiveFilename: String
    let archiveSha256: String
    let downloadDate: String
    let license: String
    let licenseSource: String
    let licenseCommitted: String
    let licenseSha256: String
}

struct ComponentRecipe: Decodable {
    let model: String
    let material: String
    let textures: [String]
    let scale: Double
    let rotationDegrees: [Double]
    let translation: [Double]
}

struct AssetRecipe: Decodable {
    let id: String
    let sourceFamily: String
    let category: String
    let components: [ComponentRecipe]
    let hideNodes: [String]
}

struct WorldManifest: Decodable {
    let version: Int
    let frame: FrameContract
    let geometry: [String: GeometryDimensions]
    let upstream: [UpstreamRecord]
    let sourceHashes: [String: String]
    let assets: [AssetRecipe]
}

struct Arguments {
    let manifest: URL
    let sourceRoot: URL
    let output: URL

    init(_ values: [String]) throws {
        let usage = "Usage: render-world-assets.swift --manifest WORLD_ASSETS.json --source-root EXTRACTED --output OUTPUT"
        guard values.count == 7 else { throw RenderError.usage(usage) }
        var parsed: [String: String] = [:]
        var index = 1
        while index < values.count {
            let flag = values[index]
            guard ["--manifest", "--source-root", "--output"].contains(flag),
                  parsed[flag] == nil else {
                throw RenderError.usage(usage)
            }
            parsed[flag] = values[index + 1]
            index += 2
        }
        guard let manifestPath = parsed["--manifest"],
              let sourceRootPath = parsed["--source-root"],
              let outputPath = parsed["--output"] else {
            throw RenderError.usage(usage)
        }
        manifest = URL(fileURLWithPath: manifestPath).standardizedFileURL
        sourceRoot = URL(fileURLWithPath: sourceRootPath).standardizedFileURL
        output = URL(fileURLWithPath: outputPath).standardizedFileURL
    }
}

enum RenderError: Error, CustomStringConvertible {
    case usage(String)
    case validation(String)
    case load(String)
    case render(String)
    case write(String)

    var description: String {
        switch self {
        case .usage(let value), .validation(let value), .load(let value),
             .render(let value), .write(let value):
            return value
        }
    }
}

private let requiredIDs = [
    "drone-scout",
    "drone-striker",
    "turret-sentry",
    "turret-heavy",
    "barrier-rail",
    "barrier-crate",
    "structure-reactor",
    "structure-tower",
    "gap-edge",
]

private let requiredYaw = [-30.0, -20.0, -10.0, 0.0, 10.0, 20.0, 30.0]
private let radiansPerDegree = Double.pi / 180
private let supersample = 2

func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func sha256Hex(at url: URL) throws -> String {
    do {
        return sha256Hex(try Data(contentsOf: url, options: .mappedIfSafe))
    } catch {
        throw RenderError.load("Missing or unreadable source: \(url.path)")
    }
}

func validateRelativeSourcePath(_ path: String, label: String) throws {
    let unixPath = path.replacingOccurrences(of: "\\", with: "/")
    let lower = unixPath.lowercased()
    if lower.contains("://") || lower.hasPrefix("file:") {
        throw RenderError.validation("\(label): network URLs are forbidden")
    }
    if unixPath.hasPrefix("/") || unixPath.hasPrefix("~")
        || unixPath.range(of: #"^[A-Za-z]:/"#, options: .regularExpression) != nil {
        throw RenderError.validation("\(label): absolute paths are forbidden")
    }
    let parts = unixPath.split(separator: "/", omittingEmptySubsequences: false)
    if parts.isEmpty || parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) {
        throw RenderError.validation("\(label): path traversal is forbidden")
    }
    let forbiddenComponents = Set(["source", "sources", "source edition", "source files"])
    let fileExtension = URL(fileURLWithPath: unixPath).pathExtension.lowercased()
    if parts.contains(where: { forbiddenComponents.contains($0.lowercased()) })
        || ["blend", "fbx", "glb", "gltf", "unitypackage", "uproject"].contains(fileExtension) {
        throw RenderError.validation("\(label): source-edition paths are forbidden")
    }
}

func loadAndValidateManifest(arguments: Arguments) throws -> WorldManifest {
    let data: Data
    do {
        data = try Data(contentsOf: arguments.manifest)
    } catch {
        throw RenderError.load("Could not read manifest at \(arguments.manifest.path)")
    }
    let manifest: WorldManifest
    do {
        manifest = try JSONDecoder().decode(WorldManifest.self, from: data)
    } catch {
        throw RenderError.validation("Could not decode manifest: \(error)")
    }
    guard manifest.version == 1 else {
        throw RenderError.validation("Manifest version must be 1")
    }
    guard manifest.frame.width == 512,
          manifest.frame.height == 512,
          manifest.frame.yawDegrees == requiredYaw else {
        throw RenderError.validation("Atlas frame contract must be seven 512x512 views at -30...30 degrees")
    }
    guard manifest.geometry == WORLD_GEOMETRY else {
        throw RenderError.validation("Manifest geometry does not match WORLD_GEOMETRY")
    }
    guard manifest.assets.map(\.id) == requiredIDs else {
        throw RenderError.validation("Manifest must contain the nine world atlases in runtime order")
    }
    guard Set(manifest.assets.map(\.sourceFamily)).isSubset(of: Set(manifest.upstream.map(\.id))) else {
        throw RenderError.validation("Every asset source family must have an upstream record")
    }
    for upstream in manifest.upstream {
        try validateRelativeSourcePath(upstream.archiveFilename, label: upstream.archiveFilename)
        try validateRelativeSourcePath(upstream.licenseSource, label: upstream.licenseSource)
        try validateRelativeSourcePath(upstream.licenseCommitted, label: upstream.licenseCommitted)
        guard upstream.archiveSha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
              upstream.licenseSha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil else {
            throw RenderError.validation("Upstream archive and license hashes must be lowercase SHA-256")
        }
    }

    var referenced = Set<String>()
    for asset in manifest.assets {
        guard !asset.components.isEmpty else {
            throw RenderError.validation("\(asset.id) must contain at least one component")
        }
        for component in asset.components {
            guard component.rotationDegrees.count == 3,
                  component.translation.count == 3,
                  component.scale.isFinite,
                  component.scale > 0 else {
                throw RenderError.validation("\(asset.id) has an invalid component transform")
            }
            for sourcePath in [component.model, component.material] + component.textures {
                try validateRelativeSourcePath(sourcePath, label: sourcePath)
                referenced.insert(sourcePath)
            }
        }
    }
    guard referenced == Set(manifest.sourceHashes.keys) else {
        throw RenderError.validation("sourceHashes must cover exactly the selected model, material, and texture files")
    }
    for sourcePath in manifest.sourceHashes.keys.sorted() {
        guard let expectedHash = manifest.sourceHashes[sourcePath],
              expectedHash.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil else {
            throw RenderError.validation("\(sourcePath) must have a lowercase SHA-256")
        }
        let sourceURL = arguments.sourceRoot.appendingPathComponent(sourcePath)
        let actualHash = try sha256Hex(at: sourceURL)
        guard actualHash == expectedHash else {
            throw RenderError.validation("Source hash mismatch for \(sourcePath): \(actualHash)")
        }
    }
    return manifest
}

func vector(_ values: [Double]) -> SCNVector3 {
    SCNVector3(CGFloat(values[0]), CGFloat(values[1]), CGFloat(values[2]))
}

func degreesVector(_ values: [Double]) -> SCNVector3 {
    SCNVector3(
        CGFloat(values[0] * radiansPerDegree),
        CGFloat(values[1] * radiansPerDegree),
        CGFloat(values[2] * radiansPerDegree)
    )
}

func usableBounds(of node: SCNNode, label: String) throws -> (SCNVector3, SCNVector3) {
    let (minimum, maximum) = node.boundingBox
    let values = [minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z]
    guard values.allSatisfy(\.isFinite),
          maximum.x > minimum.x,
          maximum.y > minimum.y,
          maximum.z > minimum.z else {
        throw RenderError.load("\(label) has no usable visible bounding box")
    }
    return (minimum, maximum)
}

func normalizedTextureKey(_ path: String) -> String {
    var name = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent.lowercased()
    for suffix in ["_basecolor", "_emissive", "_normal", "_orm", "_dark"] {
        name = name.replacingOccurrences(of: suffix, with: "")
    }
    return name.replacingOccurrences(of: "t_", with: "")
}

func texturePath(matching materialName: String, candidates: [String]) -> String? {
    guard !candidates.isEmpty else { return nil }
    let materialKey = materialName.lowercased().replacingOccurrences(of: "t_", with: "")
    return candidates.max { left, right in
        let leftKey = normalizedTextureKey(left)
        let rightKey = normalizedTextureKey(right)
        let leftScore = materialKey.contains(leftKey) ? leftKey.count : 0
        let rightScore = materialKey.contains(rightKey) ? rightKey.count : 0
        return leftScore < rightScore
    }
}

func styledMaterial(
    source: SCNMaterial,
    index: Int,
    texturePaths: [String],
    images: [String: NSImage]
) -> SCNMaterial {
    let result = source.copy() as? SCNMaterial ?? SCNMaterial()
    let baseCandidates = texturePaths.filter {
        let lower = $0.lowercased()
        return lower.contains("basecolor") || lower.contains("_dark.") || lower.hasSuffix("spacebits_texture.png")
    }
    let normalCandidates = texturePaths.filter { $0.lowercased().contains("_normal.") }
    let emissiveCandidates = texturePaths.filter { $0.lowercased().contains("_emissive.") }
    let materialName = source.name ?? "material-\(index)"
    if let basePath = texturePath(matching: materialName, candidates: baseCandidates) {
        result.diffuse.contents = images[basePath]
    }
    if let normalPath = texturePath(matching: materialName, candidates: normalCandidates) {
        result.normal.contents = images[normalPath]
        result.normal.intensity = 0.72
    }
    result.name = "Nebula hostile \(materialName)"
    result.lightingModel = .physicallyBased
    result.isDoubleSided = true
    result.diffuse.magnificationFilter = .linear
    result.diffuse.minificationFilter = .linear
    result.diffuse.mipFilter = .linear
    let isVioletSeam = index % 4 == 2 || materialName.lowercased().contains("trim_02")
    result.multiply.contents = isVioletSeam
        ? NSColor(calibratedRed: 0.48, green: 0.18, blue: 0.80, alpha: 1)
        : NSColor(calibratedRed: 0.19, green: 0.29, blue: 0.55, alpha: 1)
    result.metalness.contents = 0.42
    result.roughness.contents = 0.38
    if texturePath(matching: materialName, candidates: emissiveCandidates) != nil {
        result.emission.contents = NSColor(calibratedRed: 0.92, green: 0.035, blue: 0.12, alpha: 1)
        result.emission.intensity = 0.48
    } else {
        result.emission.contents = NSColor.black
    }
    return result
}

func loadComponent(
    _ recipe: ComponentRecipe,
    asset: AssetRecipe,
    sourceRoot: URL
) throws -> SCNNode {
    let modelURL = sourceRoot.appendingPathComponent(recipe.model)
    let materialURL = sourceRoot.appendingPathComponent(recipe.material)
    do {
        _ = try Data(contentsOf: materialURL, options: .mappedIfSafe)
    } catch {
        throw RenderError.load("Could not load material at \(materialURL.path)")
    }
    var images: [String: NSImage] = [:]
    for texturePath in recipe.textures {
        let textureURL = sourceRoot.appendingPathComponent(texturePath)
        guard let image = NSImage(contentsOf: textureURL) else {
            throw RenderError.load("Could not load texture at \(textureURL.path)")
        }
        images[texturePath] = image
    }
    let options: [SCNSceneSource.LoadingOption: Any] = [
        .checkConsistency: true,
        .convertToYUp: true,
        .preserveOriginalTopology: true,
    ]
    let importedScene: SCNScene
    do {
        importedScene = try SCNScene(url: modelURL, options: options)
    } catch {
        throw RenderError.load("Could not load model at \(modelURL.path): \(error)")
    }
    let imported = SCNNode()
    let children = importedScene.rootNode.childNodes
    guard !children.isEmpty else {
        throw RenderError.load("\(recipe.model) contains no SceneKit nodes")
    }
    for child in children {
        child.removeFromParentNode()
        imported.addChildNode(child)
    }
    imported.enumerateChildNodes { node, _ in
        if let name = node.name, asset.hideNodes.contains(name) {
            node.isHidden = true
        }
        guard let geometry = node.geometry else { return }
        let sourceMaterials = geometry.materials.isEmpty ? [SCNMaterial()] : geometry.materials
        geometry.materials = sourceMaterials.enumerated().map { index, material in
            styledMaterial(source: material, index: index, texturePaths: recipe.textures, images: images)
        }
    }

    let (minimum, maximum) = try usableBounds(of: imported, label: recipe.model)
    let height = maximum.y - minimum.y
    let centerX = (minimum.x + maximum.x) / 2
    let centerZ = (minimum.z + maximum.z) / 2
    imported.position = SCNVector3(-centerX, -minimum.y, -centerZ)
    imported.scale = SCNVector3(1 / height, 1 / height, 1 / height)

    let transformed = SCNNode()
    transformed.addChildNode(imported)
    transformed.scale = SCNVector3(CGFloat(recipe.scale), CGFloat(recipe.scale), CGFloat(recipe.scale))
    transformed.eulerAngles = degreesVector(recipe.rotationDegrees)
    transformed.position = vector(recipe.translation)
    return transformed
}

func flatMaterial(_ color: NSColor, emission: NSColor? = nil) -> SCNMaterial {
    let material = SCNMaterial()
    material.lightingModel = emission == nil ? .physicallyBased : .constant
    material.diffuse.contents = color
    material.emission.contents = emission ?? NSColor.black
    material.isDoubleSided = true
    material.metalness.contents = 0.36
    material.roughness.contents = 0.32
    return material
}

func addHostileDetails(to turntable: SCNNode, category: String) throws {
    let (minimum, maximum) = try usableBounds(of: turntable, label: category)
    let width = maximum.x - minimum.x
    let height = maximum.y - minimum.y
    let depth = maximum.z - minimum.z
    let seamWidth = CGFloat(min(Double(width) * 0.48, 0.34))
    let seamHeight = CGFloat(max(0.008, min(Double(height) * 0.018, 0.016)))
    let seamDepth = CGFloat(max(0.008, min(Double(depth) * 0.018, 0.016)))
    let seam = SCNBox(width: seamWidth, height: seamHeight, length: seamDepth, chamferRadius: seamHeight / 2)
    seam.materials = [flatMaterial(
        NSColor(calibratedRed: 0.70, green: 0.05, blue: 0.90, alpha: 1),
        emission: NSColor(calibratedRed: 0.70, green: 0.025, blue: 0.82, alpha: 1)
    )]
    let seamNode = SCNNode(geometry: seam)
    let relativeHeight: CGFloat
    switch category {
    case "drone": relativeHeight = 0.48
    case "gap": relativeHeight = 0.20
    default: relativeHeight = 0.34
    }
    let seamX = (minimum.x + maximum.x) / 2
    let seamY = minimum.y + height * relativeHeight
    let seamZ = maximum.z + seamDepth / 2
    seamNode.position = SCNVector3(seamX, seamY, seamZ)
    turntable.addChildNode(seamNode)

    let red = flatMaterial(
        NSColor(calibratedRed: 1.0, green: 0.025, blue: 0.055, alpha: 1),
        emission: NSColor(calibratedRed: 1.0, green: 0.012, blue: 0.035, alpha: 1)
    )
    let lightRadius = CGFloat(max(0.012, min(Double(height) * 0.026, 0.025)))
    for side: CGFloat in [-1, 1] {
        let sphere = SCNSphere(radius: lightRadius)
        sphere.segmentCount = 16
        sphere.materials = [red]
        let lightNode = SCNNode(geometry: sphere)
        let lightX = seamX + side * min(width * 0.22, 0.17)
        let lightY = seamNode.position.y
        let lightZ = maximum.z + lightRadius * 0.72
        lightNode.position = SCNVector3(lightX, lightY, lightZ)
        turntable.addChildNode(lightNode)
    }
}

func buildTurntable(asset: AssetRecipe, sourceRoot: URL) throws -> SCNNode {
    let assembly = SCNNode()
    for component in asset.components {
        assembly.addChildNode(try loadComponent(component, asset: asset, sourceRoot: sourceRoot))
    }
    let (minimum, maximum) = try usableBounds(of: assembly, label: asset.id)
    let width = Double(maximum.x - minimum.x)
    let height = Double(maximum.y - minimum.y)
    let depth = Double(maximum.z - minimum.z)
    let fitExtent = max(height, width / 0.90, depth / 0.90)
    guard fitExtent.isFinite, fitExtent > 0 else {
        throw RenderError.load("\(asset.id) has invalid combined bounds")
    }
    let centerX = (minimum.x + maximum.x) / 2
    let centerZ = (minimum.z + maximum.z) / 2
    assembly.position = SCNVector3(-centerX, -minimum.y, -centerZ)
    let scale = CGFloat(1 / fitExtent)
    assembly.scale = SCNVector3(scale, scale, scale)

    let turntable = SCNNode()
    turntable.addChildNode(assembly)
    try addHostileDetails(to: turntable, category: asset.category)
    return turntable
}

func addLighting(to scene: SCNScene) {
    let ambient = SCNLight()
    ambient.type = .ambient
    ambient.color = NSColor(calibratedRed: 0.10, green: 0.13, blue: 0.24, alpha: 1)
    ambient.intensity = 420
    let ambientNode = SCNNode()
    ambientNode.light = ambient
    scene.rootNode.addChildNode(ambientNode)

    let key = SCNLight()
    key.type = .directional
    key.color = NSColor(calibratedRed: 0.60, green: 0.76, blue: 1.0, alpha: 1)
    key.intensity = 1_520
    let keyNode = SCNNode()
    keyNode.light = key
    keyNode.eulerAngles = SCNVector3(-0.72, -0.72, -0.18)
    scene.rootNode.addChildNode(keyNode)

    let rim = SCNLight()
    rim.type = .directional
    rim.color = NSColor(calibratedRed: 0.015, green: 0.90, blue: 1.0, alpha: 1)
    rim.intensity = 1_180
    let rimNode = SCNNode()
    rimNode.light = rim
    rimNode.eulerAngles = SCNVector3(0.30, 2.35, 0)
    scene.rootNode.addChildNode(rimNode)

    let hostileFill = SCNLight()
    hostileFill.type = .directional
    hostileFill.color = NSColor(calibratedRed: 0.74, green: 0.08, blue: 0.88, alpha: 1)
    hostileFill.intensity = 510
    let hostileNode = SCNNode()
    hostileNode.light = hostileFill
    hostileNode.eulerAngles = SCNVector3(-0.15, -2.2, 0.1)
    scene.rootNode.addChildNode(hostileNode)
}

func addCamera(to scene: SCNScene) -> SCNNode {
    let target = SCNNode()
    target.position = SCNVector3(0, 0.42, 0)
    scene.rootNode.addChildNode(target)

    let camera = SCNCamera()
    camera.usesOrthographicProjection = true
    camera.orthographicScale = 1.34
    camera.zNear = 0.1
    camera.zFar = 100
    camera.wantsHDR = false
    camera.exposureOffset = 0
    camera.whitePoint = 1
    let cameraNode = SCNNode()
    cameraNode.camera = camera
    cameraNode.position = SCNVector3(0, 2.65, 5.6)
    let lookAt = SCNLookAtConstraint(target: target)
    lookAt.isGimbalLockEnabled = true
    cameraNode.constraints = [lookAt]
    scene.rootNode.addChildNode(cameraNode)
    return cameraNode
}

func cgImage(from image: NSImage, expectedWidth: Int, expectedHeight: Int) throws -> CGImage {
    var proposed = NSRect(origin: .zero, size: image.size)
    guard let result = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil),
          result.width == expectedWidth,
          result.height == expectedHeight else {
        throw RenderError.render("SceneKit returned a frame with the wrong geometry")
    }
    return result
}

func renderFrames(
    asset: AssetRecipe,
    sourceRoot: URL,
    frame: FrameContract
) throws -> [CGImage] {
    let scene = SCNScene()
    scene.background.contents = NSColor.clear
    scene.lightingEnvironment.intensity = 0
    let turntable = try buildTurntable(asset: asset, sourceRoot: sourceRoot)
    scene.rootNode.addChildNode(turntable)
    addLighting(to: scene)
    let cameraNode = addCamera(to: scene)

    let renderer = SCNRenderer(device: nil, options: nil)
    renderer.scene = scene
    renderer.pointOfView = cameraNode
    renderer.autoenablesDefaultLighting = false
    renderer.isJitteringEnabled = false
    var frames: [CGImage] = []
    let renderWidth = frame.width * supersample
    let renderHeight = frame.height * supersample
    for yaw in frame.yawDegrees {
        turntable.eulerAngles.y = CGFloat(yaw * radiansPerDegree)
        let image = renderer.snapshot(
            atTime: 0,
            with: CGSize(width: renderWidth, height: renderHeight),
            antialiasingMode: .multisampling4X
        )
        frames.append(try cgImage(from: image, expectedWidth: renderWidth, expectedHeight: renderHeight))
    }
    return frames
}

func rasterizedPremultipliedRGBA(_ image: CGImage) throws -> [UInt8] {
    let bytesPerRow = image.width * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * image.height)
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(
        data: &pixels,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo
    ) else {
        throw RenderError.render("Could not rasterize SceneKit frame")
    }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return pixels
}

func canonicalizeIsolatedOpaqueNoise(
    _ pixels: inout [UInt8],
    width: Int,
    height: Int,
    bytesPerRow: Int
) {
    guard width >= 3,
          height >= 3,
          bytesPerRow >= width * 4,
          pixels.count >= bytesPerRow * height else { return }
    let source = pixels
    for y in 1..<(height - 1) {
        for x in 1..<(width - 1) {
            let center = y * bytesPerRow + x * 4
            guard source[center + 3] == 255 else { continue }
            let current = [source[center], source[center + 1], source[center + 2]]
            var red: [UInt8] = []
            var green: [UInt8] = []
            var blue: [UInt8] = []
            var neighborColors: [[UInt8]] = []
            red.reserveCapacity(8)
            green.reserveCapacity(8)
            blue.reserveCapacity(8)
            neighborColors.reserveCapacity(8)
            var allOpaque = true
            for offsetY in -1...1 {
                for offsetX in -1...1 where offsetX != 0 || offsetY != 0 {
                    let neighbor = (y + offsetY) * bytesPerRow + (x + offsetX) * 4
                    guard source[neighbor + 3] == 255 else {
                        allOpaque = false
                        continue
                    }
                    let color = [source[neighbor], source[neighbor + 1], source[neighbor + 2]]
                    red.append(color[0])
                    green.append(color[1])
                    blue.append(color[2])
                    neighborColors.append(color)
                }
            }
            guard allOpaque else { continue }
            red.sort()
            green.sort()
            blue.sort()
            let median = [red[4], green[4], blue[4]]
            let changedChannels = (0..<3).filter { current[$0] != median[$0] }
            guard changedChannels.count == 1,
                  abs(Int(current[changedChannels[0]]) - Int(median[changedChannels[0]])) == 16,
                  neighborColors.filter({ $0 == median }).count >= 3,
                  !neighborColors.contains(current) else { continue }
            pixels[center] = median[0]
            pixels[center + 1] = median[1]
            pixels[center + 2] = median[2]
        }
    }
}

func validateTransparentAtlasPadding(
    _ pixels: [UInt8],
    frameWidth: Int,
    frameHeight: Int,
    frameCount: Int,
    bytesPerRow: Int,
    assetID: String
) throws {
    let atlasWidth = frameWidth * frameCount
    guard frameWidth > 0,
          frameHeight > 0,
          frameCount > 0,
          bytesPerRow >= atlasWidth * 4,
          pixels.count >= bytesPerRow * frameHeight else {
        throw RenderError.render("\(assetID) has invalid atlas padding geometry")
    }
    for x in 0..<atlasWidth {
        let bottomAlpha = pixels[x * 4 + 3]
        let topAlpha = pixels[((frameHeight - 1) * bytesPerRow) + x * 4 + 3]
        guard bottomAlpha == 0, topAlpha == 0 else {
            throw RenderError.render("\(assetID) has a nontransparent top or bottom border")
        }
    }
    for frameIndex in 0..<frameCount {
        let leftX = frameIndex * frameWidth
        let rightX = leftX + frameWidth - 1
        for y in 0..<frameHeight {
            let leftAlpha = pixels[y * bytesPerRow + leftX * 4 + 3]
            let rightAlpha = pixels[y * bytesPerRow + rightX * 4 + 3]
            guard leftAlpha == 0, rightAlpha == 0 else {
                throw RenderError.render(
                    "\(assetID) has a nontransparent left or right frame border at frame \(frameIndex)"
                )
            }
        }
    }
}

func makeAtlas(frames: [CGImage], frame: FrameContract, assetID: String) throws -> Data {
    let atlasWidth = frame.width * frames.count
    let atlasHeight = frame.height
    guard frames.count == 7, atlasWidth == 3584, atlasHeight == 512 else {
        throw RenderError.render("\(assetID) has wrong atlas geometry")
    }
    let bytesPerRow = atlasWidth * 4
    let byteCount = bytesPerRow * atlasHeight
    var pixels = [UInt8](repeating: 0, count: byteCount)
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    for (frameIndex, image) in frames.enumerated() {
        guard image.width == frame.width * supersample,
              image.height == frame.height * supersample else {
            throw RenderError.render("\(assetID) contains a frame with the wrong supersampled geometry")
        }
        let source = try rasterizedPremultipliedRGBA(image)
        let sourceBytesPerRow = image.width * 4
        for targetY in 0..<frame.height {
            for targetX in 0..<frame.width {
                let destinationPixel = targetY * bytesPerRow + (frameIndex * frame.width + targetX) * 4
                for channel in 0..<4 {
                    var sum = 0
                    for sampleY in 0..<supersample {
                        for sampleX in 0..<supersample {
                            let sourcePixel = (targetY * supersample + sampleY) * sourceBytesPerRow
                                + (targetX * supersample + sampleX) * 4
                            sum += Int(source[sourcePixel + channel])
                        }
                    }
                    let sampleCount = supersample * supersample
                    pixels[destinationPixel + channel] = UInt8((sum + sampleCount / 2) / sampleCount)
                }
            }
        }
    }
    var transparentPixels = 0
    for index in stride(from: 0, to: byteCount, by: 4) {
        let alpha = pixels[index + 3]
        if alpha == 0 {
            transparentPixels += 1
            pixels[index] = 0
            pixels[index + 1] = 0
            pixels[index + 2] = 0
        } else {
            // SceneKit can return extended-color antialias samples a few values above
            // 8-bit alpha. Clamp them into legal premultiplied RGBA before encoding.
            pixels[index] = min(pixels[index], alpha)
            pixels[index + 1] = min(pixels[index + 1], alpha)
            pixels[index + 2] = min(pixels[index + 2], alpha)
            // Remove sub-sixteen-level GPU rounding noise so repeated offline renders
            // remain byte-identical across fresh SceneKit renderer processes.
            pixels[index] &= 0xf0
            pixels[index + 1] &= 0xf0
            pixels[index + 2] &= 0xf0
        }
    }
    canonicalizeIsolatedOpaqueNoise(
        &pixels,
        width: atlasWidth,
        height: atlasHeight,
        bytesPerRow: bytesPerRow
    )
    guard transparentPixels > 0 else {
        throw RenderError.render("\(assetID) has no transparent pixels")
    }
    try validateTransparentAtlasPadding(
        pixels,
        frameWidth: frame.width,
        frameHeight: frame.height,
        frameCount: frames.count,
        bytesPerRow: bytesPerRow,
        assetID: assetID
    )
    for index in stride(from: 0, to: byteCount, by: 4) where pixels[index + 3] == 0 {
        guard pixels[index] == 0, pixels[index + 1] == 0, pixels[index + 2] == 0 else {
            throw RenderError.render("\(assetID) contains hidden RGB")
        }
    }
    for index in stride(from: 0, to: byteCount, by: 4) {
        let alpha = pixels[index + 3]
        guard pixels[index] <= alpha, pixels[index + 1] <= alpha, pixels[index + 2] <= alpha else {
            throw RenderError.render("\(assetID) contains non-premultiplied color")
        }
    }

    guard let context = CGContext(
        data: &pixels,
        width: atlasWidth,
        height: atlasHeight,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo
    ) else {
        throw RenderError.render("Could not create atlas canvas for \(assetID)")
    }
    guard let atlasImage = context.makeImage() else {
        throw RenderError.render("Could not finalize atlas for \(assetID)")
    }
    let bitmap = NSBitmapImageRep(cgImage: atlasImage)
    guard bitmap.pixelsWide == 3584,
          bitmap.pixelsHigh == 512,
          let png = bitmap.representation(using: .png, properties: [.compressionFactor: 1]) else {
        throw RenderError.write("Could not encode \(assetID).png")
    }
    guard png.count <= 2 * 1024 * 1024 else {
        throw RenderError.write("\(assetID).png exceeds 2 MiB")
    }
    return png
}

func renderAll(arguments: Arguments, manifest: WorldManifest) throws -> [String: String] {
    try FileManager.default.createDirectory(at: arguments.output, withIntermediateDirectories: true)
    var hashes: [String: String] = [:]
    var totalBytes = 0
    for asset in manifest.assets {
        let png = try autoreleasepool {
            let frames = try renderFrames(asset: asset, sourceRoot: arguments.sourceRoot, frame: manifest.frame)
            return try makeAtlas(frames: frames, frame: manifest.frame, assetID: asset.id)
        }
        totalBytes += png.count
        let outputURL = arguments.output.appendingPathComponent("\(asset.id).png")
        do {
            try png.write(to: outputURL, options: .atomic)
        } catch {
            throw RenderError.write("Could not write \(outputURL.path): \(error)")
        }
        hashes["\(asset.id).png"] = sha256Hex(png)
    }
    guard totalBytes <= 18 * 1024 * 1024 else {
        throw RenderError.write("World atlases exceed 18 MiB in total")
    }
    return hashes
}

#if !WORLD_CANONICALIZER_TEST
do {
    let arguments = try Arguments(CommandLine.arguments)
    let manifest = try loadAndValidateManifest(arguments: arguments)
    let outputHashes = try renderAll(arguments: arguments, manifest: manifest)
    let rendererURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
    let result: [String: Any] = [
        "rendererSha256": try sha256Hex(at: rendererURL),
        "sourceHashes": manifest.sourceHashes,
        "outputHashes": outputHashes,
    ]
    let encoded = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    guard let line = String(data: encoded, encoding: .utf8) else {
        throw RenderError.write("Could not encode renderer report")
    }
    print(line)
} catch {
    FileHandle.standardError.write(Data("render-world-assets: \(error)\n".utf8))
    exit(1)
}
#endif
