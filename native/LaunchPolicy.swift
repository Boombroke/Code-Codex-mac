import Foundation

enum StartupMode: String { case configuration, direct }
enum OpenAction: String { case start, activate, reconnect, wait, requireQuit }
func sameLocation(_ a: URL, _ b: URL) -> Bool { a.standardizedFileURL.resolvingSymlinksInPath().path == b.standardizedFileURL.resolvingSymlinksInPath().path }

func startupMode(arguments: [String], bundle: URL, installed: URL) -> StartupMode {
    if arguments.contains("--manage") || !sameLocation(bundle, installed) { return .configuration }
    return .direct
}

func openAction(launching: Bool, ownedRunning: Bool, connected: Bool, monitoring: Bool, otherRunning: Bool) -> OpenAction {
    if launching { return .wait }
    if ownedRunning { return connected || monitoring ? .activate : .reconnect }
    return otherRunning ? .requireQuit : .start
}

func launchPolicySelfTest() {
    let installed = URL(fileURLWithPath: "/test/Applications/Code-Codex Mac.app")
    precondition(startupMode(arguments: [], bundle: installed, installed: installed) == .direct)
    precondition(startupMode(arguments: [], bundle: URL(fileURLWithPath: installed.path, isDirectory: true), installed: installed) == .direct)
    precondition(startupMode(arguments: ["--manage"], bundle: installed, installed: installed) == .configuration)
    precondition(startupMode(arguments: [], bundle: URL(fileURLWithPath: "/test/download.app"), installed: installed) == .configuration)
    precondition(openAction(launching: false, ownedRunning: false, connected: false, monitoring: false, otherRunning: false) == .start)
    precondition(openAction(launching: true, ownedRunning: false, connected: false, monitoring: false, otherRunning: false) == .wait)
    precondition(openAction(launching: false, ownedRunning: true, connected: true, monitoring: true, otherRunning: true) == .activate)
    precondition(openAction(launching: false, ownedRunning: true, connected: false, monitoring: false, otherRunning: true) == .reconnect)
    precondition(openAction(launching: false, ownedRunning: false, connected: false, monitoring: false, otherRunning: true) == .requireQuit)
}
