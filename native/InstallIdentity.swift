import Foundation
import CoreFoundation
import CryptoKit
import Darwin

struct ReleaseVersion: Comparable, Equatable, Sendable, CustomStringConvertible {
    let description: String
    private let core: [String]
    private let prerelease: [String]

    init?(_ value: String) {
        let pattern = "(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?"
        guard !value.isEmpty, value.utf8.count <= 256,
              value.range(of: pattern, options: .regularExpression) == value.startIndex..<value.endIndex else { return nil }
        let withoutBuild = value.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false)[0]
        let parts = withoutBuild.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let identifiers = parts.count == 2 ? parts[1].split(separator: ".").map(String.init) : []
        guard identifiers.allSatisfy({ !Self.numeric($0) || $0.count == 1 || !$0.hasPrefix("0") }) else { return nil }
        description = value
        core = parts[0].split(separator: ".").map(String.init)
        prerelease = identifiers
    }

    private static func numeric(_ value: String) -> Bool {
        value.utf8.allSatisfy { $0 >= 48 && $0 <= 57 }
    }

    // Compare decimal strings without overflowing machine integers.
    private static func decimalLess(_ a: String, _ b: String) -> Bool {
        a.count == b.count ? a < b : a.count < b.count
    }

    static func == (a: Self, b: Self) -> Bool {
        // SemVer build metadata has no precedence and does not affect equality.
        a.core == b.core && a.prerelease == b.prerelease
    }

    static func < (a: Self, b: Self) -> Bool {
        for (left, right) in zip(a.core, b.core) where left != right {
            return decimalLess(left, right)
        }
        if a.prerelease.isEmpty || b.prerelease.isEmpty {
            return !a.prerelease.isEmpty && b.prerelease.isEmpty
        }
        for (left, right) in zip(a.prerelease, b.prerelease) where left != right {
            let ln = numeric(left), rn = numeric(right)
            if ln != rn { return ln }
            return ln ? decimalLess(left, right) : left < right
        }
        return a.prerelease.count < b.prerelease.count
    }
}

struct InstalledPackage: Equatable {
    let version: ReleaseVersion
    let channel: String
    let effectIDs: Set<String>
    let rendererHash: String
    let launchHash: String

