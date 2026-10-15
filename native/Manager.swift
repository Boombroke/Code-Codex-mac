import AppKit
import Foundation
import CryptoKit
import Darwin
import UniformTypeIdentifiers

let managerID = "org.codecodex.mac.manager"
let managerName = "Code-Codex Mac"
let buildVersion = Bundle.main.object(forInfoDictionaryKey: "CodeCodexVersion") as? String ?? "development"
let installedManagerURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Code-Codex Mac.app")
var configuredGPTURL: URL { URL(fileURLWithPath: UserDefaults.standard.string(forKey: "gptPath") ?? "/Applications/ChatGPT.app") }
let restoreExpression = "(()=>{try{const k='code-codex-mac-backgrounds:v1';const s=JSON.parse(localStorage.getItem(k)||'{}');s.enabled=false;s.removed=true;localStorage.setItem(k,JSON.stringify(s));}catch{}window.__CCMacBackground__?.dispose();window.__CCMacPrepaint__?.dispose();window.__CCMacBootRevision__=(window.__CCMacBootRevision__||0)+1;})()"

struct ManagerError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

func command(_ executable: String, _ arguments: [String], timeout: TimeInterval = 20, isCancelled: () -> Bool = { false }) throws -> String {
    let fm = FileManager.default, task = Process(), done = DispatchSemaphore(value: 0)
    let temporary = fm.temporaryDirectory.appendingPathComponent("code-codex-command-\(UUID().uuidString)")
    try fm.createDirectory(at: temporary, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    defer { try? fm.removeItem(at: temporary) }
    let out = temporary.appendingPathComponent("stdout"), err = temporary.appendingPathComponent("stderr")
    fm.createFile(atPath: out.path, contents: nil, attributes: [.posixPermissions: 0o600]); fm.createFile(atPath: err.path, contents: nil, attributes: [.posixPermissions: 0o600])
    let output = try FileHandle(forWritingTo: out), errors = try FileHandle(forWritingTo: err)
    defer { try? output.close(); try? errors.close() }
    task.executableURL = URL(fileURLWithPath: executable); task.currentDirectoryURL = fm.homeDirectoryForCurrentUser
    // Keep CLI child environment independent of GUI launch metadata.
    let allowed = Set(["HOME", "PATH", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "CODEX_HOME", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"])
    task.environment = ProcessInfo.processInfo.environment.filter { allowed.contains($0.key) }
    task.arguments = arguments; task.standardInput = FileHandle.nullDevice; task.standardOutput = output; task.standardError = errors
    task.terminationHandler = { _ in done.signal() }; try task.run()
    let deadline = DispatchTime.now() + timeout
    while done.wait(timeout: .now() + 0.05) == .timedOut {
        let cancelled = isCancelled()
        if cancelled || DispatchTime.now().uptimeNanoseconds >= deadline.uptimeNanoseconds {
            if task.isRunning { task.terminate() }
            if done.wait(timeout: .now() + 2) == .timedOut {
                if task.isRunning { Darwin.kill(task.processIdentifier, SIGKILL) }
                _ = done.wait(timeout: .now() + 2)
            }
            if cancelled { throw CancellationError() }
            throw ManagerError(message: "\(URL(fileURLWithPath: executable).lastPathComponent) 操作超时，可稍后重试")
        }
    }
    let data = try Data(contentsOf: out), detail = try Data(contentsOf: err)
    if task.terminationStatus != 0 { let message = String(decoding: detail.suffix(16_384), as: UTF8.self); throw ManagerError(message: message.isEmpty ? "操作失败（退出码 \(task.terminationStatus)）" : message) }
    return String(decoding: data, as: UTF8.self)
}

func commandAsync(_ executable: String, _ arguments: [String], timeout: TimeInterval = 20) async throws -> String {
    try Task.checkCancellation()
    let worker = Task.detached {
        try Task.checkCancellation()
        return try command(executable, arguments, timeout: timeout, isCancelled: { Task.isCancelled })
    }
    return try await withTaskCancellationHandler { try await worker.value } onCancel: { worker.cancel() }
}

func verifiedGPT(_ appURL: URL, isCancelled: () -> Bool = { false }, requirePrivacyCoverage: Bool = true) throws -> URL {
    let plist = try Data(contentsOf: appURL.appendingPathComponent("Contents/Info.plist"))
    guard let info = try PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any], info["CFBundleIdentifier"] as? String == "com.openai.codex", let executable = info["CFBundleExecutable"] as? String else { throw ManagerError(message: "请选择官方 ChatGPT Desktop / Codex 应用") }
    _ = try command("/usr/bin/codesign", ["--verify", "--strict", appURL.path], isCancelled: isCancelled)
    _ = try command("/usr/bin/codesign", ["--verify", "-R", "=anchor apple generic and certificate leaf[subject.OU] = \"2DC432GLL2\" and identifier \"com.openai.codex\"", appURL.path], isCancelled: isCancelled)
    if requirePrivacyCoverage { try validateHostedPrivacyDescriptions(hostInfo: info, launcherInfo: Bundle.main.infoDictionary ?? [:]) }
    return appURL.appendingPathComponent("Contents/MacOS/\(executable)")
}

// Packaged window URLs use index.html for both primary and transparent utility
// windows. The route is part of the contract; "electron" is only a platform.
func allowedPrimaryRoute(_ route: String) -> Bool {
    if route == "/" { return true }
    guard route.utf8.count <= 4096, route.range(of: "^/[A-Za-z0-9_/-]+$", options: .regularExpression) != nil,
          !route.contains("//"), !route.hasSuffix("/") else { return false }
    let parts = route.split(separator: "/").map(String.init)
    if parts.count == 2 && ["local", "remote"].contains(parts[0]) { return true }
    guard parts.first == "settings" else { return false }
    if parts.count == 1 { return true }
    // Verified in app-initial-6350d04672d0.js (26.1007.30912), gWa and its
    // /settings children. Unregistered route families remain opt-out.
    let sections: Set<String> = [
        "general-settings", "notifications", "import", "profile", "security", "account", "age", "agreements",
        "parental-controls", "trusted-contact", "safety", "time-management", "appearance", "voice", "storage", "pets",
        "chronicle", "appshots", "git-settings", "connections", "cloud-settings", "codex-cloud", "cloud-environments",
        "code-review", "local-environments", "worktrees", "agent", "work-settings", "personalization", "keyboard-shortcuts",
        "codex-micro", "usage", "billing", "analytics", "consumer-view", "usage-code-review", "debug", "browser-use",
        "extension", "computer-use", "mcp-settings", "hooks-settings", "plugins-settings", "file-type-handlers",
        "skills-settings", "data-controls", "archived-chats", "ads-controls", "teams", "cloud-computer", "passwords",
        "open-source-licenses"
    ]
    guard sections.contains(parts[1]) else { return false }
    if parts.count == 2 { return true }
    switch parts[1] {
    case "plugins-settings", "cloud-environments": return true // registered wildcard children
    case "browser-use":
        if parts[2] == "site-settings" { return true } // registered site-settings/*
        return parts.count == 3 && ["extensions", "downloads", "history", "contact-info", "passwords"].contains(parts[2])
    case "computer-use": return parts.count == 3 // messages or :browserFamily
    case "connections": return parts.count == 3 || parts.count == 4
    case "code-review": return parts.count == 4 && parts[2] == "repositories"
    case "local-environments": return parts.count == 3 && parts[2] == "create"
    case "teams": return parts.count == 3 || parts.count == 4 && parts[3] == "join"
    default: return false
    }
}

func allowedPrimaryPage(_ page: String) -> Bool {
    guard page.utf8.count <= 8192,
          page.range(of: "^app://-/index\\.html(?:\\?initialRoute=[^#&]+)?$", options: .regularExpression) != nil,
          page.range(of: "[\\x00-\\x20\\x7F\\\\]", options: .regularExpression) == nil,
          page.range(of: "%(?![0-9A-Fa-f]{2})", options: .regularExpression) == nil,
          let components = URLComponents(string: page), components.scheme == "app", components.host == "-",
          components.percentEncodedPath == "/index.html", components.user == nil, components.password == nil,
          components.port == nil, components.fragment == nil else { return false }
    guard let query = components.percentEncodedQuery else { return true }
    // The production URL builder adds only initialRoute. Reject duplicate,
    // case/encoding aliases, utility roles and noncanonical query fields.
    let fields = query.components(separatedBy: "&")
    guard fields.count == 1 else { return false }
    let pair = fields[0].components(separatedBy: "=")
    guard pair.count == 2, pair[0] == "initialRoute", !pair[1].contains("+"),
          let route = pair[1].removingPercentEncoding else { return false }
    return allowedPrimaryRoute(route)
}

func validTarget(_ target: [String: Any], port: Int) -> URL? {
    guard target["type"] as? String == "page", let page = target["url"] as? String,
          allowedPrimaryPage(page),
          let socket = target["webSocketDebuggerUrl"] as? String, let url = URL(string: socket),
          url.scheme == "ws", url.host == "127.0.0.1", url.port == port, url.user == nil, url.password == nil,
          url.query == nil, url.fragment == nil,
          url.path.range(of: "^/devtools/page/[A-Za-z0-9-]+$", options: .regularExpression) != nil else { return nil }
    return url
}

func reservePort() throws -> Int {
    let descriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard descriptor >= 0 else { throw ManagerError(message: "无法分配本机接入端点") }
    defer { Darwin.close(descriptor) }
    var address = sockaddr_in(); address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET); address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let result = withUnsafePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    guard result == 0 else { throw ManagerError(message: "无法分配本机接入端点") }
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let fetched = withUnsafeMutablePointer(to: &address) { pointer in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) }
    }
    guard fetched == 0 else { throw ManagerError(message: "无法读取本机接入端点") }
    return Int(UInt16(bigEndian: address.sin_port))
}

