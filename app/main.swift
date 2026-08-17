import Cocoa
import WebKit

// 太空跳跳车 SkyRoads —— WKWebView 原生壳
// 游戏本体是 bundle Resources 里的 index.html（单文件、零依赖）
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let style: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: style, backing: .buffered, defer: false)
        window.title = "太空跳跳车 SkyRoads"
        window.minSize = NSSize(width: 960, height: 600)
        self.window = window

        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView!.addSubview(webView)

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.loadHTMLString(
                "<body style='background:#000;color:#fff;font-family:monospace'>" +
                "<h1>index.html 缺失，请重新构建 App</h1></body>", baseURL: nil)
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
