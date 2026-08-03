import Cocoa
import Darwin
import WebKit

private let appTitle = "星云巡航 Nebula Cruise"

private func bundledIndexURL() -> URL? {
    Bundle.main.url(forResource: "index", withExtension: "html")
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let style: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: style, backing: .buffered, defer: false)
        window.title = appTitle
        window.minSize = NSSize(width: 960, height: 600)
        self.window = window

        let configuration = WKWebViewConfiguration()
        // The app is loaded from its signed bundle. WebKit needs this enabled
        // for fetch() to read sibling audio files granted by loadFileURL below.
        // Its normal user-gesture media policy remains unchanged.
        configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let webView = WKWebView(frame: window.contentView!.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        window.contentView!.addSubview(webView)

        if let url = bundledIndexURL() {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.loadHTMLString(
                "<body style='background:#020611;color:#e9fbff;font-family:system-ui;padding:3rem'>" +
                "<h1>Missing index.html / 缺少 index.html</h1>" +
                "<p>Please rebuild the app. / 请重新构建应用。</p></body>",
                baseURL: nil)
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

final class SmokeDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var finished = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let indexURL = bundledIndexURL() else {
            finish(["ok": false, "error": "missing bundled index.html"], status: 1)
            return
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore.nonPersistent()
        // Smoke mode deliberately grants its synthetic start action the same
        // media permission as a user gesture. Normal launches keep WebKit's
        // default autoplay policy unchanged.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // WKWebView otherwise blocks fetch() for sibling file:// resources,
        // even though loadFileURL grants this directory to normal subresources.
        // This preference is only about bundle-local file access; the media
        // gesture exception above remains confined to this hidden smoke.
        configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 960, height: 600), configuration: configuration)
        webView.navigationDelegate = self
        let window = NSWindow(
            contentRect: webView.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false)
        window.contentView = webView
        window.orderOut(nil)
        self.window = window
        self.webView = webView
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())

        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            self?.finish(["ok": false, "error": "WKWebView smoke timed out after 10 seconds"], status: 1)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        const start = document.getElementById('start-mission');
        if (start) start.click();
        else if (typeof startGame === 'function') startGame();
        if (!globalThis.Skyroads || !globalThis.Skyroads.diagnostics) {
          throw new Error('Skyroads diagnostics unavailable');
        }
        const diagnostics = await globalThis.Skyroads.diagnostics.ready;
        const cssLoaded = getComputedStyle(document.documentElement)
          .getPropertyValue('--cyan').trim().toLowerCase() === '#5de7ff';
        let orbitronLoaded = false;
        if (document.fonts && typeof document.fonts.load === 'function') {
          const faces = await document.fonts.load('500 16px Orbitron');
          orbitronLoaded = faces.length > 0 && document.fonts.check('500 16px Orbitron');
        }
        const scriptsReady = ['version', 'i18n', 'leaderboard', 'presentation', 'worldArt', 'input', 'obstacles', 'audio', 'game']
          .every((name) => diagnostics.scripts && diagnostics.scripts[name] === true);
        const audioReady = diagnostics.audio && diagnostics.audio.status === 'ready'
          && diagnostics.audio.decoded === true && ['ogg', 'mp3'].includes(diagnostics.audio.format);
        const shipReady = diagnostics.visualAssets && diagnostics.visualAssets.shipFramesReady === true;
        const world = diagnostics.visualAssets && diagnostics.visualAssets.world;
        const worldAtlases = ['droneScout', 'droneStriker', 'turretSentry', 'turretHeavy', 'barrierRail',
          'barrierCrate', 'structurePylon', 'structureBastion', 'structureReactor', 'structureTower',
          'corridorLow', 'corridorMedium', 'gapEdge'];
        const worldReady = world && Array.isArray(world.loaded) && world.loaded.length === worldAtlases.length
          && worldAtlases.every((atlas) => world.loaded.includes(atlas))
          && Array.isArray(world.fallback) && world.fallback.length === 0
          && ['drone', 'turret', 'wallLow', 'wallMedium', 'wallHigh', 'corridorLow', 'corridorMedium', 'gap']
            .every((category) => world.categoryReady && world.categoryReady[category] === true);
        return JSON.stringify({
          ok: diagnostics.initialized === true && scriptsReady && cssLoaded && shipReady && worldReady
            && orbitronLoaded && audioReady,
          cssLoaded,
          orbitronLoaded,
          diagnostics,
        });
        """

        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
            switch result {
            case .success(let value):
                guard let json = value as? String,
                      let data = json.data(using: .utf8),
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      JSONSerialization.isValidJSONObject(object) else {
                    self?.finish(["ok": false, "error": "invalid JavaScript diagnostic"], status: 1)
                    return
                }
                self?.finish(object, status: object["ok"] as? Bool == true ? 0 : 1)
            case .failure(let error):
                self?.finish(["ok": false, "error": error.localizedDescription], status: 1)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(["ok": false, "error": error.localizedDescription], status: 1)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(["ok": false, "error": error.localizedDescription], status: 1)
    }

    private func finish(_ object: [String: Any], status: Int32) {
        guard !finished else { return }
        finished = true
        let fallback = Data("{\"ok\":false,\"error\":\"serialization failed\"}".utf8)
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? fallback
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0a]))
        fflush(stdout)
        exit(status)
    }
}

let app = NSApplication.shared
if CommandLine.arguments.contains("--smoke-test") {
    let delegate = SmokeDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.prohibited)
    app.run()
} else {
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