final class LoopbackDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
let localSession: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    return URLSession(configuration: configuration, delegate: LoopbackDelegate(), delegateQueue: nil)
}()

actor DevToolsClient {
    private let socket: URLSessionWebSocketTask
    private let timeoutNanoseconds: UInt64
    private var sequence = 0
    private var closed = false
    private var reader: Task<Void, Never>?
    private var pending: [Int: CheckedContinuation<[String: Any], Error>] = [:]
    private var deadlines: [Int: Task<Void, Never>] = [:]
    private var sends: [Int: Task<Void, Never>] = [:]
    init(url: URL, timeoutNanoseconds: UInt64 = 15_000_000_000) { self.timeoutNanoseconds = timeoutNanoseconds; socket = localSession.webSocketTask(with: url); socket.resume() }
    func call(_ method: String, _ params: [String: Any] = [:]) async throws -> [String: Any] {
        try Task.checkCancellation()
        guard !closed else { throw ManagerError(message: "应用接入连接已关闭") }
        sequence += 1; let id = sequence
        let data = try JSONSerialization.data(withJSONObject: ["id": id, "method": method, "params": params])
        let message = URLSessionWebSocketTask.Message.string(String(decoding: data, as: UTF8.self))
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                guard !Task.isCancelled else { continuation.resume(throwing: CancellationError()); return }
                guard !closed else { continuation.resume(throwing: ManagerError(message: "应用接入连接已关闭")); return }
                pending[id] = continuation
                startReader()
                deadlines[id] = Task { [weak self, timeoutNanoseconds] in
                    do { try await Task.sleep(nanoseconds: timeoutNanoseconds) }
                    catch { return }
                    await self?.finish(id, .failure(ManagerError(message: "应用接入超时")))
                }
                sends[id] = Task { [weak self, socket] in
                    do { try await socket.send(message) }
                    catch { if !Task.isCancelled { await self?.failAll(error) } }
                }
            }
        } onCancel: {
            Task { await self.finish(id, .failure(CancellationError())) }
        }
    }
    private func startReader() {
        guard reader == nil else { return }
        reader = Task { [weak self, socket] in
            do {
                while !Task.isCancelled {
                    let message = try await socket.receive()
                    let bytes: Data
                    switch message { case .string(let text): bytes = Data(text.utf8); case .data(let value): bytes = value; @unknown default: continue }
                    let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any]
                    guard let object, let id = object["id"] as? Int else { continue }
                    if let error = object["error"] as? [String: Any] {
                        await self?.finish(id, .failure(ManagerError(message: error["message"] as? String ?? "接入失败")))
                    } else { await self?.finish(id, .success(object["result"] as? [String: Any] ?? [:])) }
                }
            } catch { await self?.failAll(error) }
        }
    }
    private func finish(_ id: Int, _ result: Result<[String: Any], Error>) {
        guard let continuation = pending.removeValue(forKey: id) else { return }
        deadlines.removeValue(forKey: id)?.cancel(); sends.removeValue(forKey: id)?.cancel()
        continuation.resume(with: result)
    }
    private func failAll(_ error: Error) {
        guard !closed else { return }
        closed = true; reader?.cancel(); reader = nil
        socket.cancel(with: .goingAway, reason: nil)
        for id in Array(pending.keys) { finish(id, .failure(error)) }
    }
    func close() { failAll(ManagerError(message: "应用接入连接已关闭")) }
}

