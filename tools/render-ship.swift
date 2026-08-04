#!/usr/bin/env swift

import AppKit
import Foundation
import SceneKit

struct Arguments {
    let model: URL
    let texture: URL
    let neutral: URL
    let thrust: URL
    let icon: URL?

    init(_ values: [String]) throws {
        var parsed: [String: String] = [:]
        var index = 1
        while index < values.count {
            guard index + 1 < values.count else {
                throw RenderError.usage("Missing value after \(values[index])")
            }
            parsed[values[index]] = values[index + 1]
            index += 2
        }
        guard let model = parsed["--model"],
              let texture = parsed["--texture"],
              let neutral = parsed["--neutral"],
              let thrust = parsed["--thrust"] else {
            throw RenderError.usage("Usage: render-ship.swift --model Striker.obj --texture Striker_Blue.png --neutral player-neutral.png --thrust player-thrust.png")
        }
        self.model = URL(fileURLWithPath: model)
        self.texture = URL(fileURLWithPath: texture)
        self.neutral = URL(fileURLWithPath: neutral)
        self.thrust = URL(fileURLWithPath: thrust)
        self.icon = parsed["--icon"].map(URL.init(fileURLWithPath:))
    }
}

enum RenderError: Error, CustomStringConvertible {
    case usage(String)
    case load(String)
    case write(String)

    var description: String {
        switch self {
        case .usage(let value), .load(let value), .write(let value): return value
        }
    }
}

private let outputSize = CGSize(width: 512, height: 384)

func material(color: NSColor, emission: NSColor? = nil, transparency: CGFloat = 1) -> SCNMaterial {
    let result = SCNMaterial()
    result.lightingModel = .physicallyBased
    result.diffuse.contents = color
    result.metalness.contents = 0.28
    result.roughness.contents = 0.32
    result.transparency = transparency
    result.blendMode = transparency < 1 ? .add : .alpha
    result.isDoubleSided = true
    if let emission {
        result.emission.contents = emission
        result.lightingModel = .constant
        result.writesToDepthBuffer = false
    }
    return result
}

func prepareModel(scene: SCNScene, textureURL: URL) throws -> SCNNode {
    guard let image = NSImage(contentsOf: textureURL) else {
        throw RenderError.load("Could not load texture at \(textureURL.path)")
    }

    let container = SCNNode()
    let importedChildren = scene.rootNode.childNodes
    guard !importedChildren.isEmpty else {
        throw RenderError.load("The OBJ contains no SceneKit nodes")
    }
    importedChildren.forEach {
        $0.removeFromParentNode()
        container.addChildNode($0)
    }
    container.enumerateChildNodes { node, _ in
        guard let geometry = node.geometry else { return }
        let sourceMaterials = geometry.materials.isEmpty ? [SCNMaterial()] : geometry.materials
        geometry.materials = sourceMaterials.map { _ in
            let ship = SCNMaterial()
            ship.name = "Striker navy flight finish"
            ship.lightingModel = .physicallyBased
            ship.diffuse.contents = image
            ship.multiply.contents = NSColor(calibratedRed: 0.52, green: 0.65, blue: 0.86, alpha: 1)
            ship.metalness.contents = 0.42
            ship.roughness.contents = 0.30
            ship.isDoubleSided = true
            ship.diffuse.magnificationFilter = .linear
            ship.diffuse.minificationFilter = .linear
            ship.diffuse.mipFilter = .linear
            return ship
        }
    }

    let (minimum, maximum) = container.boundingBox
    let center = SCNVector3(
        (minimum.x + maximum.x) / 2,
        (minimum.y + maximum.y) / 2,
        (minimum.z + maximum.z) / 2
    )
    container.position = SCNVector3(-center.x, -center.y, -center.z)
    return container
}

func addGoldAccents(to model: SCNNode) {
    let gold = material(color: NSColor(calibratedRed: 0.80, green: 0.57, blue: 0.18, alpha: 1))
    for side: Float in [-1, 1] {
        let geometry = SCNBox(width: 0.13, height: 0.045, length: 1.22, chamferRadius: 0.025)
        geometry.materials = [gold]
        let accent = SCNNode(geometry: geometry)
        accent.position = SCNVector3(side * 0.72, 0.12, -0.45)
        accent.eulerAngles.y = CGFloat(side) * 0.05
        model.addChildNode(accent)
    }
}

