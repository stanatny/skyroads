#!/usr/bin/env swift

import AppKit
import CryptoKit
import Foundation
import ImageIO
import SceneKit

struct UprightFrameContract: Decodable, Equatable {
    let width: Int
    let height: Int
    let yawDegrees: [Int]
    let pitchDegrees: [Int]
}

struct RoadEdgeFrameContract: Decodable, Equatable {
    let width: Int
    let height: Int
    let yawDegrees: [Int]
}

struct FrameContracts: Decodable, Equatable {
    let upright: UprightFrameContract
    let roadEdge: RoadEdgeFrameContract
}

struct AtlasBudget: Decodable, Equatable {
    let maxFileBytes: Int
    let maxCombinedBytes: Int
    let maxDecodedBytes: Int
}

struct BudgetContracts: Decodable, Equatable {
    let upright: AtlasBudget
    let roadEdge: AtlasBudget
}

struct GeometryDimensions: Decodable, Equatable {
    let worldWidth: Double
    let worldHeight: Double
    let baseY: Double
    let weaponMountHeight: Double?
}

struct FramingContract: Decodable, Equatable {
    let targetWidthRatio: Double
    let targetHeightRatio: Double
    let bottomPadding: Int
}

// Keep these category dimensions byte-for-byte aligned with src/world-art.js.
let WORLD_GEOMETRY: [String: GeometryDimensions] = [
    "drone": GeometryDimensions(worldWidth: 432, worldHeight: 360, baseY: 140, weaponMountHeight: nil),
    "turret": GeometryDimensions(worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120),
    "wallLow": GeometryDimensions(worldWidth: 648, worldHeight: 600, baseY: 0, weaponMountHeight: nil),
    "wallMedium": GeometryDimensions(worldWidth: 648, worldHeight: 1250, baseY: 0, weaponMountHeight: nil),
    "wallHigh": GeometryDimensions(worldWidth: 648, worldHeight: 2000, baseY: 0, weaponMountHeight: nil),
    "corridorLow": GeometryDimensions(worldWidth: 648, worldHeight: 600, baseY: 0, weaponMountHeight: nil),
    "corridorMedium": GeometryDimensions(worldWidth: 648, worldHeight: 1250, baseY: 0, weaponMountHeight: nil),
]

struct PixelRect: Codable, Equatable {
    let sx: Int
    let sy: Int
    let sw: Int
    let sh: Int
}

struct PixelPoint: Codable, Equatable {
    let x: Double
    let y: Double
}

struct UprightFrameMetadata: Codable, Equatable {
    let source: PixelRect
    let origin: PixelPoint
}

struct WorldBoundsMetadata: Codable, Equatable {
    let minX: Double
    let maxX: Double
    let minY: Double
    let maxY: Double
    let minZ: Double
    let maxZ: Double
}

struct UprightAtlasMetadata: Codable, Equatable {
    let layout: String
    let atlasWidth: Int
    let atlasHeight: Int
    let frameWidth: Int
    let frameHeight: Int
    let yawDegrees: [Int]
    let pitchDegrees: [Int]
    let detailFrontZ: Double
    let worldBounds: WorldBoundsMetadata
    let pixelsPerWorldUnit: Double
    let frames: [UprightFrameMetadata]
}

struct UprightRenderedCell {
    let pixels: [UInt8]
    let projectedOrigin: PixelPoint
}

struct UprightAtlasProduct {
    let pixels: [UInt8]
    let metadata: UprightAtlasMetadata
}

struct UprightTurntable {
    let node: SCNNode
    let detailFrontZ: Double
}

