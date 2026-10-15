import Foundation

enum StartupMode: String { case configuration, direct }
enum OpenAction: String { case start, activate, reconnect, wait, requireQuit }

// These leases remain on the main actor. Identity is checked again after every
// suspension so an old callback cannot mutate a newer process or monitor.
struct SessionLifecycle {
    enum Operation { case restoring, uninstalling, quitting }
    private(set) var processID: UUID?
    private(set) var monitorID: UUID?
    private var operation: (id: UUID, kind: Operation)?
    var isBusy: Bool { operation != nil }
    mutating func beginProcess(_ id: UUID = UUID()) -> UUID {
        processID = id; monitorID = nil; return id
    }
    mutating func beginMonitor() -> UUID {
        let id = UUID(); monitorID = id; return id
    }
    mutating func stopMonitor() { monitorID = nil }
    func ownsProcess(_ id: UUID) -> Bool { processID == id }
    func ownsMonitor(_ id: UUID, process: UUID) -> Bool {
        !isBusy && processID == process && monitorID == id
    }
    mutating func endProcess(_ id: UUID) -> Bool {
        guard processID == id else { return false }
        processID = nil; monitorID = nil; return true
    }
    mutating func begin(_ kind: Operation) -> UUID? {
        guard operation == nil else { return nil }
        let id = UUID(); operation = (id, kind); stopMonitor(); return id
    }
    mutating func finish(_ id: UUID) -> Bool {
        guard operation?.id == id else { return false }
        operation = nil; return true
    }
}

func sessionLifecycleSelfTest() {
    var state = SessionLifecycle()
    let first = state.beginProcess(), monitor = state.beginMonitor()
    precondition(state.ownsMonitor(monitor, process: first))
    let restore = state.begin(.restoring)!
    precondition(state.isBusy && !state.ownsMonitor(monitor, process: first))
    precondition(state.begin(.restoring) == nil && state.begin(.uninstalling) == nil)
    precondition(state.finish(restore) && !state.isBusy)
    let second = state.beginProcess(), replacement = state.beginMonitor()
    precondition(!state.endProcess(first))
    precondition(state.ownsProcess(second) && state.ownsMonitor(replacement, process: second))
    precondition(state.endProcess(second) && !state.ownsMonitor(replacement, process: second))
    let quit = state.begin(.quitting)!
    precondition(!state.finish(restore) && state.isBusy)
    precondition(state.finish(quit))
}
func sameLocation(_ a: URL, _ b: URL) -> Bool { a.standardizedFileURL.resolvingSymlinksInPath().path == b.standardizedFileURL.resolvingSymlinksInPath().path }

func hostExitMessage(status: Int32, signalled: Bool) -> String {
    let next = "下次点击 Dock 的「GPT 动态背景」即可启动。"
    if signalled { return "GPT 已异常退出（信号 \(status)）。" + next }
    if status != 0 { return "GPT 已异常退出（退出码 \(status)）。" + next }
    return "GPT 已退出。" + next
}

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
    sessionLifecycleSelfTest()
    precondition(hostExitMessage(status: 0, signalled: false) == "GPT 已退出。下次点击 Dock 的「GPT 动态背景」即可启动。")
    precondition(hostExitMessage(status: 2, signalled: false).contains("退出码 2"))
    precondition(hostExitMessage(status: 6, signalled: true).contains("信号 6"))
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