// These checks talk exclusively to the deliberately limited /mock peer.
func devToolsConcurrencySelfTest(url: URL) async throws {
    let client = DevToolsClient(url: url, timeoutNanoseconds: 2_000_000_000)
    do {
        async let first = client.call("Test.reverse", ["text": "first"])
        async let second = client.call("Test.reverse", ["text": "second"])
        let (left, right) = try await (first, second)
        guard left["text"] as? String == "first", right["text"] as? String == "second" else { throw ManagerError(message: "Concurrent replies were delivered to the wrong request") }
        let hanging = Task { try await client.call("Test.concurrentHang") }
        let survivor = Task { try await client.call("Test.survivor") }
        try await Task.sleep(nanoseconds: 50_000_000); hanging.cancel()
        do { _ = try await hanging.value; throw ManagerError(message: "Cancelled request unexpectedly succeeded") }
        catch is CancellationError { }
        guard try await survivor.value["text"] as? String == "survived" else { throw ManagerError(message: "Cancelling one request closed another request's connection") }
        let closing = Task { try await client.call("Test.closePending") }
        try await Task.sleep(nanoseconds: 50_000_000); await client.close()
        var closeReturned = false
        do { _ = try await closing.value } catch { closeReturned = true }
        guard closeReturned else { throw ManagerError(message: "Closing a connection left its pending request unresolved") }
        do { _ = try await client.call("Test.mustNotSend"); throw ManagerError(message: "Closed connection accepted a request") }
        catch let error as ManagerError { guard error.message == "应用接入连接已关闭" else { throw error } }
    } catch { await client.close(); throw error }
}