let WORLD_BOUNDS: [String: WorldBoundsMetadata] = [
    "drone": WorldBoundsMetadata(minX: -216, maxX: 216, minY: 140, maxY: 500, minZ: -25, maxZ: 25),
    "turret": WorldBoundsMetadata(minX: -244.8, maxX: 244.8, minY: 0, maxY: 1900, minZ: -25, maxZ: 25),
    "wallLow": WorldBoundsMetadata(minX: -324, maxX: 324, minY: 0, maxY: 600, minZ: -25, maxZ: 25),
    "wallMedium": WorldBoundsMetadata(minX: -324, maxX: 324, minY: 0, maxY: 1250, minZ: -25, maxZ: 25),
    "wallHigh": WorldBoundsMetadata(minX: -324, maxX: 324, minY: 0, maxY: 2000, minZ: -25, maxZ: 25),
    "corridorLow": WorldBoundsMetadata(minX: -324, maxX: 324, minY: 0, maxY: 600, minZ: -25, maxZ: 25),
    "corridorMedium": WorldBoundsMetadata(minX: -324, maxX: 324, minY: 0, maxY: 1250, minZ: -25, maxZ: 25),
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

struct GeneratedDetails: Decodable, Equatable {
    let plinthSize: [Double]
    let conduitSize: [Double]
    let conduitY: Double
    let cyanBandY: [Double]
}

struct AssetRecipe: Decodable {
    let id: String
    let sourceFamily: String
    let layout: String
    let category: String
    let components: [ComponentRecipe]
    let hideNodes: [String]
    let generatedDetails: GeneratedDetails?
}

struct WorldManifest: Decodable {
    let version: Int
    let frames: FrameContracts
    let budgets: BudgetContracts
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
    let metadataJS: URL

    init(_ values: [String]) throws {
        let usage = "Usage: render-world-assets.swift --manifest WORLD_ASSETS.json --source-root EXTRACTED --output OUTPUT --metadata-js OUTPUT.js"
        guard values.count == 9 else { throw RenderError.usage(usage) }
        var parsed: [String: String] = [:]
        var index = 1
        while index < values.count {
            let flag = values[index]
            guard ["--manifest", "--source-root", "--output", "--metadata-js"].contains(flag),
                  parsed[flag] == nil else {
                throw RenderError.usage(usage)
            }
            parsed[flag] = values[index + 1]
            index += 2
        }
        guard let manifestPath = parsed["--manifest"],
              let sourceRootPath = parsed["--source-root"],
              let outputPath = parsed["--output"],
              let metadataJSPath = parsed["--metadata-js"] else {
            throw RenderError.usage(usage)
        }
        manifest = URL(fileURLWithPath: manifestPath).standardizedFileURL
        sourceRoot = URL(fileURLWithPath: sourceRootPath).standardizedFileURL
        output = URL(fileURLWithPath: outputPath).standardizedFileURL
        metadataJS = URL(fileURLWithPath: metadataJSPath).standardizedFileURL
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

let canonicalUprightIDs = [
    "drone-scout",
    "drone-striker",
    "turret-sentry",
    "turret-heavy",
    "barrier-rail",
    "barrier-crate",
    "structure-pylon",
    "structure-bastion",
    "structure-reactor",
    "structure-tower",
    "corridor-low",
    "corridor-medium",
]
private let requiredIDs = canonicalUprightIDs + [
    "gap-edge",
]

private let requiredFrames = FrameContracts(
    upright: UprightFrameContract(
        width: 320,
        height: 320,
        yawDegrees: [-80, -55, -30, 0, 30, 55, 80],
        pitchDegrees: [20, 55, 80]
    ),
    roadEdge: RoadEdgeFrameContract(
        width: 512,
        height: 512,
        yawDegrees: [-30, -20, -10, 0, 10, 20, 30]
    )
)
private let requiredBudgets = BudgetContracts(
    upright: AtlasBudget(
        maxFileBytes: 3_145_728,
        maxCombinedBytes: 31_457_280,
        maxDecodedBytes: 117_440_512
    ),
    roadEdge: AtlasBudget(
        maxFileBytes: 2_097_152,
        maxCombinedBytes: 18_874_368,
        maxDecodedBytes: 7_340_032
    )
)
private let requiredRecipeContracts: [(String, String, String)] = [
    ("drone-scout", "upright", "drone"),
    ("drone-striker", "upright", "drone"),
    ("turret-sentry", "upright", "turret"),
    ("turret-heavy", "upright", "turret"),
    ("barrier-rail", "upright", "wallLow"),
    ("barrier-crate", "upright", "wallLow"),
    ("structure-pylon", "upright", "wallMedium"),
    ("structure-bastion", "upright", "wallMedium"),
    ("structure-reactor", "upright", "wallHigh"),
    ("structure-tower", "upright", "wallHigh"),
    ("corridor-low", "upright", "corridorLow"),
    ("corridor-medium", "upright", "corridorMedium"),
    ("gap-edge", "roadEdge", "gap"),
]
private let requiredGeneratedDetails: [String: GeneratedDetails] = [
    "corridor-low": GeneratedDetails(
        plinthSize: [648, 36, 50], conduitSize: [36, 36, 50], conduitY: 540, cyanBandY: [390]
    ),
    "corridor-medium": GeneratedDetails(
        plinthSize: [648, 36, 50], conduitSize: [36, 36, 50], conduitY: 1120, cyanBandY: [460, 910]
    ),
]
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
    guard manifest.version == 3 else {
        throw RenderError.validation("Manifest version must be 3")
    }
    guard manifest.frames == requiredFrames else {
        throw RenderError.validation("Manifest frames must match the strict upright and roadEdge contracts")
    }
    guard manifest.budgets == requiredBudgets else {
        throw RenderError.validation("Manifest budgets must match the strict upright and roadEdge limits")
    }
    guard manifest.geometry == WORLD_GEOMETRY else {
        throw RenderError.validation("Manifest geometry does not match WORLD_GEOMETRY")
    }
    guard manifest.framing == requiredFraming else {
        throw RenderError.validation("Manifest legacy framing does not match the five canonical category contracts")
    }
    guard manifest.assets.map(\.id) == requiredIDs else {
        throw RenderError.validation("Manifest must contain the thirteen world recipes in canonical order")
    }
    guard manifest.assets.count == requiredRecipeContracts.count else {
        throw RenderError.validation("Manifest recipe contract count is invalid")
    }
    for (index, asset) in manifest.assets.enumerated() {
        let expected = requiredRecipeContracts[index]
        guard asset.id == expected.0,
              asset.layout == expected.1,
              asset.category == expected.2 else {
            throw RenderError.validation("Manifest recipe layout/category mismatch at index \(index)")
        }
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
        let licenseURL = arguments.sourceRoot.appendingPathComponent(upstream.licenseSource)
        let actualLicenseHash: String
        do {
            actualLicenseHash = try sha256Hex(at: licenseURL)
        } catch {
            throw RenderError.load("Missing or unreadable license source: \(upstream.licenseSource)")
        }
        guard actualLicenseHash == upstream.licenseSha256 else {
            throw RenderError.validation("License hash mismatch for \(upstream.licenseSource): \(actualLicenseHash)")
        }
    }
    let upstreamIdentity = manifest.upstream.map {
        [$0.id, $0.sourcePage, $0.archiveFilename, $0.archiveSha256, $0.downloadDate,
         $0.license, $0.licenseSource, $0.licenseCommitted, $0.licenseSha256]
    }
    guard upstreamIdentity == [
        ["kenney-space-kit", "https://kenney.nl/assets/space-kit", "kenney_space-kit.zip",
         "d5d7cdf2635ed5a43a9187deaf409b6f47484e402321128341d3c3698e9ef4d9", "2026-08-03",
         "Creative Commons CC0 1.0 Universal", "space-kit/License.txt",
         "licenses/Kenney-Space-Kit-CC0.txt",
         "bd4e050e69d41351282c4d53f943cd4d80a80b968593e60653ba5292637941b7"],
        ["kenney-modular-space-kit", "https://kenney.nl/assets/modular-space-kit",
         "kenney_modular-space-kit_1.0.zip",
         "f394f7fd9eaf29c9de7e090e55b69926f699841af33b0b116f5cc0088de8a4dc", "2026-08-03",
         "Creative Commons CC0 1.0 Universal", "modular-space-kit/License.txt",
         "licenses/Kenney-Modular-Space-Kit-CC0.txt",
         "38d94a4c79768cf5dc65e55b85f2dedd9f4bad35e325db1d0e5898fc1b7c5bbb"],
    ] else {
        throw RenderError.validation("Manifest must pin the two audited Kenney source archives and licenses")
    }

    var referenced = Set<String>()
    for asset in manifest.assets {
        guard !asset.components.isEmpty else {
            throw RenderError.validation("\(asset.id) must contain at least one component")
        }
        if asset.layout == "upright" {
            guard manifest.geometry[asset.category] != nil,
                  WORLD_BOUNDS[asset.category] != nil else {
                throw RenderError.validation("\(asset.id) has no upright geometry/world-bounds category")
            }
        } else {
            guard asset.layout == "roadEdge", manifest.framing[asset.category] != nil else {
                throw RenderError.validation("\(asset.id) has no legacy roadEdge framing category")
            }
        }
        let expectedDetails = requiredGeneratedDetails[asset.id]
        guard asset.generatedDetails == expectedDetails else {
            throw RenderError.validation("\(asset.id) has invalid generatedDetails")
        }
        if let details = asset.generatedDetails {
            let sizes = details.plinthSize + details.conduitSize
            guard details.plinthSize.count == 3,
                  details.conduitSize.count == 3,
                  sizes.allSatisfy({ $0.isFinite && $0 > 0 }),
                  details.conduitY.isFinite,
                  !details.cyanBandY.isEmpty,
                  details.cyanBandY.allSatisfy(\.isFinite),
                  let geometry = manifest.geometry[asset.category],
                  details.conduitY >= geometry.baseY,
                  details.conduitY <= geometry.baseY + geometry.worldHeight,
                  details.cyanBandY.allSatisfy({
                      $0 >= geometry.baseY && $0 <= geometry.baseY + geometry.worldHeight
                  }) else {
                throw RenderError.validation("\(asset.id) has non-finite or out-of-bounds generatedDetails")
            }
        }
        for component in asset.components {
            guard component.rotationDegrees.count == 3,
                  component.translation.count == 3,
                  component.scale.isFinite,
                  component.scale > 0,
                  component.rotationDegrees.allSatisfy(\.isFinite),
                  component.translation.allSatisfy(\.isFinite) else {
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

let modelsWithCoincidentFaces: Set<String> = [
    "modular-space-kit/Models/OBJ format/room-large.obj",
    "modular-space-kit/Models/OBJ format/gate-lasers.obj",
]

func requiresCoincidentFaceCanonicalization(_ modelPath: String) -> Bool {
    modelsWithCoincidentFaces.contains(modelPath)
}

func filterOBJSource(
    _ source: String,
    hidingGroups: Set<String>,
    materialFilename: String,
    label: String,
    deduplicateOrientedFaces: Bool = false
) throws -> String {
    guard !hidingGroups.isEmpty || deduplicateOrientedFaces else { return source }
    var activeGroups = Set<String>()
    var activeMaterial = ""
    var declaredGroups = Set<String>()
    var removedFaces = Dictionary(uniqueKeysWithValues: hidingGroups.map { ($0, 0) })
    var positionKeys: [String] = []
    var textureCoordinateKeys: [String] = []
    var normalValues: [[Double]] = []
    var emittedExactFaces = Set<String>()
    var emittedSemanticFaces: [String: [[Double]?]] = [:]
    var output: [String] = []
    let normalizedSource = source
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")

    func coordinateKey(_ components: ArraySlice<String>, kind: String) throws -> (String, [Double]) {
        let values = try components.map { component -> Double in
            guard let value = Double(component), value.isFinite else {
                throw RenderError.load("\(label) has an invalid \(kind) coordinate")
            }
            return value == 0 ? 0 : value
        }
        let key = values.map { String($0.bitPattern, radix: 16) }.joined(separator: ":")
        return (key, values)
    }

    func resolvedIndex(_ component: Substring?, count: Int, kind: String) throws -> Int? {
        guard let component, !component.isEmpty else { return nil }
        guard let rawIndex = Int(component), rawIndex != 0 else {
            throw RenderError.load("\(label) has an invalid \(kind) index")
        }
        let index = rawIndex > 0 ? rawIndex - 1 : count + rawIndex
        guard index >= 0, index < count else {
            throw RenderError.load("\(label) has an out-of-range \(kind) index")
        }
        return index
    }

    func normalsMatch(_ lhs: [[Double]?], _ rhs: [[Double]?]) -> Bool {
        // The two audited Modular Space Kit files carry source-identical faces
        // whose normals straddle the ideal axis by at most two Float32 ULPs.
        let auditedFloat32ComponentTolerance = 0.00000025
        guard lhs.count == rhs.count else { return false }
        return zip(lhs, rhs).allSatisfy { left, right in
            switch (left, right) {
            case (nil, nil): return true
            case (.some(let leftValues), .some(let rightValues)):
                return leftValues.count == rightValues.count
                    && zip(leftValues, rightValues).allSatisfy {
                        abs($0 - $1) <= auditedFloat32ComponentTolerance
                    }
            default: return false
            }
        }
    }

    for line in normalizedSource.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
        let tokens = line.split(whereSeparator: \.isWhitespace).map(String.init)
        if deduplicateOrientedFaces, tokens.first == "v", tokens.count >= 4 {
            positionKeys.append(try coordinateKey(tokens[1...3], kind: "vertex").0)
        }
        if deduplicateOrientedFaces, tokens.first == "vt", tokens.count >= 2 {
            textureCoordinateKeys.append(try coordinateKey(tokens.dropFirst(), kind: "texture").0)
        }
        if deduplicateOrientedFaces, tokens.first == "vn", tokens.count >= 4 {
            normalValues.append(try coordinateKey(tokens[1...3], kind: "normal").1)
        }
        if tokens.first == "g" {
            activeGroups = Set(tokens.dropFirst())
            declaredGroups.formUnion(activeGroups.intersection(hidingGroups))
        }
        if tokens.first == "usemtl" {
            activeMaterial = tokens.dropFirst().joined(separator: " ")
        }
        if tokens.first == "f" {
            let hiddenActiveGroups = activeGroups.intersection(hidingGroups)
            if !hiddenActiveGroups.isEmpty {
                for group in hiddenActiveGroups { removedFaces[group, default: 0] += 1 }
                continue
            }
            if deduplicateOrientedFaces {
                let exactFace = activeMaterial + "\u{0}" + tokens.joined(separator: " ")
                if !emittedExactFaces.insert(exactFace).inserted { continue }

                var facePositions: [String] = []
                var faceTextureCoordinates: [String] = []
                var faceNormals: [[Double]?] = []
                for token in tokens.dropFirst() {
                    let indices = token.split(separator: "/", omittingEmptySubsequences: false)
                    let positionIndex = try resolvedIndex(
                        indices.first, count: positionKeys.count, kind: "vertex"
                    )
                    guard let positionIndex else {
                        throw RenderError.load("\(label) has a face without a vertex index")
                    }
                    let textureIndex = try resolvedIndex(
                        indices.count > 1 ? indices[1] : nil,
                        count: textureCoordinateKeys.count,
                        kind: "texture"
                    )
                    let normalIndex = try resolvedIndex(
                        indices.count > 2 ? indices[2] : nil,
                        count: normalValues.count,
                        kind: "normal"
                    )
                    facePositions.append(positionKeys[positionIndex])
                    faceTextureCoordinates.append(
                        textureIndex.map { textureCoordinateKeys[$0] } ?? "-"
                    )
                    faceNormals.append(normalIndex.map { normalValues[$0] })
                }
                guard facePositions.count >= 3 else {
                    throw RenderError.load("\(label) has a face with fewer than three vertices")
                }
                let positionTextures = zip(facePositions, faceTextureCoordinates).map {
                    $0 + "\u{1}" + $1
                }
                let rotations = positionTextures.indices.map { index -> (String, Int) in
                    let rotated = Array(positionTextures[index...])
                        + Array(positionTextures[..<index])
                    return (rotated.joined(separator: " "), index)
                }
                guard let canonical = rotations.min(by: { $0.0 < $1.0 }) else {
                    throw RenderError.load("\(label) could not canonicalize a face")
                }
                let index = canonical.1
                let alignedNormals = Array(faceNormals[index...]) + Array(faceNormals[..<index])
                let semanticKey = activeMaterial + "\u{0}" + canonical.0
                if let previousNormals = emittedSemanticFaces[semanticKey] {
                    guard normalsMatch(previousNormals, alignedNormals) else {
                        throw RenderError.load("\(label) has conflicting normals on a coincident face")
                    }
                    continue
                }
                emittedSemanticFaces[semanticKey] = alignedNormals
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

func neutralMaterialColor(named materialName: String) -> NSColor {
    switch materialName.lowercased() {
    case "dark": return srgb(0x25, 0x30, 0x44)
    case "rockdark": return srgb(0x30, 0x3a, 0x46)
    case "metaldark": return srgb(0x8b, 0x9b, 0xab)
    case "metalred": return srgb(0x64, 0x78, 0x8e)
    case "rock": return srgb(0x53, 0x66, 0x78)
    default: return srgb(0xe9, 0xef, 0xf6)
    }
}

func styledMaterial(
    source: SCNMaterial,
    index: Int,
    texturePaths: [String],
    images: [String: NSImage]
) -> SCNMaterial {
    let result = source.copy() as? SCNMaterial ?? SCNMaterial()
    let materialName = source.name ?? "material-\(index)"
    let diffuseFilter: SCNFilterMode
    if let texturePath = texturePaths.first, let texture = images[texturePath] {
        // Modular Space Kit carries its audited palette in colormap.png.
        result.diffuse.contents = texture
        result.multiply.contents = NSColor.white
        diffuseFilter = .nearest
    } else {
        result.diffuse.contents = neutralMaterialColor(named: materialName)
        result.multiply.contents = NSColor.white
        diffuseFilter = .linear
    }
    result.name = "Orbital defense \(materialName)"
    result.lightingModel = .physicallyBased
    result.isDoubleSided = texturePaths.isEmpty
    result.diffuse.magnificationFilter = diffuseFilter
    result.diffuse.minificationFilter = diffuseFilter
    result.diffuse.mipFilter = diffuseFilter
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
    let deduplicateOrientedFaces = requiresCoincidentFaceCanonicalization(recipe.model)
    if !asset.hideNodes.isEmpty || deduplicateOrientedFaces {
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
                label: recipe.model,
                deduplicateOrientedFaces: deduplicateOrientedFaces
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

func buildAssembly(asset: AssetRecipe, sourceRoot: URL) throws -> SCNNode {
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
    return assembly
}

func buildRoadEdgeTurntable(asset: AssetRecipe, sourceRoot: URL) throws -> SCNNode {
    let assembly = try buildAssembly(asset: asset, sourceRoot: sourceRoot)
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

func addWorldBox(
    to node: SCNNode,
    size: [Double],
    position: SCNVector3,
    material: SCNMaterial,
    chamferRadius: Double = 0
) {
    let box = SCNBox(
        width: CGFloat(size[0]),
        height: CGFloat(size[1]),
        length: CGFloat(size[2]),
        chamferRadius: CGFloat(chamferRadius)
    )
    box.materials = [material]
    let detail = SCNNode(geometry: box)
    detail.position = position
    node.addChildNode(detail)
}

func baseCyanBandRatios(for category: String) -> [Double] {
    switch category {
    case "drone": return [0.48]
    case "wallMedium", "wallHigh": return [0.34, 0.68]
    default: return [0.34]
    }
}

func normalizedArmorHalfDepth(sourceDepth: Double, horizontalScale: Double) throws -> Double {
    let halfDepth = sourceDepth * horizontalScale / 2
    guard sourceDepth.isFinite,
          horizontalScale.isFinite,
          sourceDepth > 0,
          horizontalScale > 0,
          halfDepth.isFinite,
          halfDepth > 0 else {
        throw RenderError.validation("Upright armor depth must be finite and positive")
    }
    return halfDepth
}

func generatedConduitInset(worldWidth: Double, conduitWidth: Double) throws -> Double {
    guard worldWidth.isFinite,
          conduitWidth.isFinite,
          worldWidth > 0,
          conduitWidth > 0,
          conduitWidth < worldWidth else {
        throw RenderError.validation("Generated conduit dimensions must be finite, positive, and narrower than the asset")
    }
    return min(worldWidth / 2 - conduitWidth / 2, conduitWidth / 2)
}

func addUprightDetails(
    to turntable: SCNNode,
    asset: AssetRecipe,
    armorHalfDepth: Double
) throws {
    guard let dimensions = WORLD_GEOMETRY[asset.category],
          let bounds = WORLD_BOUNDS[asset.category],
          armorHalfDepth.isFinite,
          armorHalfDepth > 0 else {
        throw RenderError.validation("\(asset.id) has no declared upright geometry")
    }
    let cyan = flatMaterial(srgb(0x68, 0xe8, 0xff), emission: srgb(0x68, 0xe8, 0xff))
    let orange = flatMaterial(srgb(0xff, 0x8a, 0x42), emission: srgb(0xff, 0x8a, 0x42))
    let steel = flatMaterial(srgb(0x64, 0x78, 0x8e))
    let seamHeight = max(6, min(dimensions.worldHeight * 0.018, 18))
    let seamDepth = 8.0
    let seamYRatios = baseCyanBandRatios(for: asset.category)
    for seamYRatio in seamYRatios {
        addWorldBox(
            to: turntable,
            size: [dimensions.worldWidth * 0.48, seamHeight, seamDepth],
            position: SCNVector3(
                0,
                dimensions.baseY + dimensions.worldHeight * seamYRatio,
                armorHalfDepth + seamDepth / 2
            ),
            material: cyan,
            chamferRadius: seamHeight / 2
        )
    }

    let lightRadius = max(5, min(dimensions.worldHeight * 0.018, 18))
    let statusYRatio = seamYRatios[0]
    for (index, side) in [-1.0, 1.0].enumerated() {
        let sphere = SCNSphere(radius: CGFloat(lightRadius))
        sphere.segmentCount = 16
        sphere.materials = [index == 0 ? cyan : orange]
        let light = SCNNode(geometry: sphere)
        light.position = SCNVector3(
            side * dimensions.worldWidth * 0.22,
            dimensions.baseY + dimensions.worldHeight * statusYRatio,
            armorHalfDepth + lightRadius * 0.72
        )
        turntable.addChildNode(light)
    }

    if asset.category == "wallHigh" {
        let gold = flatMaterial(srgb(0xff, 0xd6, 0x6b), emission: srgb(0xff, 0xd6, 0x6b))
        let beaconRadius = 18.0
        let beacon = SCNSphere(radius: CGFloat(beaconRadius))
        beacon.segmentCount = 20
        beacon.materials = [gold]
        let beaconNode = SCNNode(geometry: beacon)
        beaconNode.position = SCNVector3(0, bounds.maxY - beaconRadius, 0)
        turntable.addChildNode(beaconNode)
    }

    if let details = asset.generatedDetails {
        addWorldBox(
            to: turntable,
            size: details.plinthSize,
            position: SCNVector3(0, dimensions.baseY + details.plinthSize[1] / 2, 0),
            material: steel,
            chamferRadius: min(details.plinthSize[1], details.plinthSize[2]) * 0.12
        )
        let conduitInset = try generatedConduitInset(
            worldWidth: dimensions.worldWidth,
            conduitWidth: details.conduitSize[0]
        )
        for side in [-1.0, 1.0] {
            addWorldBox(
                to: turntable,
                size: details.conduitSize,
                position: SCNVector3(side * conduitInset, details.conduitY, 0),
                material: cyan,
                chamferRadius: min(details.conduitSize[0], details.conduitSize[1]) * 0.25
            )
        }
        for bandY in details.cyanBandY {
            addWorldBox(
                to: turntable,
                size: [dimensions.worldWidth * 0.72, 12, 6],
                position: SCNVector3(0, bandY, bounds.maxZ + 3),
                material: cyan,
                chamferRadius: 6
            )
        }
    }
}

func buildUprightTurntable(asset: AssetRecipe, sourceRoot: URL) throws -> UprightTurntable {
    guard let dimensions = WORLD_GEOMETRY[asset.category] else {
        throw RenderError.validation("\(asset.id) has no upright geometry")
    }
    let assembly = try buildAssembly(asset: asset, sourceRoot: sourceRoot)
    let (minimum, maximum) = try usableBounds(of: assembly, label: asset.id)
    let sourceWidth = Double(maximum.x - minimum.x)
    let sourceHeight = Double(maximum.y - minimum.y)
    let sourceDepth = Double(maximum.z - minimum.z)
    let scaleX = dimensions.worldWidth / sourceWidth
    let scaleY = dimensions.worldHeight / sourceHeight
    guard [sourceWidth, sourceHeight, sourceDepth, scaleX, scaleY].allSatisfy({ $0.isFinite && $0 > 0 }) else {
        throw RenderError.load("\(asset.id) has non-finite or zero armor bounds")
    }
    let centered = SCNNode()
    assembly.position = SCNVector3(
        -(minimum.x + maximum.x) / 2,
        -minimum.y,
        -(minimum.z + maximum.z) / 2
    )
    centered.addChildNode(assembly)

    let normalizedArmor = SCNNode()
    normalizedArmor.scale = SCNVector3(scaleX, scaleY, scaleX)
    normalizedArmor.position = SCNVector3(0, dimensions.baseY, 0)
    normalizedArmor.addChildNode(centered)

    let turntable = SCNNode()
    turntable.addChildNode(normalizedArmor)
    let armorHalfDepth = try normalizedArmorHalfDepth(
        sourceDepth: sourceDepth,
        horizontalScale: scaleX
    )
    try addUprightDetails(to: turntable, asset: asset, armorHalfDepth: armorHalfDepth)
    return UprightTurntable(node: turntable, detailFrontZ: armorHalfDepth)
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

func addRoadEdgeCamera(to scene: SCNScene) -> SCNNode {
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

func addUprightCamera(
    to scene: SCNScene,
    worldBounds: WorldBoundsMetadata,
    frame: UprightFrameContract
) throws -> (cameraNode: SCNNode, target: SCNNode, pixelsPerWorldUnit: Double, distance: Double) {
    let centerY = (worldBounds.minY + worldBounds.maxY) / 2
    let halfWidth = (worldBounds.maxX - worldBounds.minX) / 2
    let halfHeight = (worldBounds.maxY - worldBounds.minY) / 2
    let halfDepth = (worldBounds.maxZ - worldBounds.minZ) / 2
    let radius = sqrt(halfWidth * halfWidth + halfHeight * halfHeight + halfDepth * halfDepth)
    let orthographicScale = radius * 2 / 0.78
    let pixelsPerWorldUnit = Double(frame.height) / (orthographicScale * 2)
    let distance = max(radius * 4, 1_000)
    guard [centerY, radius, orthographicScale, pixelsPerWorldUnit, distance]
        .allSatisfy({ $0.isFinite }), radius > 0, pixelsPerWorldUnit > 0 else {
        throw RenderError.render("Upright camera has invalid world bounds")
    }

    let target = SCNNode()
    target.position = SCNVector3(0, centerY, 0)
    scene.rootNode.addChildNode(target)

    let camera = SCNCamera()
    camera.usesOrthographicProjection = true
    camera.orthographicScale = orthographicScale
    camera.zNear = 0.1
    camera.zFar = distance * 3
    camera.wantsHDR = false
    camera.exposureOffset = 0
    camera.whitePoint = 1
    let cameraNode = SCNNode()
    cameraNode.camera = camera
    let lookAt = SCNLookAtConstraint(target: target)
    lookAt.isGimbalLockEnabled = true
    cameraNode.constraints = [lookAt]
    scene.rootNode.addChildNode(cameraNode)
    return (cameraNode, target, pixelsPerWorldUnit, distance)
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

func renderRoadEdgeFrames(
    asset: AssetRecipe,
    sourceRoot: URL,
    frame: RoadEdgeFrameContract
) throws -> [CGImage] {
    let scene = SCNScene()
    scene.background.contents = NSColor.clear
    scene.lightingEnvironment.intensity = 0
    let turntable = try buildRoadEdgeTurntable(asset: asset, sourceRoot: sourceRoot)
    scene.rootNode.addChildNode(turntable)
    addLighting(to: scene)
    let cameraNode = addRoadEdgeCamera(to: scene)

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
        turntable.eulerAngles.y = CGFloat(Double(yaw) * radiansPerDegree)
        let image = renderer.snapshot(
            atTime: 0,
            with: CGSize(width: renderWidth, height: renderHeight),
            antialiasingMode: .multisampling4X
        )
        frames.append(try cgImage(from: image, expectedWidth: renderWidth, expectedHeight: renderHeight))
    }
    return frames
}

func renderUprightCells(
    asset: AssetRecipe,
    sourceRoot: URL,
    frame: UprightFrameContract,
    worldBounds: WorldBoundsMetadata
) throws -> (cells: [UprightRenderedCell], pixelsPerWorldUnit: Double, detailFrontZ: Double) {
    let scene = SCNScene()
    scene.background.contents = NSColor.clear
    scene.lightingEnvironment.intensity = 0
    let turntable = try buildUprightTurntable(asset: asset, sourceRoot: sourceRoot)
    scene.rootNode.addChildNode(turntable.node)
    addLighting(to: scene)
    let camera = try addUprightCamera(to: scene, worldBounds: worldBounds, frame: frame)

    let renderer = SCNRenderer(device: nil, options: nil)
    renderer.scene = scene
    renderer.pointOfView = camera.cameraNode
    renderer.autoenablesDefaultLighting = false
    renderer.isJitteringEnabled = false
    guard renderer.prepare(scene, shouldAbortBlock: nil) else {
        throw RenderError.render("SceneKit could not prepare \(asset.id) before snapshot rendering")
    }

    let renderWidth = frame.width * supersample
    let renderHeight = frame.height * supersample
    var cells: [UprightRenderedCell] = []
    cells.reserveCapacity(frame.yawDegrees.count * frame.pitchDegrees.count)
    for pitch in frame.pitchDegrees {
        let pitchRadians = Double(pitch) * radiansPerDegree
        camera.cameraNode.position = SCNVector3(
            0,
            camera.target.position.y + camera.distance * sin(pitchRadians),
            camera.distance * cos(pitchRadians)
        )
        for yaw in frame.yawDegrees {
            turntable.node.eulerAngles.y = CGFloat(Double(yaw) * radiansPerDegree)
            let image = renderer.snapshot(
                atTime: 0,
                with: CGSize(width: renderWidth, height: renderHeight),
                antialiasingMode: .multisampling4X
            )
            let cgFrame = try cgImage(from: image, expectedWidth: renderWidth, expectedHeight: renderHeight)
            let pixels = try downsampledPremultipliedRGBA(
                cgFrame,
                width: frame.width,
                height: frame.height
            )
            let projected = renderer.projectPoint(SCNVector3Zero)
            cells.append(UprightRenderedCell(
                pixels: pixels,
                projectedOrigin: PixelPoint(x: Double(projected.x), y: Double(projected.y))
            ))
        }
    }
    return (cells, camera.pixelsPerWorldUnit, turntable.detailFrontZ)
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

func downsampledPremultipliedRGBA(_ image: CGImage, width: Int, height: Int) throws -> [UInt8] {
    guard width > 0, height > 0 else {
        throw RenderError.render("Could not downsample a frame to non-positive dimensions")
    }
    let bytesPerRow = width * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * height)
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo
    ) else {
        throw RenderError.render("Could not create the upright downsample canvas")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
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
    frame: RoadEdgeFrameContract,
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

func roundedToSixPlaces(_ value: Double) -> Double {
    let rounded = (value * 1_000_000).rounded() / 1_000_000
    return rounded == 0 ? 0 : rounded
}

func validateUprightAtlasMetadata(
    _ metadata: UprightAtlasMetadata,
    expectedWorldBounds: WorldBoundsMetadata,
    assetID: String
) throws {
    guard metadata.layout == "upright" else {
        throw RenderError.validation("\(assetID) metadata layout must be upright")
    }
    guard metadata.atlasWidth == 2_240,
          metadata.atlasHeight == 960,
          metadata.frameWidth == 320,
          metadata.frameHeight == 320 else {
        throw RenderError.validation("\(assetID) upright metadata must use 2240x960 with 320x320 cells")
    }
    guard metadata.yawDegrees == requiredFrames.upright.yawDegrees,
          metadata.pitchDegrees == requiredFrames.upright.pitchDegrees else {
        throw RenderError.validation("\(assetID) upright metadata has invalid yaw/pitch arrays")
    }
    let boundsValues = [
        metadata.worldBounds.minX, metadata.worldBounds.maxX,
        metadata.worldBounds.minY, metadata.worldBounds.maxY,
        metadata.worldBounds.minZ, metadata.worldBounds.maxZ,
    ]
    guard boundsValues.allSatisfy(\.isFinite),
          metadata.worldBounds == expectedWorldBounds else {
        throw RenderError.validation("\(assetID) upright metadata has invalid world bounds")
    }
    guard metadata.detailFrontZ.isFinite,
          metadata.detailFrontZ > 0,
          roundedToSixPlaces(metadata.detailFrontZ) == metadata.detailFrontZ else {
        throw RenderError.validation("\(assetID) detailFrontZ must be finite, positive, and rounded")
    }
    guard metadata.pixelsPerWorldUnit.isFinite,
          metadata.pixelsPerWorldUnit > 0 else {
        throw RenderError.validation("\(assetID) pixelsPerWorldUnit must be finite and positive")
    }
    guard roundedToSixPlaces(metadata.pixelsPerWorldUnit) == metadata.pixelsPerWorldUnit else {
        throw RenderError.validation("\(assetID) pixelsPerWorldUnit must be rounded to six places")
    }
    guard metadata.frames.count == 21 else {
        throw RenderError.validation("\(assetID) upright metadata must contain exactly 21 frames")
    }
    for (frameIndex, record) in metadata.frames.enumerated() {
        guard record.source.sw > 0, record.source.sh > 0 else {
            throw RenderError.validation("\(assetID) frame \(frameIndex) source must be non-empty")
        }
        let column = frameIndex % 7
        let row = frameIndex / 7
        let cellMinX = column * metadata.frameWidth
        let cellMinY = row * metadata.frameHeight
        let cellMaxX = cellMinX + metadata.frameWidth
        let cellMaxY = cellMinY + metadata.frameHeight
        guard record.source.sx >= cellMinX,
              record.source.sy >= cellMinY,
              record.source.sx + record.source.sw <= cellMaxX,
              record.source.sy + record.source.sh <= cellMaxY else {
            throw RenderError.validation("\(assetID) frame \(frameIndex) source must stay inside its own cell")
        }
        guard record.origin.x.isFinite, record.origin.y.isFinite else {
            throw RenderError.validation("\(assetID) frame \(frameIndex) origin must be finite")
        }
        guard roundedToSixPlaces(record.origin.x) == record.origin.x,
              roundedToSixPlaces(record.origin.y) == record.origin.y else {
            throw RenderError.validation("\(assetID) frame \(frameIndex) origin must be rounded to six places")
        }
    }
}

func validateTransparentUprightCellPadding(
    _ pixels: [UInt8],
    width: Int,
    height: Int,
    assetID: String,
    frameIndex: Int
) throws {
    let bytesPerRow = width * 4
    guard width > 0, height > 0, pixels.count == bytesPerRow * height else {
        throw RenderError.render("\(assetID) frame \(frameIndex) has wrong cell dimensions")
    }
    for x in 0..<width {
        let top = pixels[x * 4 + 3]
        let bottom = pixels[(height - 1) * bytesPerRow + x * 4 + 3]
        guard top == 0, bottom == 0 else {
            throw RenderError.render("\(assetID) frame \(frameIndex) has alpha on a cell edge")
        }
    }
    for y in 0..<height {
        let left = pixels[y * bytesPerRow + 3]
        let right = pixels[y * bytesPerRow + (width - 1) * 4 + 3]
        guard left == 0, right == 0 else {
            throw RenderError.render("\(assetID) frame \(frameIndex) has alpha on a cell edge")
        }
    }
}

func makeUprightAtlas(
    cells: [UprightRenderedCell],
    frame: UprightFrameContract,
    worldBounds: WorldBoundsMetadata,
    detailFrontZ: Double,
    pixelsPerWorldUnit: Double,
    supersample: Int,
    assetID: String
) throws -> UprightAtlasProduct {
    guard frame == requiredFrames.upright else {
        throw RenderError.render("\(assetID) must use the strict 7x3 upright frame contract")
    }
    let frameCount = frame.yawDegrees.count * frame.pitchDegrees.count
    guard cells.count == frameCount, frameCount == 21 else {
        throw RenderError.render("\(assetID) must contain exactly 21 pitch-major cells")
    }
    guard supersample > 0 else {
        throw RenderError.render("\(assetID) supersample must be positive")
    }
    guard pixelsPerWorldUnit.isFinite, pixelsPerWorldUnit > 0 else {
        throw RenderError.render("\(assetID) pixelsPerWorldUnit must be finite and positive")
    }
    guard detailFrontZ.isFinite, detailFrontZ > 0 else {
        throw RenderError.render("\(assetID) detailFrontZ must be finite and positive")
    }
    let atlasWidth = frame.width * frame.yawDegrees.count
    let atlasHeight = frame.height * frame.pitchDegrees.count
    guard atlasWidth == 2_240, atlasHeight == 960 else {
        throw RenderError.render("\(assetID) upright atlas must be 2240x960")
    }
    let cellBytesPerRow = frame.width * 4
    let atlasBytesPerRow = atlasWidth * 4
    var atlasPixels = [UInt8](repeating: 0, count: atlasBytesPerRow * atlasHeight)
    var records: [UprightFrameMetadata] = []
    records.reserveCapacity(frameCount)

    for (frameIndex, cell) in cells.enumerated() {
        guard cell.pixels.count == cellBytesPerRow * frame.height else {
            throw RenderError.render("\(assetID) frame \(frameIndex) has wrong cell dimensions")
        }
        guard cell.projectedOrigin.x.isFinite, cell.projectedOrigin.y.isFinite else {
            throw RenderError.render("\(assetID) frame \(frameIndex) projected origin must be finite")
        }
        var normalized = cell.pixels
        for pixelOffset in stride(from: 0, to: normalized.count, by: 4) {
            let alpha = normalized[pixelOffset + 3]
            if alpha == 0 {
                normalized[pixelOffset] = 0
                normalized[pixelOffset + 1] = 0
                normalized[pixelOffset + 2] = 0
            } else {
                normalized[pixelOffset] = quantizedPremultipliedChannel(normalized[pixelOffset], alpha: alpha)
                normalized[pixelOffset + 1] = quantizedPremultipliedChannel(
                    normalized[pixelOffset + 1], alpha: alpha
                )
                normalized[pixelOffset + 2] = quantizedPremultipliedChannel(
                    normalized[pixelOffset + 2], alpha: alpha
                )
            }
        }
        canonicalizeIsolatedOpaqueNoise(
            &normalized,
            width: frame.width,
            height: frame.height,
            bytesPerRow: cellBytesPerRow
        )
        try validateTransparentUprightCellPadding(
            normalized,
            width: frame.width,
            height: frame.height,
            assetID: assetID,
            frameIndex: frameIndex
        )
        _ = try alphaBounds(
            normalized,
            width: frame.width,
            height: frame.height,
            bytesPerRow: cellBytesPerRow,
            threshold: 16
        )
        let runtimeBounds = try alphaBounds(
            normalized,
            width: frame.width,
            height: frame.height,
            bytesPerRow: cellBytesPerRow,
            threshold: 1
        )
        let column = frameIndex % frame.yawDegrees.count
        let row = frameIndex / frame.yawDegrees.count
        let cellOffsetX = column * frame.width
        let cellOffsetY = row * frame.height
        for cellY in 0..<frame.height {
            let sourceStart = cellY * cellBytesPerRow
            let destinationStart = (cellOffsetY + cellY) * atlasBytesPerRow + cellOffsetX * 4
            atlasPixels.replaceSubrange(
                destinationStart..<(destinationStart + cellBytesPerRow),
                with: normalized[sourceStart..<(sourceStart + cellBytesPerRow)]
            )
        }

        let localOriginX = cell.projectedOrigin.x / Double(supersample)
        let topLeftY = Double(frame.height) - cell.projectedOrigin.y / Double(supersample)
        let absoluteOrigin = PixelPoint(
            x: roundedToSixPlaces(Double(cellOffsetX) + localOriginX),
            y: roundedToSixPlaces(Double(cellOffsetY) + topLeftY)
        )
        records.append(UprightFrameMetadata(
            source: PixelRect(
                sx: cellOffsetX + runtimeBounds.minX,
                sy: cellOffsetY + runtimeBounds.minY,
                sw: runtimeBounds.width,
                sh: runtimeBounds.height
            ),
            origin: absoluteOrigin
        ))
    }

    let roundedBounds = WorldBoundsMetadata(
        minX: roundedToSixPlaces(worldBounds.minX),
        maxX: roundedToSixPlaces(worldBounds.maxX),
        minY: roundedToSixPlaces(worldBounds.minY),
        maxY: roundedToSixPlaces(worldBounds.maxY),
        minZ: roundedToSixPlaces(worldBounds.minZ),
        maxZ: roundedToSixPlaces(worldBounds.maxZ)
    )
    let metadata = UprightAtlasMetadata(
        layout: "upright",
        atlasWidth: atlasWidth,
        atlasHeight: atlasHeight,
        frameWidth: frame.width,
        frameHeight: frame.height,
        yawDegrees: frame.yawDegrees,
        pitchDegrees: frame.pitchDegrees,
        detailFrontZ: roundedToSixPlaces(detailFrontZ),
        worldBounds: roundedBounds,
        pixelsPerWorldUnit: roundedToSixPlaces(pixelsPerWorldUnit),
        frames: records
    )
    try validateUprightAtlasMetadata(
        metadata,
        expectedWorldBounds: roundedBounds,
        assetID: assetID
    )
    return UprightAtlasProduct(pixels: atlasPixels, metadata: metadata)
}

func encodePremultipliedPNG(
    pixels sourcePixels: [UInt8],
    width: Int,
    height: Int,
    assetID: String,
    maxFileBytes: Int
) throws -> Data {
    let bytesPerRow = width * 4
    guard width > 0,
          height > 0,
          sourcePixels.count == bytesPerRow * height else {
        throw RenderError.write("Could not encode \(assetID).png with invalid geometry")
    }
    for index in stride(from: 0, to: sourcePixels.count, by: 4) {
        let alpha = sourcePixels[index + 3]
        if alpha == 0 {
            guard sourcePixels[index] == 0,
                  sourcePixels[index + 1] == 0,
                  sourcePixels[index + 2] == 0 else {
                throw RenderError.render("\(assetID) contains hidden RGB")
            }
        }
        guard sourcePixels[index] <= alpha,
              sourcePixels[index + 1] <= alpha,
              sourcePixels[index + 2] <= alpha else {
            throw RenderError.render("\(assetID) contains non-premultiplied color")
        }
    }
    var pixels = sourcePixels
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo
    ), let image = context.makeImage() else {
        throw RenderError.write("Could not create atlas canvas for \(assetID)")
    }
    let bitmap = NSBitmapImageRep(cgImage: image)
    guard bitmap.pixelsWide == width,
          bitmap.pixelsHigh == height,
          let png = bitmap.representation(using: .png, properties: [.compressionFactor: 1]) else {
        throw RenderError.write("Could not encode \(assetID).png")
    }
    guard png.count <= maxFileBytes else {
        throw RenderError.write("\(assetID).png exceeds \(maxFileBytes) bytes")
    }
    return png
}

private struct RendererReport: Encodable {
    let rendererSha256: String
    let sourceHashes: [String: String]
    let outputHashes: [String: String]
    let uprightAtlases: [String: UprightAtlasMetadata]
}

func deterministicJSON<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    do {
        return try encoder.encode(value)
    } catch {
        throw RenderError.write("Could not encode deterministic JSON: \(error)")
    }
}

func validateCanonicalUprightMetadataKeys(_ atlases: [String: UprightAtlasMetadata]) throws {
    guard Set(atlases.keys) == Set(canonicalUprightIDs), atlases.count == canonicalUprightIDs.count else {
        throw RenderError.validation("uprightAtlases must contain the twelve canonical IDs")
    }
}

func encodeRendererReport(
    rendererSha256: String,
    sourceHashes: [String: String],
    outputHashes: [String: String],
    uprightAtlases: [String: UprightAtlasMetadata]
) throws -> Data {
    try validateCanonicalUprightMetadataKeys(uprightAtlases)
    return try deterministicJSON(RendererReport(
        rendererSha256: rendererSha256,
        sourceHashes: sourceHashes,
        outputHashes: outputHashes,
        uprightAtlases: uprightAtlases
    ))
}

func encodeUprightMetadataJavaScript(_ atlases: [String: UprightAtlasMetadata]) throws -> Data {
    try validateCanonicalUprightMetadataKeys(atlases)
    var lines = [
        "const GENERATED_UPRIGHT_ATLAS_DATA = (() => {",
        "  const deepFreeze = (value) => {",
        "    if (value && typeof value === 'object' && !Object.isFrozen(value)) {",
        "      for (const child of Object.values(value)) deepFreeze(child);",
        "      Object.freeze(value);",
        "    }",
        "    return value;",
        "  };",
        "  return deepFreeze({",
    ]
    for (index, id) in canonicalUprightIDs.enumerated() {
        guard let metadata = atlases[id] else {
            throw RenderError.validation("Missing upright metadata for \(id)")
        }
        let encoded = try deterministicJSON(metadata)
        guard let object = String(data: encoded, encoding: .utf8) else {
            throw RenderError.write("Could not encode metadata JavaScript for \(id)")
        }
        let comma = index + 1 == canonicalUprightIDs.count ? "" : ","
        lines.append("    \(String(reflecting: id)): \(object)\(comma)")
    }
    lines.append(contentsOf: [
        "  });",
        "})();",
        "",
    ])
    return Data(lines.joined(separator: "\n").utf8)
}

func makeRoadEdgeAtlas(
    frames: [CGImage],
    frame: RoadEdgeFrameContract,
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

struct RenderAllResult {
    let outputHashes: [String: String]
    let uprightAtlases: [String: UprightAtlasMetadata]
}

private struct PreparedAtlas {
    let id: String
    let layout: String
    let png: Data
}

func renderAll(arguments: Arguments, manifest: WorldManifest) throws -> RenderAllResult {
    let uprightAssets = manifest.assets.filter { $0.layout == "upright" }
    let roadEdgeAssets = manifest.assets.filter { $0.layout == "roadEdge" }
    let uprightDecodedBytes = uprightAssets.count * 2_240 * 960 * 4
    let roadEdgeDecodedBytes = roadEdgeAssets.count * 3_584 * 512 * 4
    guard uprightDecodedBytes == 103_219_200,
          uprightDecodedBytes <= manifest.budgets.upright.maxDecodedBytes else {
        throw RenderError.write("Decoded upright atlases exceed the 112 MiB budget")
    }
    guard roadEdgeDecodedBytes <= manifest.budgets.roadEdge.maxDecodedBytes else {
        throw RenderError.write("Decoded roadEdge atlases exceed their separate budget")
    }

    var prepared: [PreparedAtlas] = []
    var uprightAtlases: [String: UprightAtlasMetadata] = [:]
    for asset in manifest.assets {
        if asset.layout == "upright" {
            guard let worldBounds = WORLD_BOUNDS[asset.category] else {
                throw RenderError.validation("\(asset.id) has no upright world bounds")
            }
            let rendered: (Data, UprightAtlasMetadata) = try autoreleasepool {
                let raw = try renderUprightCells(
                    asset: asset,
                    sourceRoot: arguments.sourceRoot,
                    frame: manifest.frames.upright,
                    worldBounds: worldBounds
                )
                let product = try makeUprightAtlas(
                    cells: raw.cells,
                    frame: manifest.frames.upright,
                    worldBounds: worldBounds,
                    detailFrontZ: raw.detailFrontZ,
                    pixelsPerWorldUnit: raw.pixelsPerWorldUnit,
                    supersample: supersample,
                    assetID: asset.id
                )
                try validateUprightAtlasMetadata(
                    product.metadata,
                    expectedWorldBounds: worldBounds,
                    assetID: asset.id
                )
                let png = try encodePremultipliedPNG(
                    pixels: product.pixels,
                    width: product.metadata.atlasWidth,
                    height: product.metadata.atlasHeight,
                    assetID: asset.id,
                    maxFileBytes: manifest.budgets.upright.maxFileBytes
                )
                return (png, product.metadata)
            }
            prepared.append(PreparedAtlas(id: asset.id, layout: asset.layout, png: rendered.0))
            uprightAtlases[asset.id] = rendered.1
        } else {
            guard let framing = manifest.framing[asset.category] else {
                throw RenderError.validation("\(asset.id) has no legacy roadEdge framing contract")
            }
            let png = try autoreleasepool {
                let frames = try renderRoadEdgeFrames(
                    asset: asset,
                    sourceRoot: arguments.sourceRoot,
                    frame: manifest.frames.roadEdge
                )
                return try makeRoadEdgeAtlas(
                    frames: frames,
                    frame: manifest.frames.roadEdge,
                    framing: framing,
                    assetID: asset.id
                )
            }
            guard png.count <= manifest.budgets.roadEdge.maxFileBytes else {
                throw RenderError.write("\(asset.id).png exceeds the roadEdge file budget")
            }
            prepared.append(PreparedAtlas(id: asset.id, layout: asset.layout, png: png))
        }
    }

    try validateCanonicalUprightMetadataKeys(uprightAtlases)
    let uprightCompressedBytes = prepared
        .filter { $0.layout == "upright" }
        .reduce(0) { $0 + $1.png.count }
    let roadEdgeCompressedBytes = prepared
        .filter { $0.layout == "roadEdge" }
        .reduce(0) { $0 + $1.png.count }
    guard uprightCompressedBytes <= manifest.budgets.upright.maxCombinedBytes else {
        throw RenderError.write("Compressed upright atlases exceed the 30 MiB budget")
    }
    guard roadEdgeCompressedBytes <= manifest.budgets.roadEdge.maxCombinedBytes else {
        throw RenderError.write("Compressed roadEdge atlases exceed their separate legacy total budget")
    }

    let metadataJavaScript = try encodeUprightMetadataJavaScript(uprightAtlases)
    do {
        try FileManager.default.createDirectory(at: arguments.output, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            at: arguments.metadataJS.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try metadataJavaScript.write(to: arguments.metadataJS, options: .atomic)
    } catch {
        throw RenderError.write("Could not write metadata JavaScript: \(error)")
    }

    var outputHashes: [String: String] = [:]
    for atlas in prepared {
        let outputURL = arguments.output.appendingPathComponent("\(atlas.id).png")
        do {
            try atlas.png.write(to: outputURL, options: .atomic)
        } catch {
            throw RenderError.write("Could not write \(outputURL.path): \(error)")
        }
        outputHashes["\(atlas.id).png"] = sha256Hex(atlas.png)
    }
    return RenderAllResult(outputHashes: outputHashes, uprightAtlases: uprightAtlases)
}

#if !WORLD_CANONICALIZER_TEST
do {
    let arguments = try Arguments(CommandLine.arguments)
    let manifest = try loadAndValidateManifest(arguments: arguments)
    let rendered = try renderAll(arguments: arguments, manifest: manifest)
    let rendererURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
    let encoded = try encodeRendererReport(
        rendererSha256: try sha256Hex(at: rendererURL),
        sourceHashes: manifest.sourceHashes,
        outputHashes: rendered.outputHashes,
        uprightAtlases: rendered.uprightAtlases
    )
    guard let line = String(data: encoded, encoding: .utf8) else {
        throw RenderError.write("Could not encode renderer report")
    }
    print(line)
} catch {
    FileHandle.standardError.write(Data("render-world-assets: \(error)\n".utf8))
    exit(1)
}
#endif
