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

struct FramingContract: Decodable, Equatable {
    let targetWidthRatio: Double
    let targetHeightRatio: Double
    let bottomPadding: Int
}

// Keep these category dimensions byte-for-byte aligned with src/world-art.js.
let WORLD_GEOMETRY: [String: GeometryDimensions] = [
    "drone": GeometryDimensions(worldWidth: 380, worldHeight: 360, baseY: 140),
    "turret": GeometryDimensions(worldWidth: 489.6, worldHeight: 1900, baseY: 0),
    "wallLow": GeometryDimensions(worldWidth: 648, worldHeight: 600, baseY: 0),
    "wallHigh": GeometryDimensions(worldWidth: 648, worldHeight: 2000, baseY: 0),
]

struct UpstreamRecord: Decodable {
    let id: String
    let sourcePage: String
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
    let framing: [String: FramingContract]
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
private let requiredFraming: [String: FramingContract] = [
    "drone": FramingContract(targetWidthRatio: 0.72, targetHeightRatio: 0.64, bottomPadding: 48),
    "turret": FramingContract(targetWidthRatio: 0.76, targetHeightRatio: 0.86, bottomPadding: 36),
    "wallLow": FramingContract(targetWidthRatio: 0.86, targetHeightRatio: 0.58, bottomPadding: 36),
    "wallHigh": FramingContract(targetWidthRatio: 0.78, targetHeightRatio: 0.88, bottomPadding: 28),
    "gap": FramingContract(targetWidthRatio: 0.88, targetHeightRatio: 0.56, bottomPadding: 32),
]
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
    guard manifest.version == 2 else {
        throw RenderError.validation("Manifest version must be 2")
    }
    guard manifest.frame.width == 512,
          manifest.frame.height == 512,
          manifest.frame.yawDegrees == requiredYaw else {
        throw RenderError.validation("Atlas frame contract must be seven 512x512 views at -30...30 degrees")
    }
    guard manifest.geometry == WORLD_GEOMETRY else {
        throw RenderError.validation("Manifest geometry does not match WORLD_GEOMETRY")
    }
    guard manifest.framing == requiredFraming else {
        throw RenderError.validation("Manifest framing does not match the five canonical category contracts")
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
    let upstreamIdentity = manifest.upstream.map {
        [$0.id, $0.sourcePage, $0.archiveFilename, $0.archiveSha256, $0.downloadDate,
         $0.license, $0.licenseCommitted, $0.licenseSha256]
    }
    guard upstreamIdentity == [
        ["kenney-space-kit", "https://kenney.nl/assets/space-kit", "kenney_space-kit.zip",
         "d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9", "2026-08-03",
         "Creative Commons CC0 1.0 Universal", "licenses/Kenney-Space-Kit-CC0.txt",
         "bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7"],
        ["kenney-modular-space-kit", "https://kenney.nl/assets/modular-space-kit",
         "kenney_modular-space-kit_1.0.zip",
         "f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc", "2026-08-03",
         "Creative Commons CC0 1.0 Universal", "licenses/Kenney-Modular-Space-Kit-CC0.txt",
         "38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb"],
    ] else {
        throw RenderError.validation("Manifest must pin the two audited Kenney source archives and licenses")
    }

    var referenced = Set<String>()
    for asset in manifest.assets {
        guard !asset.components.isEmpty else {
            throw RenderError.validation("\(asset.id) must contain at least one component")
        }
        guard manifest.framing[asset.category] != nil else {
            throw RenderError.validation("\(asset.id) has no canonical framing category")
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

func applyComponentTransform(_ recipe: ComponentRecipe, to node: SCNNode) {
    node.scale = SCNVector3(CGFloat(recipe.scale), CGFloat(recipe.scale), CGFloat(recipe.scale))
    node.eulerAngles = degreesVector(recipe.rotationDegrees)
    node.position = vector(recipe.translation)
}

func filterOBJSource(
    _ source: String,
    hidingGroups: Set<String>,
    materialFilename: String,
    label: String
) throws -> String {
    guard !hidingGroups.isEmpty else { return source }
    var activeGroups = Set<String>()
    var declaredGroups = Set<String>()
    var removedFaces = Dictionary(uniqueKeysWithValues: hidingGroups.map { ($0, 0) })
    var output: [String] = []
    let normalizedSource = source
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
    for line in normalizedSource.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
        let tokens = line.split(whereSeparator: \.isWhitespace).map(String.init)
        if tokens.first == "g" {
            activeGroups = Set(tokens.dropFirst())
            declaredGroups.formUnion(activeGroups.intersection(hidingGroups))
        }
        if tokens.first == "f" {
            let hiddenActiveGroups = activeGroups.intersection(hidingGroups)
            if !hiddenActiveGroups.isEmpty {
                for group in hiddenActiveGroups { removedFaces[group, default: 0] += 1 }
                continue
            }
        }
        if tokens.first == "mtllib" {
            output.append("mtllib \(materialFilename)")
        } else {
            output.append(line)
        }
    }
    for requestedGroup in hidingGroups.sorted() {
        guard declaredGroups.contains(requestedGroup) else {
            throw RenderError.load("\(label) requested hidden OBJ group '\(requestedGroup)' but it was not declared")
        }
        guard removedFaces[requestedGroup, default: 0] > 0 else {
            throw RenderError.load("\(label) requested hidden OBJ group '\(requestedGroup)' but it removed no faces")
        }
    }
    return output.joined(separator: "\n")
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

func srgb(_ red: Int, _ green: Int, _ blue: Int) -> NSColor {
    NSColor(srgbRed: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255, alpha: 1)
}

func styledMaterial(
    source: SCNMaterial,
    index: Int,
    texturePaths: [String],
    images: [String: NSImage]
) -> SCNMaterial {
    let result = source.copy() as? SCNMaterial ?? SCNMaterial()
    let materialName = source.name ?? "material-\(index)"
    if let texturePath = texturePaths.first, let texture = images[texturePath] {
        // Modular Space Kit carries its audited palette in colormap.png.
        result.diffuse.contents = texture
        result.multiply.contents = NSColor.white
    } else {
        let sourceColor = (source.diffuse.contents as? NSColor)?
            .usingColorSpace(.deviceRGB) ?? NSColor.white
        let luminance = 0.2126 * sourceColor.redComponent
            + 0.7152 * sourceColor.greenComponent
            + 0.0722 * sourceColor.blueComponent
        var hue: CGFloat = 0
        var saturation: CGFloat = 0
        var brightness: CGFloat = 0
        var alpha: CGFloat = 0
        sourceColor.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
        let isOrange = saturation >= 0.35 && hue >= 0.04 && hue <= 0.14
        result.diffuse.contents = luminance < 0.32
            ? srgb(0x25, 0x30, 0x44)
            : (isOrange ? srgb(0xf0, 0x92, 0x45) : srgb(0xe9, 0xef, 0xf6))
        result.multiply.contents = NSColor.white
    }
    result.name = "Orbital defense \(materialName)"
    result.lightingModel = .physicallyBased
    result.isDoubleSided = true
    result.diffuse.magnificationFilter = .linear
    result.diffuse.minificationFilter = .linear
    result.diffuse.mipFilter = .linear
    result.metalness.contents = 0.24
    result.roughness.contents = 0.38
    result.emission.contents = NSColor.black
    return result
}

func loadComponent(
    _ recipe: ComponentRecipe,
    asset: AssetRecipe,
    sourceRoot: URL
) throws -> SCNNode {
    let sourceModelURL = sourceRoot.appendingPathComponent(recipe.model)
    let sourceMaterialURL = sourceRoot.appendingPathComponent(recipe.material)
    let materialData: Data
    do {
        materialData = try Data(contentsOf: sourceMaterialURL, options: .mappedIfSafe)
    } catch {
        throw RenderError.load("Could not load material at \(sourceMaterialURL.path)")
    }
    var temporaryImportDirectory: URL?
    var modelURL = sourceModelURL
    if !asset.hideNodes.isEmpty {
        let source: String
        do {
            source = try String(contentsOf: sourceModelURL, encoding: .utf8)
        } catch {
            throw RenderError.load("Could not read OBJ source at \(sourceModelURL.path)")
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("orbital-obj-filter-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            let temporaryMaterialURL = directory.appendingPathComponent("orbital-source.mtl")
            let temporaryModelURL = directory.appendingPathComponent("orbital-source.obj")
            let filtered = try filterOBJSource(
                source,
                hidingGroups: Set(asset.hideNodes),
                materialFilename: temporaryMaterialURL.lastPathComponent,
                label: recipe.model
            )
            try materialData.write(to: temporaryMaterialURL, options: .atomic)
            try Data(filtered.utf8).write(to: temporaryModelURL, options: .atomic)
            temporaryImportDirectory = directory
            modelURL = temporaryModelURL
        } catch let error as RenderError {
            try? FileManager.default.removeItem(at: directory)
            throw error
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw RenderError.write("Could not prepare filtered OBJ for \(recipe.model): \(error)")
        }
    }
    defer {
        if let directory = temporaryImportDirectory {
            try? FileManager.default.removeItem(at: directory)
        }
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
    applyComponentTransform(recipe, to: transformed)
    return transformed
}

func flatMaterial(_ color: NSColor, emission: NSColor? = nil) -> SCNMaterial {
    let material = SCNMaterial()
    material.lightingModel = emission == nil ? .physicallyBased : .constant
    material.diffuse.contents = color
    material.emission.contents = emission ?? NSColor.black
    material.isDoubleSided = true
    material.metalness.contents = 0.24
    material.roughness.contents = 0.38
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
        srgb(0x68, 0xe8, 0xff),
        emission: srgb(0x68, 0xe8, 0xff)
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

    let statusLights = [
        flatMaterial(srgb(0x58, 0xe7, 0xff), emission: srgb(0x58, 0xe7, 0xff)),
        flatMaterial(srgb(0xff, 0x8a, 0x42), emission: srgb(0xff, 0x8a, 0x42)),
    ]
    let lightRadius = CGFloat(max(0.012, min(Double(height) * 0.026, 0.025)))
    for (lightIndex, side) in [CGFloat(-1), CGFloat(1)].enumerated() {
        let sphere = SCNSphere(radius: lightRadius)
        sphere.segmentCount = 16
        sphere.materials = [statusLights[lightIndex]]
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
    var sourceTemplates: [String: SCNNode] = [:]
    for component in asset.components {
        let sourceIdentity = ([component.model, component.material] + component.textures)
            .joined(separator: "\u{0}")
        let componentNode: SCNNode
        if let cloned = sourceTemplates[sourceIdentity]?.clone() {
            componentNode = cloned
            applyComponentTransform(component, to: componentNode)
        } else {
            componentNode = try loadComponent(component, asset: asset, sourceRoot: sourceRoot)
            sourceTemplates[sourceIdentity] = componentNode
        }
        assembly.addChildNode(componentNode)
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
    hostileFill.color = srgb(0xff, 0x8a, 0x42)
    hostileFill.intensity = 360
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
    guard renderer.prepare(scene, shouldAbortBlock: nil) else {
        throw RenderError.render("SceneKit could not prepare \(asset.id) before snapshot rendering")
    }
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

struct AlphaBounds {
    var minX: Int
    var maxX: Int
    var minY: Int
    var maxY: Int

    var width: Int { maxX - minX + 1 }
    var height: Int { maxY - minY + 1 }
}

func alphaBounds(
    _ pixels: [UInt8],
    width: Int,
    height: Int,
    bytesPerRow: Int,
    threshold: UInt8 = 16
) throws -> AlphaBounds {
    var bounds = AlphaBounds(minX: width, maxX: -1, minY: height, maxY: -1)
    for y in 0..<height {
        for x in 0..<width where pixels[y * bytesPerRow + x * 4 + 3] >= threshold {
            bounds.minX = min(bounds.minX, x)
            bounds.maxX = max(bounds.maxX, x)
            bounds.minY = min(bounds.minY, y)
            bounds.maxY = max(bounds.maxY, y)
        }
    }
    guard bounds.maxX >= bounds.minX, bounds.maxY >= bounds.minY else {
        throw RenderError.render("Raw SceneKit frame has no alpha at or above 16")
    }
    return bounds
}

func bottomBandAnchoredFrames(
    _ frames: [[UInt8]],
    width: Int,
    height: Int,
    minimumBottom: Int,
    maximumBottom: Int
) throws -> [[UInt8]] {
    let bytesPerRow = width * 4
    let bounds = try frames.map {
        try alphaBounds($0, width: width, height: height, bytesPerRow: bytesPerRow)
    }
    guard let lowestBottom = bounds.map(\.maxY).min(),
          let highestBottom = bounds.map(\.maxY).max() else {
        throw RenderError.render("Could not measure canonical frame bottoms")
    }
    let minimumShift = minimumBottom - lowestBottom
    let maximumShift = maximumBottom - highestBottom
    guard minimumShift <= maximumShift else {
        throw RenderError.render("Yaw-frame bottom spread cannot fit the required anchor band")
    }
    let shift: Int
    if minimumShift > 0 {
        shift = minimumShift
    } else if maximumShift < 0 {
        shift = maximumShift
    } else {
        shift = 0
    }
    guard shift != 0 else { return frames }
    return frames.map { source in
        var shifted = [UInt8](repeating: 0, count: source.count)
        for targetY in 0..<height {
            let sourceY = targetY - shift
            guard sourceY >= 0, sourceY < height else { continue }
            let sourceStart = sourceY * bytesPerRow
            let targetStart = targetY * bytesPerRow
            shifted.replaceSubrange(
                targetStart..<(targetStart + bytesPerRow),
                with: source[sourceStart..<(sourceStart + bytesPerRow)]
            )
        }
        return shifted
    }
}

func canonicallyFrame(
    _ images: [CGImage],
    frame: FrameContract,
    framing: FramingContract,
    assetID: String
) throws -> [[UInt8]] {
    guard images.count == 7 else {
        throw RenderError.render("\(assetID) must contain seven raw yaw frames")
    }
    let rawWidth = frame.width * supersample
    let rawHeight = frame.height * supersample
    let rawBytesPerRow = rawWidth * 4
    var sources: [[UInt8]] = []
    var union = AlphaBounds(minX: rawWidth, maxX: -1, minY: rawHeight, maxY: -1)
    for image in images {
        guard image.width == rawWidth, image.height == rawHeight else {
            throw RenderError.render("\(assetID) contains a frame with the wrong supersampled geometry")
        }
        let pixels = try rasterizedPremultipliedRGBA(image)
        let bounds = try alphaBounds(
            pixels,
            width: rawWidth,
            height: rawHeight,
            bytesPerRow: rawBytesPerRow
        )
        union.minX = min(union.minX, bounds.minX)
        union.maxX = max(union.maxX, bounds.maxX)
        union.minY = min(union.minY, bounds.minY)
        union.maxY = max(union.maxY, bounds.maxY)
        sources.append(pixels)
    }

    let targetWidth = Double(frame.width) * framing.targetWidthRatio
    let targetHeight = Double(frame.height) * framing.targetHeightRatio
    let scale = min(targetWidth / Double(union.width), targetHeight / Double(union.height))
    guard scale.isFinite, scale > 0 else {
        throw RenderError.render("\(assetID) has an invalid canonical framing scale")
    }
    let targetLeft = (Double(frame.width) - Double(union.width) * scale) / 2
    let targetTop = Double(frame.height - framing.bottomPadding) - Double(union.height) * scale
    let outputBytesPerRow = frame.width * 4

    let outputs = sources.map { source in
        var output = [UInt8](repeating: 0, count: outputBytesPerRow * frame.height)
        for targetY in 0..<frame.height {
            let sourceY = (Double(targetY) + 0.5 - targetTop) / scale
                + Double(union.minY) - 0.5
            guard sourceY >= Double(union.minY), sourceY <= Double(union.maxY) else { continue }
            let y0 = max(union.minY, Int(floor(sourceY)))
            let y1 = min(union.maxY, y0 + 1)
            let fractionY = sourceY - Double(y0)
            for targetX in 0..<frame.width {
                let sourceX = (Double(targetX) + 0.5 - targetLeft) / scale
                    + Double(union.minX) - 0.5
                guard sourceX >= Double(union.minX), sourceX <= Double(union.maxX) else { continue }
                let x0 = max(union.minX, Int(floor(sourceX)))
                let x1 = min(union.maxX, x0 + 1)
                let fractionX = sourceX - Double(x0)
                let sampleOffsets = [
                    y0 * rawBytesPerRow + x0 * 4,
                    y0 * rawBytesPerRow + x1 * 4,
                    y1 * rawBytesPerRow + x0 * 4,
                    y1 * rawBytesPerRow + x1 * 4,
                ]
                let weights = [
                    (1 - fractionX) * (1 - fractionY),
                    fractionX * (1 - fractionY),
                    (1 - fractionX) * fractionY,
                    fractionX * fractionY,
                ]
                let destination = targetY * outputBytesPerRow + targetX * 4
                for channel in 0..<4 {
                    let value = zip(sampleOffsets, weights).reduce(0.0) {
                        $0 + Double(source[$1.0 + channel]) * $1.1
                    }
                    output[destination + channel] = UInt8(max(0, min(255, Int(value.rounded()))))
                }
            }
        }
        return output
    }
    return try bottomBandAnchoredFrames(
        outputs,
        width: frame.width,
        height: frame.height,
        minimumBottom: 440,
        maximumBottom: 488
    )
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

func quantizedPremultipliedChannel(_ value: UInt8, alpha: UInt8) -> UInt8 {
    let nearestFourBitBucket = min(255, ((Int(value) + 8) / 16) * 16)
    return UInt8(min(Int(alpha), nearestFourBitBucket))
}

func makeAtlas(
    frames: [CGImage],
    frame: FrameContract,
    framing: FramingContract,
    assetID: String
) throws -> Data {
    let atlasWidth = frame.width * frames.count
    let atlasHeight = frame.height
    guard frames.count == 7, atlasWidth == 3584, atlasHeight == 512 else {
        throw RenderError.render("\(assetID) has wrong atlas geometry")
    }
    let bytesPerRow = atlasWidth * 4
    let byteCount = bytesPerRow * atlasHeight
    var pixels = [UInt8](repeating: 0, count: byteCount)
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    let framedPixels = try canonicallyFrame(frames, frame: frame, framing: framing, assetID: assetID)
    for (frameIndex, source) in framedPixels.enumerated() {
        let sourceBytesPerRow = frame.width * 4
        for targetY in 0..<frame.height {
            let sourceStart = targetY * sourceBytesPerRow
            let destinationStart = targetY * bytesPerRow + frameIndex * sourceBytesPerRow
            pixels.replaceSubrange(
                destinationStart..<(destinationStart + sourceBytesPerRow),
                with: source[sourceStart..<(sourceStart + sourceBytesPerRow)]
            )
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
            // Round to the nearest 4-bit color bucket after clamping. Flooring puts
            // exact 16-step boundaries on common shader results, allowing a one-unit
            // GPU rounding difference to become a visible 16-step atlas difference.
            pixels[index] = quantizedPremultipliedChannel(pixels[index], alpha: alpha)
            pixels[index + 1] = quantizedPremultipliedChannel(pixels[index + 1], alpha: alpha)
            pixels[index + 2] = quantizedPremultipliedChannel(pixels[index + 2], alpha: alpha)
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
            guard let framing = manifest.framing[asset.category] else {
                throw RenderError.validation("\(asset.id) has no canonical framing contract")
            }
            return try makeAtlas(frames: frames, frame: manifest.frame, framing: framing, assetID: asset.id)
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