    static func read(_ app: URL) throws -> Self {
        guard app.isFileURL else { throw ManagerError(message: "安装包必须是本地应用目录") }
        // A trailing slash can make POSIX resolve a final symlink as a directory.
        var path = app.path
        while path.count > 1 && path.hasSuffix("/") { path.removeLast() }
        let root = Darwin.open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard root >= 0 else { throw ManagerError(message: "无法读取安装包目录，或该目录是符号链接") }
        defer { Darwin.close(root) }
        do {
            let plist = try bytes(root: root, path: "Contents/Info.plist", limit: 65_536)
            guard let info = try PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any],
                  info["CFBundleIdentifier"] as? String == managerID,
                  info["CFBundleExecutable"] as? String == managerName,
                  info["CFBundlePackageType"] as? String == "APPL" else {
                throw ManagerError(message: "安装包身份不正确，已保留现有应用")
            }
            let rawVersion = info["CodeCodexVersion"] ?? info["CFBundleShortVersionString"]
            guard let text = rawVersion as? String, let version = ReleaseVersion(text) else {
                throw ManagerError(message: "安装包版本无效，无法安全比较更新版本")
            }
            let channelData = try bytes(root: root, path: "Contents/Resources/channel.json", limit: 65_536)
            guard let metadata = try JSONSerialization.jsonObject(with: channelData) as? [String: Any],
                  let channel = metadata["channel"] as? String,
                  ["public-core", "personal-local"].contains(channel),
                  let ids = metadata["effectIDs"] as? [String], !ids.isEmpty, ids.count <= 64,
                  ids.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 128 && $0.rangeOfCharacter(from: .whitespacesAndNewlines) == nil }),
                  Set(ids).count == ids.count,
                  let count = metadata["effects"] as? NSNumber,
                  CFGetTypeID(count) != CFBooleanGetTypeID(), count.doubleValue == Double(ids.count) else {
                throw ManagerError(message: "安装包渠道或皮肤清单无效，已停止更新")
            }
            let rendererHash = try checkedHash(root: root, name: "renderer")
            let launchHash = try checkedHash(root: root, name: "launch")
            return Self(version: version, channel: channel, effectIDs: Set(ids), rendererHash: rendererHash, launchHash: launchHash)
        } catch let error as ManagerError {
            throw error
        } catch {
            throw ManagerError(message: "安装包元数据无法解析，已停止更新")
        }
    }

    func permitsUpdate(from old: Self) throws {
        guard version >= old.version else {
            throw ManagerError(message: "安装包版本 \(version) 低于已安装版本 \(old.version)，已保留最新版")
        }
        guard channel == old.channel else {
            throw ManagerError(message: "更新渠道不同（\(old.channel) → \(channel)），已保留当前版本与皮肤")
        }
        let missing = old.effectIDs.subtracting(effectIDs)
        guard missing.isEmpty else {
            throw ManagerError(message: "更新会移除 \(missing.count) 种已有皮肤，已停止更新并保留当前版本")
        }
    }

    private static func checkedHash(root: Int32, name: String) throws -> String {
        let code = try bytes(root: root, path: "Contents/Resources/\(name).js", limit: 4 * 1_024 * 1_024)
        let digest = try bytes(root: root, path: "Contents/Resources/\(name).sha256", limit: 128)
        guard !code.isEmpty, let stored = String(data: digest, encoding: .utf8) else {
            throw ManagerError(message: "背景组件 \(name) 的校验信息无效")
        }
        let expected = stored.trimmingCharacters(in: .whitespacesAndNewlines)
        let actual = SHA256.hash(data: code).map { String(format: "%02x", $0) }.joined()
        guard expected.utf8.count == 64, expected.range(of: "^[0-9a-fA-F]{64}$", options: .regularExpression) != nil,
              expected.lowercased() == actual else {
            throw ManagerError(message: "背景组件 \(name) 完整性检查失败，请重新下载安装包")
        }
        return actual
    }

    // Open every component relative to the already-open application directory.
    // O_NOFOLLOW also closes the check-then-follow race for replaced symlinks.
    private static func bytes(root: Int32, path: String, limit: Int) throws -> Data {
        let parts = path.split(separator: "/").map(String.init)
        guard !parts.isEmpty, parts.allSatisfy({ $0 != "." && $0 != ".." }) else {
            throw ManagerError(message: "安装包资源路径无效")
        }
        var parent = root, opened: [Int32] = []
        defer { for descriptor in opened.reversed() { Darwin.close(descriptor) } }
        for component in parts.dropLast() {
            let descriptor = Darwin.openat(parent, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            guard descriptor >= 0 else { throw ManagerError(message: "安装包缺少资源目录，或资源目录是符号链接") }
            opened.append(descriptor); parent = descriptor
        }
        let descriptor = Darwin.openat(parent, parts.last!, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard descriptor >= 0 else { throw ManagerError(message: "安装包缺少 \(parts.last!)，或该资源是符号链接") }
        opened.append(descriptor)
        var attributes = stat()
        guard Darwin.fstat(descriptor, &attributes) == 0,
              attributes.st_mode & mode_t(S_IFMT) == mode_t(S_IFREG),
              attributes.st_size >= 0, attributes.st_size <= Int64(limit) else {
            throw ManagerError(message: "安装包资源 \(parts.last!) 类型或大小无效")
        }
        var result = Data(), buffer = [UInt8](repeating: 0, count: 16_384)
        while true {
            let count = buffer.withUnsafeMutableBytes { Darwin.read(descriptor, $0.baseAddress!, $0.count) }
            if count == 0 { return result }
            if count < 0 {
                if errno == EINTR { continue }
                throw ManagerError(message: "无法完整读取安装包资源 \(parts.last!)")
            }
            guard result.count <= limit - count else { throw ManagerError(message: "安装包资源 \(parts.last!) 超过大小限制") }
            result.append(contentsOf: buffer.prefix(count))
        }
    }
}

func installIdentitySelfTest() throws {
    let fm = FileManager.default
    let temporary = fm.temporaryDirectory.appendingPathComponent("code-codex-identity-\(UUID().uuidString).noindex")
    try fm.createDirectory(at: temporary, withIntermediateDirectories: false)
    defer { try? fm.removeItem(at: temporary) }
    func require(_ condition: Bool, _ message: String) throws {
        guard condition else { throw ManagerError(message: "安装身份自检失败：\(message)") }
    }
    func rejects(_ message: String, _ body: () throws -> Void) throws {
        do { try body() } catch is ManagerError { return }
        throw ManagerError(message: "安装身份自检未拒绝：\(message)")
    }
    func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    func fixture(_ name: String, version: String = "1.0.0-rc.6", channel: String = "personal-local", ids: [String] = ["black-hole", "aurora-ionosphere"], count: Any? = nil) throws -> URL {
        let app = temporary.appendingPathComponent(name + ".app"), resources = app.appendingPathComponent("Contents/Resources")
        try fm.createDirectory(at: resources, withIntermediateDirectories: true)
        let info: [String: Any] = ["CFBundleIdentifier": managerID, "CFBundleExecutable": managerName, "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "1.0.0", "CodeCodexVersion": version]
        try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: app.appendingPathComponent("Contents/Info.plist"))
        let metadata: [String: Any] = ["channel": channel, "effects": count ?? ids.count, "effectIDs": ids]
        try JSONSerialization.data(withJSONObject: metadata).write(to: resources.appendingPathComponent("channel.json"))
        for script in ["renderer", "launch"] {
            let bytes = Data("local-fixture-\(script)".utf8)
            try bytes.write(to: resources.appendingPathComponent(script + ".js"))
            try Data((digest(bytes) + "\n").utf8).write(to: resources.appendingPathComponent(script + ".sha256"))
        }
        return app
    }
    let versions = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0-rc.9", "1.0.0-rc.10", "1.0.0", "1.0.1"].compactMap(ReleaseVersion.init)
    try require(versions.count == 11 && zip(versions, versions.dropFirst()).allSatisfy({ $0 < $1 }), "SemVer 顺序")
    for invalid in ["", "1.0", "01.0.0", "1.01.0", "1.0.01", "1.0.0-rc.01", "1.0.0-", "1.0.0+", "1.0.0-rc..1", "1.0.0\n", "v1.0.0", "1.0.0_foo"] {
        try require(ReleaseVersion(invalid) == nil, "拒绝非法版本 \(invalid)")
    }
    try require(ReleaseVersion("1.0.0+build.01") == ReleaseVersion("1.0.0+other.2"), "构建元数据不改变优先级")
    try require(ReleaseVersion("999999999999999999999.0.0")! > ReleaseVersion("9.0.0")!, "大版本数字不溢出")
    let old = try InstalledPackage.read(fixture("old")), newer = try InstalledPackage.read(fixture("new", version: "1.0.0-rc.10"))
    try newer.permitsUpdate(from: old)
    try old.permitsUpdate(from: old)
    try rejects("降级") { try old.permitsUpdate(from: newer) }
    let publicPackage = try InstalledPackage.read(fixture("public", version: "1.0.1", channel: "public-core", ids: ["black-hole"]))
    try rejects("公共版覆盖个人版") { try publicPackage.permitsUpdate(from: old) }
    let otherChannel = try InstalledPackage.read(fixture("other-channel", version: "1.0.1", channel: "public-core"))
    try rejects("不同渠道") { try otherChannel.permitsUpdate(from: old) }
    let fewer = try InstalledPackage.read(fixture("fewer", version: "1.0.1", ids: ["black-hole"]))
    try rejects("同渠道减少皮肤") { try fewer.permitsUpdate(from: old) }
    let replaced = try InstalledPackage.read(fixture("replaced", version: "1.0.1", ids: ["black-hole", "mountain"]))
    try rejects("数量相同但丢失皮肤") { try replaced.permitsUpdate(from: old) }
    let expanded = try InstalledPackage.read(fixture("expanded", version: "1.0.1", ids: ["black-hole", "aurora-ionosphere", "mountain"]))
    try expanded.permitsUpdate(from: old)
    try rejects("重复皮肤 ID") { _ = try InstalledPackage.read(fixture("duplicates", ids: ["black-hole", "black-hole"])) }
    try rejects("空皮肤 ID") { _ = try InstalledPackage.read(fixture("empty", ids: [""])) }
    try rejects("皮肤数量不一致") { _ = try InstalledPackage.read(fixture("wrong-count", count: 8)) }
    try rejects("布尔数量") { _ = try InstalledPackage.read(fixture("bool-count", ids: ["black-hole"], count: true)) }
    try rejects("非法渠道") { _ = try InstalledPackage.read(fixture("unknown-channel", channel: "unknown")) }
    try rejects("非法版本") { _ = try InstalledPackage.read(fixture("bad-version", version: "1.0.0-rc.01")) }
    for (key, value) in [("CFBundleIdentifier", "com.example.other"), ("CFBundleExecutable", "Other App"), ("CFBundlePackageType", "BNDL")] {
        let invalid = try fixture("bad-identity-" + key), plistURL = invalid.appendingPathComponent("Contents/Info.plist")
        var info = try PropertyListSerialization.propertyList(from: Data(contentsOf: plistURL), format: nil) as! [String: Any]
        info[key] = value
        try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: plistURL)
        try rejects("错误应用身份 \(key)") { _ = try InstalledPackage.read(invalid) }
    }
    let tampered = try fixture("tampered")
    try Data("changed".utf8).write(to: tampered.appendingPathComponent("Contents/Resources/renderer.js"))
    try rejects("资源篡改") { _ = try InstalledPackage.read(tampered) }
    let oversized = try fixture("oversized")
    try Data(repeating: 0, count: 4 * 1_024 * 1_024 + 1).write(to: oversized.appendingPathComponent("Contents/Resources/launch.js"))
    try rejects("超大资源") { _ = try InstalledPackage.read(oversized) }
    let linkedRoot = temporary.appendingPathComponent("linked-root.app")
    try fm.createSymbolicLink(at: linkedRoot, withDestinationURL: temporary.appendingPathComponent("old.app"))
    try rejects("应用根符号链接") { _ = try InstalledPackage.read(linkedRoot) }
    try rejects("带尾斜杠的应用根符号链接") { _ = try InstalledPackage.read(URL(fileURLWithPath: linkedRoot.path + "/", isDirectory: true)) }
    for component in ["Contents", "Contents/Resources", "Contents/Info.plist", "Contents/Resources/channel.json", "Contents/Resources/renderer.js", "Contents/Resources/launch.sha256"] {
        let linked = try fixture("linked-" + UUID().uuidString)
        let target = linked.appendingPathComponent(component), external = temporary.appendingPathComponent("outside-" + UUID().uuidString)
        try fm.moveItem(at: target, to: external)
        try fm.createSymbolicLink(at: target, withDestinationURL: external)
        try rejects("资源符号链接 \(component)") { _ = try InstalledPackage.read(linked) }
    }
}