func addExhaust(to model: SCNNode) {
    let outerMaterial = material(
        color: NSColor(calibratedRed: 0.05, green: 0.58, blue: 0.88, alpha: 0.24),
        emission: NSColor(calibratedRed: 0.04, green: 0.62, blue: 0.88, alpha: 1),
        transparency: 0.36
    )
    let coreMaterial = material(
        color: NSColor(calibratedRed: 0.30, green: 0.86, blue: 1.0, alpha: 0.52),
        emission: NSColor(calibratedRed: 0.16, green: 0.78, blue: 1.0, alpha: 1),
        transparency: 0.52
    )
    for side: Float in [-1, 1] {
        let outer = SCNCone(topRadius: 0.025, bottomRadius: 0.11, height: 0.72)
        outer.materials = [outerMaterial]
        let outerNode = SCNNode(geometry: outer)
        outerNode.position = SCNVector3(side * 0.88, -0.58, -2.62)
        outerNode.eulerAngles.x = .pi / 2
        model.addChildNode(outerNode)

        let core = SCNCone(topRadius: 0.008, bottomRadius: 0.035, height: 0.40)
        core.materials = [coreMaterial]
        let coreNode = SCNNode(geometry: core)
        coreNode.position = SCNVector3(side * 0.88, -0.58, -2.47)
        coreNode.eulerAngles.x = .pi / 2
        model.addChildNode(coreNode)
    }
}

func addLights(to scene: SCNScene) {
    let ambient = SCNLight()
    ambient.type = .ambient
    ambient.color = NSColor(calibratedRed: 0.10, green: 0.15, blue: 0.24, alpha: 1)
    ambient.intensity = 420
    let ambientNode = SCNNode()
    ambientNode.light = ambient
    scene.rootNode.addChildNode(ambientNode)

    let key = SCNLight()
    key.type = .directional
    key.color = NSColor(calibratedRed: 0.67, green: 0.83, blue: 1.0, alpha: 1)
    key.intensity = 1750
    key.castsShadow = true
    key.shadowRadius = 5
    let keyNode = SCNNode()
    keyNode.light = key
    keyNode.eulerAngles = SCNVector3(-0.85, -0.72, -0.20)
    scene.rootNode.addChildNode(keyNode)

    let rim = SCNLight()
    rim.type = .directional
    rim.color = NSColor(calibratedRed: 0.02, green: 0.89, blue: 1.0, alpha: 1)
    rim.intensity = 1200
    let rimNode = SCNNode()
    rimNode.light = rim
    rimNode.eulerAngles = SCNVector3(0.45, 2.25, 0)
    scene.rootNode.addChildNode(rimNode)
}

func makeCamera(in scene: SCNScene) {
    let target = SCNNode()
    target.position = SCNVector3(0, -0.18, 0.15)
    scene.rootNode.addChildNode(target)

    let camera = SCNCamera()
    camera.usesOrthographicProjection = true
    camera.orthographicScale = 2.35
    camera.zNear = 0.1
    camera.zFar = 100
    camera.wantsHDR = true
    camera.bloomIntensity = 0.16
    camera.bloomThreshold = 1.05
    camera.bloomBlurRadius = 4
    camera.exposureOffset = 0.05
    camera.whitePoint = 1.0

    let cameraNode = SCNNode()
    cameraNode.camera = camera
    cameraNode.position = SCNVector3(0, 4.7, -12.8)
    let lookAt = SCNLookAtConstraint(target: target)
    lookAt.isGimbalLockEnabled = true
    cameraNode.constraints = [lookAt]
    scene.rootNode.addChildNode(cameraNode)
}

func writePNG(_ image: NSImage, to url: URL) throws {
    guard let tiff = image.tiffRepresentation,
          let representation = NSBitmapImageRep(data: tiff),
          let data = representation.representation(using: .png, properties: [.compressionFactor: 0.92]) else {
        throw RenderError.write("Could not encode PNG for \(url.path)")
    }
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
}

