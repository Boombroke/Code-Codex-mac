import AppKit
import Foundation
import Darwin
import CoreServices

private let registrationTool = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
private struct AppFileID: Codable, Equatable {
    let device: UInt64
    let inode: UInt64
    static func read(_ url: URL) throws -> AppFileID {
        var info = stat()
        guard lstat(url.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFDIR, info.st_uid == getuid() else { throw ManagerError(message: "无法确认应用目录归属，已保留：\(url.path)") }
        return AppFileID(device: UInt64(info.st_dev), inode: UInt64(info.st_ino))
    }
}
private final class UpdateLock {
    let descriptor: Int32
    init(parent: URL) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: parent, withIntermediateDirectories: true)
        _ = try AppFileID.read(parent)
        try fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: parent.path)
        descriptor = open(parent.appendingPathComponent("install.lock").path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { throw ManagerError(message: "无法锁定更新目录") }
        var info = stat()
        guard fstat(descriptor, &info) == 0, info.st_uid == getuid(), (info.st_mode & S_IFMT) == S_IFREG, flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            close(descriptor); throw ManagerError(message: "另一个更新正在进行，请稍后重试")
        }
    }
    deinit { flock(descriptor, LOCK_UN); close(descriptor) }
}
private func transactionRoot(for destination: URL) -> URL { destination.deletingLastPathComponent().appendingPathComponent(".code-codex-updates.noindex", isDirectory: true) }
private func sameAppPath(_ a: URL, _ b: URL) -> Bool { a.standardizedFileURL.resolvingSymlinksInPath().path == b.standardizedFileURL.resolvingSymlinksInPath().path }

// The verifier/registrar are injectable so rollback tests never alter the Dock or launch GPT.
func installPackage(from source: URL, to destination: URL, verifier: (URL) throws -> Void = { _ = try InstalledPackage.read($0) }, prepare: () throws -> Void = {}, registrar: (URL) throws -> Void = { _ in }) throws {
    let fm = FileManager.default, expected = try InstalledPackage.read(source)
    let lock = try UpdateLock(parent: transactionRoot(for: destination))
    defer { withExtendedLifetime(lock) {} }
    let existing = fm.fileExists(atPath: destination.path)
    if existing {
        guard let data = try? Data(contentsOf: destination.appendingPathComponent("Contents/Info.plist")),
              let info = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any], info["CFBundleIdentifier"] as? String == managerID else {
            throw ManagerError(message: "安装位置属于其他应用，已保留原文件")
        }
        try expected.permitsUpdate(from: InstalledPackage.read(destination))
    }
    try prepare()
    if sameAppPath(source, destination) { try verifier(destination); try registrar(destination); return }
    let transaction = transactionRoot(for: destination).appendingPathComponent("update-\(UUID().uuidString).noindex", isDirectory: true)
    try fm.createDirectory(at: transaction, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    let stage = transaction.appendingPathComponent("new.app"), backup = transaction.appendingPathComponent("previous.app")
    var preserveTransaction = false
    defer { if !preserveTransaction { try? fm.removeItem(at: transaction) } }
    try fm.copyItem(at: source, to: stage)
    guard try InstalledPackage.read(stage) == expected else { throw ManagerError(message: "复制后的安装包与原包不一致，旧版本已保留") }
    try verifier(stage)
    let stagedID = try AppFileID.read(stage)
    if existing { try fm.moveItem(at: destination, to: backup) }
    do {
        try fm.moveItem(at: stage, to: destination)
        guard try InstalledPackage.read(destination) == expected else { throw ManagerError(message: "更新后完整性校验失败") }
        try verifier(destination)
        try registrar(destination)
    } catch {
        let originalError = error
        do {
            if fm.fileExists(atPath: destination.path) {
                guard try AppFileID.read(destination) == stagedID else { throw ManagerError(message: "安装位置在更新期间被其他操作改动") }
                try fm.moveItem(at: destination, to: transaction.appendingPathComponent("failed-new.app"))
            }
            if existing { try fm.moveItem(at: backup, to: destination) }
        } catch {
            preserveTransaction = true
            throw ManagerError(message: "更新未完成，恢复旧版本也失败。可恢复副本保存在 \(transaction.path)。\n\(originalError.localizedDescription)\n\(error.localizedDescription)")
        }
        throw originalError
    }
    // The validated new app is committed. A leftover backup stays hidden if cleanup fails.
    if fm.fileExists(atPath: backup.path) { try? fm.removeItem(at: backup) }
}

