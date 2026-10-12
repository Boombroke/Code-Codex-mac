import AppKit
import Foundation

if let value = CommandLine.arguments.first(where: { $0.hasPrefix("--finish-update=") }) {
    do { try finishUpdate(receiptURL: URL(fileURLWithPath: String(value.dropFirst(16)))) }
    catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
} else if CommandLine.arguments.contains("--startup-check") {
    let mode = startupMode(arguments: CommandLine.arguments, bundle: Bundle.main.bundleURL, installed: installedManagerURL)
    print("{\"startupMode\":\"\(mode.rawValue)\",\"hostLaunched\":false}")
} else if CommandLine.arguments.contains("--pin-dock") || CommandLine.arguments.contains("--remove-dock") || CommandLine.arguments.contains("--dock-state") {
    do {
        if CommandLine.arguments.contains("--pin-dock") { try DockEntry.pin(url: installedManagerURL, official: configuredGPTURL, reload: !CommandLine.arguments.contains("--no-reload-dock")) }
        if CommandLine.arguments.contains("--remove-dock") { try DockEntry.remove(url: installedManagerURL, reload: !CommandLine.arguments.contains("--no-reload-dock")) }
        let count = try DockEntry.read().filter { DockEntry.matches($0, url: installedManagerURL) }.count
        print("{\"ownDockEntries\":\(count),\"hostLaunched\":false}")
    } catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
} else if CommandLine.arguments.contains("--install-package") {
    do { let result = try performInstallation(from: Bundle.main.bundleURL); print(result) }
    catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
} else if let argument = CommandLine.arguments.first(where: { $0.hasPrefix("--protocol-test-url=") }) {
    guard let url = URL(string: String(argument.dropFirst(20))), url.host == "127.0.0.1", url.scheme == "ws", url.path == "/mock" else { exit(2) }
    Task {
        let client = DevToolsClient(url: url)
        do {
            let response = try await client.call("Test.echo", ["text": "native payload", "large": String(repeating: "a", count: 4096)])
            guard response["text"] as? String == "native payload" else { throw ManagerError(message: "Mock response mismatch") }
            do { _ = try await client.call("Test.error"); throw ManagerError(message: "Expected mock protocol error") }
            catch let error as ManagerError { guard error.message == "mock rejection" else { throw error } }
            let hanging = Task { try await client.call("Test.hang") }
            try await Task.sleep(nanoseconds: 100_000_000); hanging.cancel()
            var cancellationReturned = false
            do { _ = try await hanging.value } catch { cancellationReturned = true }
            guard cancellationReturned else { throw ManagerError(message: "Expected cancellation") }
            await client.close()
            let stalled = DevToolsClient(url: url, timeoutNanoseconds: 200_000_000)
            var timeoutReturned = false
            do { _ = try await stalled.call("Test.timeout") } catch { timeoutReturned = true }
            await stalled.close()
            guard timeoutReturned else { throw ManagerError(message: "Expected timeout") }
            print("Native WebSocket protocol, cancellation and timeout tests passed; only the local mock was connected."); exit(0)
        } catch { await client.close(); fputs("\(error)\n", stderr); exit(1) }
    }
    dispatchMain()
} else if CommandLine.arguments.contains("--self-test") {
    precondition(buildVersion != "development")
    launchPolicySelfTest()
    do { try installIdentitySelfTest(); try installationRollbackSelfTest() } catch { fputs("Update self-test failed: \(error)\n", stderr); exit(1) }
    do { try DockEntry.selfTest() } catch { fputs("Dock model self-test failed: \(error)\n", stderr); exit(1) }
    do {
        let output = try command("/usr/bin/printf", ["native-command-ok"])
        precondition(output == "native-command-ok")
        do { _ = try command("/bin/sleep", ["2"], timeout: 0.05); preconditionFailure("Expected command timeout") }
        catch let error as ManagerError { precondition(error.message.contains("操作超时")) }
    } catch { fputs("Command self-test failed: \(error)\n", stderr); exit(1) }
    let bundleVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    precondition(bundleVersion.range(of: "^[0-9]+\\.[0-9]+\\.[0-9]+$", options: .regularExpression) != nil)
    let good: [String: Any] = ["type": "page", "url": "app://-/index.html", "webSocketDebuggerUrl": "ws://127.0.0.1:34567/devtools/page/ABC-123"]
    precondition(validTarget(good, port: 34567) != nil)
    precondition(validTarget(good, port: 34568) == nil)
    var bad = good; bad["url"] = "https://chatgpt.com/"; precondition(validTarget(bad, port: 34567) == nil)
    bad = good; bad["webSocketDebuggerUrl"] = "ws://0.0.0.0:34567/devtools/page/ABC"; precondition(validTarget(bad, port: 34567) == nil)
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("code-codex-install-test-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    do {
        let target = temporary.appendingPathComponent("Code-Codex Mac.app")
        try installPackage(from: Bundle.main.bundleURL, to: target)
        try installPackage(from: Bundle.main.bundleURL, to: target)
        precondition(Bundle(url: target)?.bundleIdentifier == managerID)
        let foreign = temporary.appendingPathComponent("foreign.app")
        try FileManager.default.createDirectory(at: foreign, withIntermediateDirectories: true)
        do { try installPackage(from: Bundle.main.bundleURL, to: foreign); preconditionFailure("Must preserve unrelated directory") }
        catch let error as ManagerError { precondition(error.message.contains("其他应用")) }
    } catch { fputs("Installation self-test failed: \(error)\n", stderr); exit(1) }
    print("Native startup, duplicate-click, Dock install/removal and target validation passed; no host was launched or connected.")
} else {
    resumeUpdateCleanup()
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let delegate = MainActor.assumeIsolated { let value = Manager(); app.delegate = value; return value }
    withExtendedLifetime(delegate) { app.run() }
}
