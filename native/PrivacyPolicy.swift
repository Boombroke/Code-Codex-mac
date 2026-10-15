import Foundation

func nonemptyPurpose(_ value: Any?) -> Bool {
    guard let text = value as? String else { return false }
    return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

func packagedPrivacyDescriptions() throws -> [String: String] {
    guard let file = Bundle.main.url(forResource: "privacy-descriptions", withExtension: "json"),
          let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
          let size = attributes[.size] as? NSNumber, size.intValue <= 65_536 else {
        throw ManagerError(message: "启动器的用途说明组件缺失，请重新安装。")
    }
    let value = try JSONSerialization.jsonObject(with: Data(contentsOf: file))
    guard let policy = value as? [String: Any], policy["schemaVersion"] as? Int == 1,
          let descriptions = policy["descriptions"] as? [String: String], !descriptions.isEmpty,
          descriptions.count <= 64,
          descriptions.allSatisfy({ key, value in key.range(of: "^NS[A-Za-z]+UsageDescription$", options: .regularExpression) != nil && nonemptyPurpose(value) }) else {
        throw ManagerError(message: "启动器的用途说明组件无效，请重新安装。")
    }
    return descriptions
}

func missingHostedPrivacyDescriptions(hostInfo: [String: Any], launcherInfo: [String: Any]) -> [String] {
    hostInfo.keys.filter { $0.hasPrefix("NS") && $0.hasSuffix("UsageDescription") && !nonemptyPurpose(launcherInfo[$0]) }.sorted()
}

func validateHostedPrivacyDescriptions(hostInfo: [String: Any], launcherInfo: [String: Any]) throws {
    guard missingHostedPrivacyDescriptions(hostInfo: hostInfo, launcherInfo: launcherInfo).isEmpty else {
        throw ManagerError(message: "官方 GPT 的隐私用途声明有更新，当前启动器尚未覆盖。请更新启动器，或暂时从原版 GPT 入口启动。")
    }
}

func privacyPolicySelfTest() throws {
    let policy = try packagedPrivacyDescriptions()
    let info = Bundle.main.infoDictionary ?? [:]
    guard policy.allSatisfy({ key, value in nonemptyPurpose(info[key]) && info[key] as? String == value }) else {
        throw ManagerError(message: "打包后的隐私用途声明与策略不一致。")
    }
    try validateHostedPrivacyDescriptions(hostInfo: policy, launcherInfo: info)
    let host: [String: Any] = ["CFBundleIdentifier": "sample.host", "NSCameraUsageDescription": "camera", "NSMicrophoneUsageDescription": "audio"]
    precondition(missingHostedPrivacyDescriptions(hostInfo: host, launcherInfo: ["NSMicrophoneUsageDescription": "audio"]) == ["NSCameraUsageDescription"])
    precondition(missingHostedPrivacyDescriptions(hostInfo: host, launcherInfo: ["NSCameraUsageDescription": " \n", "NSMicrophoneUsageDescription": 7]) == ["NSCameraUsageDescription", "NSMicrophoneUsageDescription"])
    var futureHost = host; futureHost["NSFutureFeatureUsageDescription"] = "new feature"
    do { try validateHostedPrivacyDescriptions(hostInfo: futureHost, launcherInfo: info); preconditionFailure("Unknown host privacy feature must fail before launch") }
    catch is ManagerError {}
    precondition(missingHostedPrivacyDescriptions(hostInfo: [:], launcherInfo: info).isEmpty)
}