@MainActor func nativeCommandAsyncSelfTest() async throws {
    var mainActorResponded = false
    let pulse = Task { @MainActor in try await Task.sleep(nanoseconds: 25_000_000); mainActorResponded = true }
    _ = try await commandAsync("/bin/sleep", ["0.15"])
    guard mainActorResponded else { pulse.cancel(); throw ManagerError(message: "A CLI wait blocked the main actor") }
    _ = try await pulse.value
    let command = Task { try await commandAsync("/bin/sleep", ["2"]) }
    try await Task.sleep(nanoseconds: 50_000_000)
    let cancelledAt = Date(); command.cancel()
    do { _ = try await command.value; throw ManagerError(message: "Cancelled CLI command unexpectedly succeeded") }
    catch is CancellationError { }
    guard Date().timeIntervalSince(cancelledAt) < 1.5 else { throw ManagerError(message: "CLI cancellation did not finish promptly") }
}

@MainActor final class Manager: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuDelegate {
    private var window: NSWindow!
    private let status = NSTextField(wrappingLabelWithString: "")
    private var openButton: NSButton!
    private var item: NSStatusItem!
    private var menuStatus: NSMenuItem!
    private var started = false
    private var launching = false
    private var installing = false
    private var applyLaunchPreferences = true
    private var process: Process?
    private var activePort: Int?
    private var activeCode: String?
    private var activeLaunchScript: String?
    private var session: Task<Void, Never>?
    private var launchTask: Task<Void, Never>?
    private var lifecycle = SessionLifecycle()
    private var restoration: Task<Void, Never>?
    private var clients: [String: DevToolsClient] = [:]
    private var scriptIDs: [String: String] = [:]
    private var restoreIncomplete = false
    private var appURL: URL { configuredGPTURL }
    private var installedURL: URL { installedManagerURL }
    private var codexCLI: URL { appURL.appendingPathComponent("Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        startInterface()
    }
    func startInterface() {
        guard !started else { return }; started = true
        buildMenu(); buildApplicationMenu(); refreshStatus()
        if startupMode(arguments: CommandLine.arguments, bundle: Bundle.main.bundleURL, installed: installedURL) == .direct { openGPT() }
        else { showWindow() }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if startupMode(arguments: CommandLine.arguments, bundle: Bundle.main.bundleURL, installed: installedURL) == .direct { openGPT() }
        else { showWindow() }; return false
    }
    func windowWillClose(_ notification: Notification) { NSApp.hide(nil) }
    func menuWillOpen(_ menu: NSMenu) { menuStatus.title = status.stringValue.components(separatedBy: "\n").first ?? "GPT 动态背景" }

    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 370), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = managerName + " · 安装与设置"; window.center(); window.isReleasedWhenClosed = false; window.delegate = self
        let root = NSVisualEffectView(); root.material = .sidebar; root.blendingMode = .behindWindow
        window.contentView = root
        let title = NSTextField(labelWithString: "Code-Codex Mac")
        title.font = .systemFont(ofSize: 27, weight: .semibold)
        let subtitle = NSTextField(wrappingLabelWithString: "动态背景与局部磨砂，直接在 GPT 窗口内调节。")
        subtitle.textColor = .secondaryLabelColor
        let note = NSTextField(wrappingLabelWithString: "安装后在 Dock 点击「GPT 动态背景」即可直接启动。窗口内 Preview Market 调节背景；菜单栏 ✦ 提供设置、恢复和卸载。")
        note.font = .systemFont(ofSize: 13); note.textColor = .secondaryLabelColor
        status.font = .systemFont(ofSize: 12); status.textColor = .secondaryLabelColor; status.maximumNumberOfLines = 5
        let install = button("安装 / 修复 Dock 入口", #selector(installManager))
        openButton = button("打开 GPT 并启用背景", #selector(openGPT)); openButton.bezelStyle = .rounded
        openButton.isEnabled = sameLocation(Bundle.main.bundleURL, installedURL)
        let choose = button("选择 GPT 应用…", #selector(chooseGPT))
        let restore = button("恢复当前窗口外观", #selector(restoreAppearance))
        let uninstall = button("卸载启动器", #selector(uninstallManager))
        let row = NSStackView(views: [install, choose, uninstall]); row.orientation = .horizontal; row.spacing = 8
        let second = NSStackView(views: [openButton, restore]); second.orientation = .horizontal; second.spacing = 8
        let stack = NSStackView(views: [title, subtitle, note, row, second, status]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false; root.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 28),stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -28),stack.topAnchor.constraint(equalTo: root.topAnchor, constant: 28),stack.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -24),subtitle.widthAnchor.constraint(equalTo: stack.widthAnchor),note.widthAnchor.constraint(equalTo: stack.widthAnchor),status.widthAnchor.constraint(equalTo: stack.widthAnchor)])
    }
    func applicationWillTerminate(_ notification: Notification) { resumeUpdateCleanup(includingCurrentParent: true) }
    private func button(_ title: String, _ action: Selector) -> NSButton { let value = NSButton(title: title, target: self, action: action); value.bezelStyle = .rounded; return value }
    private func buildMenu() {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength); item.button?.title = "✦"
        let menu = NSMenu(); menu.delegate = self; menu.autoenablesItems = false
        menuStatus = NSMenuItem(title: "GPT 动态背景", action: nil, keyEquivalent: ""); menuStatus.isEnabled = false; menu.addItem(menuStatus); menu.addItem(.separator())
        for (title, selector) in [("打开 GPT 并启用背景", #selector(openGPT)),("安装与设置…", #selector(showWindow)),("恢复当前窗口外观", #selector(restoreAppearance)),("卸载 GPT 动态背景…", #selector(uninstallManager))] { let value = NSMenuItem(title: title, action: selector, keyEquivalent: ""); value.target = self; if selector == #selector(openGPT) { value.isEnabled = sameLocation(Bundle.main.bundleURL, installedURL) }; menu.addItem(value) }
        menu.addItem(.separator()); let quit = NSMenuItem(title: "退出后台启动器", action: #selector(quitManager), keyEquivalent: "q"); quit.target = self; menu.addItem(quit); item.menu = menu
    }
    private func buildApplicationMenu() {
        let main = NSMenu(), application = NSMenu(), root = NSMenuItem()
        main.addItem(root); root.submenu = application
        let about = NSMenuItem(title: "关于 Code-Codex Mac", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""); about.target = NSApp; application.addItem(about)
        application.addItem(.separator())
        let quit = NSMenuItem(title: "退出 Code-Codex Mac", action: #selector(quitManager), keyEquivalent: "q"); quit.target = self; application.addItem(quit)
        NSApp.mainMenu = main
    }
    @objc private func showWindow() { if window == nil { buildWindow() }; NSApp.setActivationPolicy(.regular); NSApp.unhide(nil); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    private func refreshStatus() { let channel = (try? Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("channel.json"))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }; let effects = channel?["effects"] as? Int ?? 4; status.stringValue = "版本 \(buildVersion) · \(effects) 种效果 · \(FileManager.default.fileExists(atPath: installedURL.path) ? "已安装到 ~/Applications" : "尚未安装，请先加入 Dock")\nGPT：\(appURL.path)\n官方 GPT 的文件与签名保持原样；本机接入只在本次运行期间存在。" }
    private func error(_ problem: Error) { status.stringValue = problem.localizedDescription; NSApp.activate(ignoringOtherApps: true); let alert = NSAlert(); alert.messageText = "操作未完成"; alert.informativeText = problem.localizedDescription; alert.runModal() }

    @objc private func chooseGPT() {
        guard !installing, !launching, !lifecycle.isBusy else { return }
        let picker = NSOpenPanel(); picker.canChooseDirectories = false; picker.allowedContentTypes = [.applicationBundle]; picker.treatsFilePackagesAsDirectories = false; picker.allowsMultipleSelection = false
        if picker.runModal() == .OK, !installing, !launching, !lifecycle.isBusy, let url = picker.url { UserDefaults.standard.set(url.path, forKey: "gptPath"); refreshStatus() }
    }
    @objc private func installManager() {
        guard !installing, !launching, !lifecycle.isBusy else { return }; installing = true; status.stringValue = "正在安装并登记 Dock 入口…"
        let source = Bundle.main.bundleURL
        Task {
            let result = await Task.detached { Result { try performInstallation(from: source) } }.value
            installing = false
            switch result {
            case .success(let message):
                status.stringValue = message
                if !sameLocation(source, installedURL) {
                    let complete = NSAlert(); complete.messageText = "安装完成"; complete.informativeText = message; complete.addButton(withTitle: "完成"); complete.runModal(); NSApp.terminate(nil)
                }
            case .failure(let problem): error(problem)
            }
        }
    }
    @objc private func uninstallManager() {
        guard !installing, !launching, !lifecycle.isBusy else { return }
        let alert = NSAlert(); alert.messageText = "卸载 GPT 动态背景？"; alert.informativeText = "会恢复已接入的窗口外观、移除本启动器的 Dock 入口，并将启动器移入废纸篓。官方 GPT、其他 Dock 图标、聊天与背景参数保留。"; alert.addButton(withTitle: "卸载"); alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn, !installing, !launching,
              let operation = lifecycle.begin(.uninstalling) else { return }
        restoreIncomplete = false
        Task { defer { _ = lifecycle.finish(operation) }; await performRestore(); do {
            guard !restoreIncomplete else { throw ManagerError(message: "部分窗口尚未恢复，已保留启动器。请使用 GPT 窗口内的恢复按钮，或正常退出 GPT 后再卸载。") }
            if UserDefaults.standard.bool(forKey: "companionRegistered") || UserDefaults.standard.bool(forKey: "marketplaceRegistered") {
                guard FileManager.default.isExecutableFile(atPath: codexCLI.path) else { throw ManagerError(message: "配套说明插件仍已注册，请先恢复官方 GPT 或在插件目录卸载它，再移除管理器。") }
                _ = try await verifyGPT(requirePrivacyCoverage: false)
                if UserDefaults.standard.bool(forKey: "companionRegistered") {
                    _ = try await commandAsync(codexCLI.path, ["plugin", "remove", "code-codex-mac-manager@code-codex-mac-native", "--json"])
                    UserDefaults.standard.set(false, forKey: "companionRegistered")
                }
                if UserDefaults.standard.bool(forKey: "marketplaceRegistered") {
                    do { _ = try await commandAsync(codexCLI.path, ["plugin", "marketplace", "remove", "code-codex-mac-native", "--json"]) }
                    catch let error as ManagerError {
                        guard error.message.contains("marketplace `code-codex-mac-native` is not configured or installed") else { throw error }
                    }
                    UserDefaults.standard.set(false, forKey: "marketplaceRegistered")
                }
            }
            let destination = installedURL
            try await Task.detached { try DockEntry.remove(url: destination) }.value
            if FileManager.default.fileExists(atPath: installedURL.path) {
                guard let identifier = Bundle(url: installedURL)?.bundleIdentifier, identifier == managerID else { throw ManagerError(message: "安装目录属于其他应用，已停止卸载。") }
                try FileManager.default.trashItem(at: installedURL, resultingItemURL: nil)
            }
            UserDefaults.standard.removePersistentDomain(forName: managerID)
            let complete = NSAlert(); complete.messageText = "已卸载 GPT 动态背景"; complete.informativeText = "官方 GPT 保持原样。正常退出并从原图标重开 GPT，可关闭本次接入端点。"; complete.runModal(); NSApp.terminate(nil)
        } catch { self.error(error) } }
    }

    private func verifyGPT(requirePrivacyCoverage: Bool = true) async throws -> URL {
        let selectedApp = appURL
        let worker = Task.detached { try verifiedGPT(selectedApp, isCancelled: { Task.isCancelled }, requirePrivacyCoverage: requirePrivacyCoverage) }
        return try await withTaskCancellationHandler { try await worker.value } onCancel: { worker.cancel() }
    }
    private func checkedScript(_ name: String) throws -> String {
        let data = try Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent(name + ".js"))
        let expected = try String(contentsOf: Bundle.main.resourceURL!.appendingPathComponent(name + ".sha256"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let actual = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard actual == expected else { throw ManagerError(message: "背景组件完整性检查失败，请重新下载") }
        return String(decoding: data, as: UTF8.self)
    }
    @objc private func openGPT() {
        guard !lifecycle.isBusy, !installing else { return }
        guard sameLocation(Bundle.main.bundleURL, installedURL) else { showWindow(); status.stringValue = "请先安装，再从 Dock 的「GPT 动态背景」入口启动。"; return }
        let action = openAction(launching: launching, ownedRunning: process?.isRunning == true, connected: !clients.isEmpty, monitoring: session != nil, otherRunning: !NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex").isEmpty)
        switch action {
        case .wait: return
        case .activate:
            if let child = process { NSRunningApplication(processIdentifier: child.processIdentifier)?.activate(options: [.activateAllWindows]) }
            return
        case .reconnect:
            if let child = process, let processID = lifecycle.processID, let port = activePort, let code = activeCode, let script = activeLaunchScript {
                NSRunningApplication(processIdentifier: child.processIdentifier)?.activate(options: [.activateAllWindows])
                applyLaunchPreferences = true; status.stringValue = "正在重新启用当前 GPT 的背景…"
                let monitorID = lifecycle.beginMonitor()
                session = Task { [weak self] in await self?.monitor(pid: child.processIdentifier, processID: processID, monitorID: monitorID, port: port, code: code, launchScript: script) }
            }; return
        case .requireQuit:
            error(ManagerError(message: "GPT 已从普通入口打开。请完成当前任务并按 Cmd+Q 完全退出，再点击 Dock 的「GPT 动态背景」。启动器会保留正在运行的聊天。")); return
        case .start: break
        }
        launching = true; openButton?.isEnabled = false; status.stringValue = "核验官方 GPT 与本地背景组件…"
        launchTask = Task {
            defer { launchTask = nil }
            do {
                let executable = try await verifyGPT(), code = try checkedScript("renderer"), launchScript = try checkedScript("launch"), port = try reservePort()
                try Task.checkCancellation()
                guard !lifecycle.isBusy else { throw CancellationError() }
                guard NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex").isEmpty else { throw ManagerError(message: "GPT 已从其他入口打开，已保留正在运行的应用。请完成任务后正常退出，再使用本入口。") }
                let processID = UUID()
                let child = Process(); child.executableURL = executable; child.arguments = ["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=\(port)"]
                child.standardOutput = FileHandle.nullDevice; child.standardError = FileHandle.nullDevice
                child.terminationHandler = { [weak self] child in
                    guard let manager = self else { return }
                    Task { @MainActor in await manager.disconnected(pid: child.processIdentifier, processID: processID, status: child.terminationStatus, signalled: child.terminationReason == .uncaughtSignal) }
                }
                try child.run(); _ = lifecycle.beginProcess(processID); process = child; activePort = port; activeCode = code; activeLaunchScript = launchScript; applyLaunchPreferences = true
                status.stringValue = "GPT 已打开，正在启用背景…"; openButton?.isEnabled = true; launching = false
                let monitorID = lifecycle.beginMonitor()
                session = Task { [weak self] in await self?.monitor(pid: child.processIdentifier, processID: processID, monitorID: monitorID, port: port, code: code, launchScript: launchScript) }
            } catch { launching = false; openButton?.isEnabled = true; if !(error is CancellationError) { self.error(error) } }
        }
    }
    private func monitor(pid: Int32, processID: UUID, monitorID: UUID, port: Int, code: String, launchScript: String) async {
        var misses = 0
        func isCurrent() -> Bool { lifecycle.ownsMonitor(monitorID, process: processID) && process?.processIdentifier == pid && process?.isRunning == true }
        func requireCurrent() throws { guard !Task.isCancelled, isCurrent() else { throw CancellationError() } }
        while !Task.isCancelled && isCurrent() {
            do {
                let owner = try await commandAsync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-iTCP:\(port)", "-sTCP:LISTEN", "-Fn"])
                try requireCurrent()
                let addresses = owner.split(separator: "\n").filter { $0.hasPrefix("n") }
                guard addresses == [Substring("n127.0.0.1:\(port)")] else { throw ManagerError(message: "本机接入端点未就绪") }
                var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/json/list")!); request.timeoutInterval = 3
                let (data, response) = try await localSession.data(for: request)
                try requireCurrent()
                guard (response as? HTTPURLResponse)?.statusCode == 200, let targets = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw ManagerError(message: "应用页面列表不可用") }
                for target in targets {
                    guard let id = target["id"] as? String, let url = validTarget(target, port: port), clients[id] == nil else { continue }
                    let client = DevToolsClient(url: url)
                    var scriptID: String?
                    do {
                        if applyLaunchPreferences {
                            let seeded = try await client.call("Runtime.evaluate", ["expression": launchScript])
                            try requireCurrent()
                            guard seeded["exceptionDetails"] == nil else { throw ManagerError(message: "无法恢复已保存的背景设置") }
                            guard let result = seeded["result"] as? [String: Any], result["type"] as? String == "boolean", result["value"] as? Bool == true else {
                                await client.close(); continue
                            }
                            applyLaunchPreferences = false
                        }
                        let registration = try await client.call("Page.addScriptToEvaluateOnNewDocument", ["source": code])
                        guard let identifier = registration["identifier"] as? String else { throw ManagerError(message: "背景重载注册失败") }; scriptID = identifier
                        try requireCurrent()
                        let result = try await client.call("Runtime.evaluate", ["expression": code, "awaitPromise": true])
                        guard result["exceptionDetails"] == nil else { throw ManagerError(message: "背景组件初始化失败") }
                        try requireCurrent()
                        clients[id] = client; scriptIDs[id] = identifier; status.stringValue = "外观组件已接入。GPT 窗口内可调节背景。\n菜单栏 ✦ 提供设置、恢复和卸载。"
                    } catch {
                        if Task.isCancelled || !isCurrent() {
                            let cleanupScriptID = scriptID
                            let restored = await Task.detached {
                                let cleanup = DevToolsClient(url: url)
                                var removed = true
                                if let identifier = cleanupScriptID { do { _ = try await cleanup.call("Page.removeScriptToEvaluateOnNewDocument", ["identifier": identifier]) } catch { removed = false } }
                                do { let response = try await cleanup.call("Runtime.evaluate", ["expression": restoreExpression]); await cleanup.close(); return removed && response["exceptionDetails"] == nil }
                                catch { await cleanup.close(); return false }
                            }.value
                            if !restored && lifecycle.ownsProcess(processID) { restoreIncomplete = true }
                        } else if let identifier = scriptID { _ = try? await client.call("Page.removeScriptToEvaluateOnNewDocument", ["identifier": identifier]) }
                        await client.close(); throw error
                    }
                }
                for id in Array(clients.keys) where !targets.contains(where: { $0["id"] as? String == id }) { await clients[id]?.close(); clients.removeValue(forKey: id); scriptIDs.removeValue(forKey: id) }
                misses = 0
            } catch { guard !Task.isCancelled, isCurrent() else { return }; misses += 1; if misses == 60 { status.stringValue = "未匹配当前 GPT 的接入页面。可点击启动按钮重新接入，或检查应用版本兼容性。"; session = nil; lifecycle.stopMonitor(); break } }
            try? await Task.sleep(nanoseconds: clients.isEmpty ? 1_000_000_000 : 10_000_000_000)
        }
    }
    private func disconnected(pid: Int32, processID: UUID, status: Int32, signalled: Bool) async {
        guard process?.processIdentifier == pid, lifecycle.endProcess(processID) else { return }
        session?.cancel(); session = nil
        let detachedClients = Array(clients.values); clients.removeAll(); scriptIDs.removeAll()
        process = nil; activePort = nil; activeCode = nil; activeLaunchScript = nil; launching = false; openButton?.isEnabled = true
        self.status.stringValue = hostExitMessage(status: status, signalled: signalled)
        for client in detachedClients { await client.close() }
    }
    private func restore() async {
        if let pending = restoration { await pending.value; return }
        guard !launching, !installing, let operation = lifecycle.begin(.restoring) else { return }
        restoreIncomplete = false
        let worker = Task { await performRestore() }; restoration = worker
        await worker.value; restoration = nil; _ = lifecycle.finish(operation)
    }
    private func performRestore() async {
        status.stringValue = "正在恢复窗口外观…"
        let pending = session; session?.cancel(); session = nil; await pending?.value
        let detachedClients = clients, detachedScripts = scriptIDs; clients.removeAll(); scriptIDs.removeAll()
        for (id, client) in detachedClients {
            if let identifier = detachedScripts[id] { do { _ = try await client.call("Page.removeScriptToEvaluateOnNewDocument", ["identifier": identifier]) } catch { restoreIncomplete = true } }
            do { let result = try await client.call("Runtime.evaluate", ["expression": restoreExpression]); if result["exceptionDetails"] != nil { restoreIncomplete = true } }
            catch { restoreIncomplete = true }
            await client.close()
        }
        status.stringValue = restoreIncomplete ? "部分窗口未能恢复，请使用 GPT 窗口内的恢复按钮，或正常退出并从原图标重开 GPT。" : "窗口外观已恢复。正常退出并从原图标重开 GPT，可关闭本机接入端点。"
    }
    @objc private func restoreAppearance() { Task { await restore() } }
    @objc private func quitManager() {
        guard !installing, let operation = lifecycle.begin(.quitting) else { return }
        let pendingLaunch = launchTask; pendingLaunch?.cancel()
        let pending = session; session?.cancel(); session = nil
        Task {
            await pendingLaunch?.value
            await pending?.value
            let detachedClients = Array(clients.values); clients.removeAll(); scriptIDs.removeAll()
            for client in detachedClients { await client.close() }
            _ = lifecycle.finish(operation); NSApp.terminate(nil)
        }
    }
}