private struct RetiredCopy: Codable {
    let path: String
    let fileID: AppFileID
    let version: String
    let rendererHash: String
    let launchHash: String
}
private struct CleanupReceipt: Codable {
    let id: String
    let installedVersion: String
    let parentPID: Int32
    let copies: [RetiredCopy]
}
private func visibleUserCopy(_ url: URL) -> Bool {
    let path = url.standardizedFileURL.path, home = FileManager.default.homeDirectoryForCurrentUser.path
    guard url.standardizedFileURL.path == url.standardizedFileURL.resolvingSymlinksInPath().path, !url.pathComponents.contains(where: { $0.hasSuffix(".noindex") || $0.hasPrefix(".") && $0 != "." }) else { return false }
    return [home + "/Applications/", home + "/Downloads/", home + "/Desktop/", home + "/Documents/", "/Applications/"].contains { path.hasPrefix($0) }
}
private func retiredCopies(source: URL, incoming: InstalledPackage) -> [RetiredCopy] {
    let indexed = (try? command("/usr/bin/mdfind", ["-0", "kMDItemCFBundleIdentifier == \"\(managerID)\""])) ?? ""
    var candidates = indexed.split(separator: "\0").map { URL(fileURLWithPath: String($0)) }
    candidates.append(source)
    // Query only this product's registered paths; directory enumeration can
    // trigger macOS folder-access prompts in a GUI installer.
    if let registered = LSCopyApplicationURLsForBundleIdentifier(managerID as CFString, nil)?.takeRetainedValue() as? [URL] { candidates.append(contentsOf: registered) }
    var seen = Set<String>(), result = [RetiredCopy]()
    for url in candidates {
        let path = url.standardizedFileURL.path
        guard seen.insert(path).inserted, !sameAppPath(url, installedManagerURL), visibleUserCopy(url),
              let identity = try? AppFileID.read(url), let package = try? InstalledPackage.read(url), package.version <= incoming.version,
              package.effectIDs.isSubset(of: incoming.effectIDs), (try? command("/usr/bin/codesign", ["--verify", "--strict", url.path])) != nil else { continue }
        result.append(RetiredCopy(path: path, fileID: identity, version: package.version.description, rendererHash: package.rendererHash, launchHash: package.launchHash))
    }
    return result
}
private func stopOldHelpers(allowed: Set<String>, incoming: InstalledPackage) throws {
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: managerID) where app.processIdentifier != ProcessInfo.processInfo.processIdentifier {
        guard let url = app.bundleURL, allowed.contains(url.standardizedFileURL.path), let package = try? InstalledPackage.read(url), package.version <= incoming.version else {
            throw ManagerError(message: "发现未确认来源的运行中启动器，请先退出该启动器再更新")
        }
        let pid = app.processIdentifier
        // Launch Services termination state can lag, especially in the CLI
        // installer without an AppKit run loop. Verify actual process exit too.
        let exited = { app.isTerminated || kill(pid, 0) == -1 && errno == ESRCH }
        _ = app.terminate()
        let deadline = Date().addingTimeInterval(3)
        while !exited() && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if !exited() {
            _ = app.forceTerminate()
            let forcedDeadline = Date().addingTimeInterval(3)
            while !exited() && Date() < forcedDeadline { Thread.sleep(forTimeInterval: 0.05) }
        }
        guard exited() else { throw ManagerError(message: "旧启动器尚未退出，旧版本已保留") }
    }
}
private func scheduleCleanup(_ copies: [RetiredCopy], source: URL, incoming: InstalledPackage) throws {
    guard !copies.isEmpty else { return }
    let root = transactionRoot(for: installedManagerURL), id = UUID().uuidString
    let waitsForSource = copies.contains { $0.path == source.standardizedFileURL.path }
    let receipt = CleanupReceipt(id: id, installedVersion: incoming.version.description, parentPID: waitsForSource ? ProcessInfo.processInfo.processIdentifier : 0, copies: copies)
    let file = root.appendingPathComponent("cleanup-\(id).json")
    try JSONEncoder().encode(receipt).write(to: file, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    let worker = Process(); worker.executableURL = installedManagerURL.appendingPathComponent("Contents/MacOS/Code-Codex Mac")
    worker.arguments = ["--finish-update=\(file.path)"]; worker.standardInput = FileHandle.nullDevice; worker.standardOutput = FileHandle.nullDevice; worker.standardError = FileHandle.nullDevice
    try worker.run()
}
func finishUpdate(receiptURL: URL) throws {
    let fm = FileManager.default, root = transactionRoot(for: installedManagerURL)
    guard receiptURL.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL,
          receiptURL.lastPathComponent.hasPrefix("cleanup-"), receiptURL.pathExtension == "json" else { throw ManagerError(message: "更新清理记录位置不正确") }
    let attrs = try fm.attributesOfItem(atPath: receiptURL.path)
    guard attrs[.type] as? FileAttributeType == .typeRegular, (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(), ((attrs[.size] as? NSNumber)?.intValue ?? Int.max) < 256 * 1024 else { throw ManagerError(message: "更新清理记录不可用") }
    let receipt = try JSONDecoder().decode(CleanupReceipt.self, from: Data(contentsOf: receiptURL))
    guard receiptURL.lastPathComponent == "cleanup-\(receipt.id).json" else { throw ManagerError(message: "更新清理记录不匹配") }
    if receipt.parentPID > 0 {
        let deadline = Date().addingTimeInterval(30)
        while kill(receipt.parentPID, 0) == 0 && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
        // GUI installers can leave a completion alert open. Keep the receipt for a later repair.
        if kill(receipt.parentPID, 0) == 0 { return }
    }
    let lock = try UpdateLock(parent: root); defer { withExtendedLifetime(lock) {} }
    let installed = try InstalledPackage.read(installedManagerURL)
    guard let version = ReleaseVersion(receipt.installedVersion), installed.version >= version else { throw ManagerError(message: "安装版本已变化，暂停清理") }
    var warnings = [String]()
    for copy in receipt.copies {
        let url = URL(fileURLWithPath: copy.path)
        guard visibleUserCopy(url), !sameAppPath(url, installedManagerURL), fm.fileExists(atPath: url.path) else { continue }
        do {
            guard try AppFileID.read(url) == copy.fileID else { throw ManagerError(message: "副本已被替换，保留文件：\(copy.path)") }
            let old = try InstalledPackage.read(url)
            guard old.version.description == copy.version, old.version <= installed.version, old.rendererHash == copy.rendererHash, old.launchHash == copy.launchHash, old.effectIDs.isSubset(of: installed.effectIDs) else { throw ManagerError(message: "副本内容已变化，保留文件：\(copy.path)") }
            guard !NSRunningApplication.runningApplications(withBundleIdentifier: managerID).contains(where: { $0.bundleURL.map { sameAppPath($0, url) } ?? false }) else { throw ManagerError(message: "副本仍运行中，保留文件：\(copy.path)") }
            _ = try command("/usr/bin/codesign", ["--verify", "--strict", url.path])
            _ = try command(registrationTool, ["-u", url.path])
            guard visibleUserCopy(url), !sameAppPath(url, installedManagerURL), try AppFileID.read(url) == copy.fileID else { throw ManagerError(message: "副本路径在清理期间变化，已保留") }
            try fm.trashItem(at: url, resultingItemURL: nil)
        } catch { warnings.append(error.localizedDescription) }
    }
    try JSONEncoder().encode(warnings).write(to: root.appendingPathComponent("cleanup-warnings.json"), options: .atomic)
    if warnings.isEmpty { try? fm.removeItem(at: receiptURL) }
}
func performInstallation(from source: URL) throws -> String {
    let incoming = try InstalledPackage.read(source)
    _ = try command("/usr/bin/codesign", ["--verify", "--strict", source.path])
    if FileManager.default.fileExists(atPath: installedManagerURL.path) { try incoming.permitsUpdate(from: InstalledPackage.read(installedManagerURL)) }
    let retired = retiredCopies(source: source, incoming: incoming)
    var before = [[String: Any]]()
    var applied: [[String: Any]]?
    do {
        try installPackage(from: source, to: installedManagerURL, verifier: { url in
            _ = try command("/usr/bin/codesign", ["--verify", "--strict", url.path])
        }, prepare: {
            try stopOldHelpers(allowed: Set(retired.map(\.path) + [installedManagerURL.standardizedFileURL.path]), incoming: incoming)
            before = try DockEntry.read()
        }, registrar: { url in
            _ = try command(registrationTool, ["-f", url.path])
            let filtered = before.filter { entry in !retired.contains { DockEntry.matches(entry, url: URL(fileURLWithPath: $0.path)) } }
            let after = try DockEntry.adding(to: filtered, url: url, official: configuredGPTURL, guid: UInt32.random(in: 1...UInt32.max))
            applied = after
            if !(before as NSArray).isEqual(to: after) { try DockEntry.write(after, reload: true) }
            guard try DockEntry.read().filter({ DockEntry.matches($0, url: url) }).count == 1 else { throw ManagerError(message: "更新后的 Dock 入口未能登记") }
        })
    } catch {
        if let after = applied, let current = try? DockEntry.read(), (current as NSArray).isEqual(to: after) { try? DockEntry.write(before, reload: true) }
        if FileManager.default.fileExists(atPath: installedManagerURL.path) { _ = try? command(registrationTool, ["-f", installedManagerURL.path]) }
        else { _ = try? command(registrationTool, ["-u", installedManagerURL.path]) }
        throw error
    }
    var message = "新版已安装到固定位置 ~/Applications。\n版本 \(incoming.version) · \(incoming.effectIDs.count) 种背景。\n关闭安装窗口后自动清理已确认的旧副本，搜索保留正式入口。\n背景参数保留；完成当前任务并完全退出 GPT 后，点击 Dock 的「GPT 动态背景」加载新版。"
    do { try scheduleCleanup(retired, source: source, incoming: incoming) }
    catch { message += "\n新版已安装，但旧副本清理未完成：\(error.localizedDescription)" }
    return message
}

func installationRollbackSelfTest() throws {
    let fm = FileManager.default, temporary = fm.temporaryDirectory.appendingPathComponent("cc-update-rollback-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: temporary) }
    let target = temporary.appendingPathComponent("Code-Codex Mac.app")
    try installPackage(from: Bundle.main.bundleURL, to: target)
    let expected = try InstalledPackage.read(target)
    do {
        try installPackage(from: Bundle.main.bundleURL, to: target, registrar: { _ in throw ManagerError(message: "模拟入口登记失败") })
        preconditionFailure("Expected registration failure")
    } catch let error as ManagerError { precondition(error.message.contains("模拟")) }
    let restored = try InstalledPackage.read(target)
    precondition(restored == expected)
    let data = try fm.contentsOfDirectory(at: transactionRoot(for: target), includingPropertiesForKeys: nil)
    precondition(data.allSatisfy { $0.lastPathComponent == "install.lock" })
}

// Retry receipts once their installer exits; a long-lived completion alert does
// not make its source bundle disappear while it is still running.
func resumeUpdateCleanup(includingCurrentParent: Bool = false) {
    let root = transactionRoot(for: installedManagerURL), fm = FileManager.default
    let files = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    for file in files where file.lastPathComponent.hasPrefix("cleanup-") && file.pathExtension == "json" {
        guard let attrs = try? fm.attributesOfItem(atPath: file.path), attrs[.type] as? FileAttributeType == .typeRegular,
              (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(), ((attrs[.size] as? NSNumber)?.intValue ?? Int.max) < 256 * 1024,
              let data = try? Data(contentsOf: file), let receipt = try? JSONDecoder().decode(CleanupReceipt.self, from: data),
              receiptURLValid(file, id: receipt.id, root: root) else { continue }
        let current = receipt.parentPID == ProcessInfo.processInfo.processIdentifier
        guard receipt.parentPID == 0 || kill(receipt.parentPID, 0) != 0 || includingCurrentParent && current else { continue }
        let worker = Process(); worker.executableURL = installedManagerURL.appendingPathComponent("Contents/MacOS/Code-Codex Mac")
        worker.arguments = ["--finish-update=\(file.path)"]; worker.standardInput = FileHandle.nullDevice; worker.standardOutput = FileHandle.nullDevice; worker.standardError = FileHandle.nullDevice
        try? worker.run()
    }
}
private func receiptURLValid(_ file: URL, id: String, root: URL) -> Bool {
    file.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL && file.lastPathComponent == "cleanup-\(id).json" && UUID(uuidString: id) != nil
}
