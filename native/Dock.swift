import Foundation
import CoreFoundation

enum DockEntry {
    static let domain = "com.apple.dock" as CFString
    static let key = "persistent-apps" as CFString
    static let label = "GPT 动态背景"

    static func matches(_ entry: [String: Any], url: URL) -> Bool {
        guard let tile = entry["tile-data"] as? [String: Any], let file = tile["file-data"] as? [String: Any],
              let value = file["_CFURLString"] as? String, let candidate = URL(string: value), candidate.isFileURL else { return false }
        return candidate.standardizedFileURL.resolvingSymlinksInPath().path == url.standardizedFileURL.resolvingSymlinksInPath().path
    }

    static func tile(url: URL, guid: UInt32) throws -> [String: Any] {
        var data: [String: Any] = ["file-data": ["_CFURLString": URL(fileURLWithPath: url.path, isDirectory: true).absoluteString, "_CFURLStringType": 15], "file-label": label, "file-type": 41, "bundle-identifier": managerID, "dock-extra": false, "is-beta": true]
        if FileManager.default.fileExists(atPath: url.path) { data["book"] = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) }
        return ["GUID": guid, "tile-type": "file-tile", "tile-data": data]
    }

    static func adding(to entries: [[String: Any]], url: URL, official: URL, guid: UInt32) throws -> [[String: Any]] {
        // Keep an existing entry and its position. Remove only duplicate references to our exact installation path.
        let ownedIndices = entries.indices.filter { matches(entries[$0], url: url) }
        if let first = ownedIndices.first { return entries.enumerated().filter { $0.offset == first || !ownedIndices.contains($0.offset) }.map(\.element) }
        var result = entries
        let index = entries.firstIndex { matches($0, url: official) }.map { $0 + 1 } ?? entries.count
        result.insert(try tile(url: url, guid: guid), at: index)
        return result
    }

    static func removing(from entries: [[String: Any]], url: URL) -> [[String: Any]] { entries.filter { !matches($0, url: url) } }

    static func read() throws -> [[String: Any]] {
        _ = CFPreferencesAppSynchronize(domain)
        guard let stored = CFPreferencesCopyAppValue(key, domain) else { return [] }
        guard let entries = stored as? [[String: Any]] else { throw ManagerError(message: "无法识别当前 Dock 配置，已保留它的原有内容") }
        return entries
    }

    static func write(_ entries: [[String: Any]], reload: Bool) throws {
        guard !CFPreferencesAppValueIsForced(key, domain) else { throw ManagerError(message: "Dock 入口由系统管理策略控制，无法自动修改") }
        CFPreferencesSetAppValue(key, entries as CFArray, domain)
        guard CFPreferencesAppSynchronize(domain) else { throw ManagerError(message: "无法保存 Dock 入口") }
        if reload { _ = try? command("/usr/bin/killall", ["Dock"]) }
    }

    static func pin(url: URL, official: URL, reload: Bool = true) throws {
        let before = try read()
        let after = try adding(to: before, url: url, official: official, guid: UInt32.random(in: 1...UInt32.max))
        if !(before as NSArray).isEqual(to: after) { try write(after, reload: reload) }
        guard try read().filter({ matches($0, url: url) }).count == 1 else { throw ManagerError(message: "Dock 入口未登记，请将应用从 Finder 拖入 Dock") }
    }

    static func remove(url: URL, reload: Bool = true) throws {
        let before = try read(), after = removing(from: before, url: url)
        if !(before as NSArray).isEqual(to: after) { try write(after, reload: reload) }
        guard try !read().contains(where: { matches($0, url: url) }) else { throw ManagerError(message: "未能移除 Dock 入口") }
    }

    static func selfTest() throws {
        let official = URL(fileURLWithPath: "/test/ChatGPT.app"), owned = URL(fileURLWithPath: "/test/Code-Codex Mac.app")
        let a: [String: Any] = ["GUID": 1, "tile-type": "file-tile", "tile-data": ["file-data": ["_CFURLString": "file:///test/ChatGPT.app/", "_CFURLStringType": 15], "book": Data([1,2,3])]]
        let b: [String: Any] = ["GUID": 2, "tile-type": "spacer-tile"]
        let original = [a,b]
        let added = try adding(to: original, url: owned, official: official, guid: 3)
        precondition(added.count == 3 && matches(added[1], url: owned))
        precondition((added[0] as NSDictionary).isEqual(to: a) && (added[2] as NSDictionary).isEqual(to: b))
        let again = try adding(to: added, url: owned, official: official, guid: 4)
        precondition((again as NSArray).isEqual(to: added))
        let deduplicated = try adding(to: added + [added[1]], url: owned, official: official, guid: 5)
        precondition((deduplicated as NSArray).isEqual(to: added))
        precondition((removing(from: added, url: owned) as NSArray).isEqual(to: original))
        precondition((removing(from: original, url: owned) as NSArray).isEqual(to: original))
        let otherCopy = try tile(url: URL(fileURLWithPath: "/other/Code-Codex Mac.app"), guid: 6)
        precondition(removing(from: [otherCopy], url: owned).count == 1)
    }
}