func renderIcon(shipURL: URL, output: URL) throws {
    guard let ship = NSImage(contentsOf: shipURL),
          let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: 1024,
            pixelsHigh: 1024,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
          ),
          let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw RenderError.write("Could not create the app icon canvas")
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let canvas = NSRect(x: 0, y: 0, width: 1024, height: 1024)
    NSColor.clear.setFill()
    canvas.fill()

    let tile = NSBezierPath(roundedRect: NSRect(x: 46, y: 46, width: 932, height: 932), xRadius: 206, yRadius: 206)
    NSGradient(colors: [
        NSColor(calibratedRed: 0.015, green: 0.028, blue: 0.085, alpha: 1),
        NSColor(calibratedRed: 0.025, green: 0.105, blue: 0.18, alpha: 1),
    ])!.draw(in: tile, angle: -72)

    NSGraphicsContext.saveGraphicsState()
    tile.addClip()
    for (index, radius) in [360.0, 286.0, 212.0].enumerated() {
        let ring = NSBezierPath(ovalIn: NSRect(x: 512 - radius, y: 512 - radius, width: radius * 2, height: radius * 2))
        ring.lineWidth = index == 0 ? 8 : 4
        NSColor(calibratedRed: 0.05, green: 0.82, blue: 0.94, alpha: index == 0 ? 0.55 : 0.25).setStroke()
        ring.stroke()
    }
    let axis = NSBezierPath()
    axis.move(to: NSPoint(x: 166, y: 512))
    axis.line(to: NSPoint(x: 858, y: 512))
    axis.move(to: NSPoint(x: 512, y: 166))
    axis.line(to: NSPoint(x: 512, y: 858))
    axis.lineWidth = 3
    NSColor(calibratedRed: 0.15, green: 0.87, blue: 1.0, alpha: 0.22).setStroke()
    axis.stroke()
    NSGraphicsContext.restoreGraphicsState()

    let gold = NSColor(calibratedRed: 0.95, green: 0.68, blue: 0.20, alpha: 0.95)
    gold.setStroke()
    let chevron = NSBezierPath()
    chevron.move(to: NSPoint(x: 268, y: 278))
    chevron.line(to: NSPoint(x: 512, y: 166))
    chevron.line(to: NSPoint(x: 756, y: 278))
    chevron.lineWidth = 18
    chevron.lineCapStyle = .round
    chevron.stroke()

    ship.draw(
        in: NSRect(x: 132, y: 228, width: 760, height: 570),
        from: NSRect(origin: .zero, size: ship.size),
        operation: .sourceOver,
        fraction: 1
    )
    NSGraphicsContext.restoreGraphicsState()
    context.flushGraphics()

    guard let data = bitmap.representation(using: .png, properties: [.compressionFactor: 0.92]) else {
        throw RenderError.write("Could not encode the app icon")
    }
    try data.write(to: output, options: .atomic)
}

func render(arguments: Arguments, output: URL, thrust: Bool) throws {
    let options: [SCNSceneSource.LoadingOption: Any] = [
        .checkConsistency: true,
        .convertToYUp: true,
        .preserveOriginalTopology: true,
    ]
    guard let scene = try? SCNScene(url: arguments.model, options: options) else {
        throw RenderError.load("Could not load model at \(arguments.model.path)")
    }
    scene.background.contents = NSColor.clear
    scene.lightingEnvironment.intensity = 0
    let model = try prepareModel(scene: scene, textureURL: arguments.texture)
    addGoldAccents(to: model)
    if thrust { addExhaust(to: model) }
    scene.rootNode.addChildNode(model)
    addLights(to: scene)
    makeCamera(in: scene)

    let renderer = SCNRenderer(device: nil, options: nil)
    renderer.scene = scene
    renderer.autoenablesDefaultLighting = false
    renderer.isJitteringEnabled = false
    renderer.pointOfView = scene.rootNode.childNodes.first(where: { $0.camera != nil })
    let image = renderer.snapshot(
        atTime: 0,
        with: outputSize,
        antialiasingMode: SCNAntialiasingMode.multisampling4X
    )
    try writePNG(image, to: output)
}

do {
    let arguments = try Arguments(CommandLine.arguments)
    try render(arguments: arguments, output: arguments.neutral, thrust: false)
    try render(arguments: arguments, output: arguments.thrust, thrust: true)
    if let icon = arguments.icon {
        try renderIcon(shipURL: arguments.thrust, output: icon)
    }
    print("Rendered deterministic 512x384 Striker frames")
} catch {
    FileHandle.standardError.write(Data("render-ship: \(error)\n".utf8))
    exit(1)
}
