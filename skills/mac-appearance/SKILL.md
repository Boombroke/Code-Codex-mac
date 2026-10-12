---
name: mac-appearance
description: Explain or troubleshoot the installed Code-Codex Mac Dock launcher, its app-window appearance controls, installation and removal.
---

# Code-Codex Mac

Resolve this package root two levels above the skill directory and read its README for current support. The native launcher is `~/Applications/Code-Codex Mac.app`, displayed as **GPT 动态背景** in Dock. The optional companion plugin carries guidance only; installing it alone does not activate a theme. Native installation copies the launcher and adds its Dock entry without invoking plugin downloads. Register guidance separately with the available Codex plugin API or CLI when requested; the current user already authorized its installation.

The user chose a one-click Dock launcher that preserves the official GPT bundle, signature and login. Do not patch, re-sign or replace the official app or its existing Dock entry. The installer adds a separate theme entry and removes only its own entry on uninstall. Have the user finish active work, fully quit GPT on the first switch, then click **GPT 动态背景** once in Dock. Do not close chats or bypass a self-app control restriction. Normal launch of the installed app immediately starts the official process and background session; do not open it merely to inspect its GUI during a live GPT task. Uninstalled copies open setup instead, and `--manage` is an explicit settings mode.

The launch intent enables the last selected background, resumes its animation and preserves parameters. Repeated Dock clicks activate the owned GPT window; an already running ordinary GPT session requires a normal exit and restart. The menu bar **✦** exposes settings, restore and uninstall. Agent-side `--startup-check`, `--self-test`, install and Dock state commands do not launch or connect to GPT.

Within GPT, **Preview Market → Appearance** controls backgrounds and **Mac 设置** controls performance, 75% composer transparency (25% tint) and code-block frosting. Text opacity stays at 100%. The companion plugin has no native theme API or automatic lifecycle hook.

The public build contains four effects with retained upstream source records. A separately built personal-local manager may contain the user's existing local eight-effect runtime; never upload that private build as a public artifact. Unknown licensing is not fixed by adding an attribution.

Use menu bar **✦ → 恢复当前窗口外观** or the in-window restore button for temporary removal. **✦ → 卸载 GPT 动态背景…** removes its Dock entry, launcher and companion registration while preserving GPT, other Dock items and chats. Fully exit GPT and open it from the original icon to end debug access. Closing settings leaves the background helper active; quitting it stops new-page injection.

This is a release candidate until actual activation is confirmed. Build, self-test and an independent renderer preview do not prove host compatibility. Keep signing and notarization status explicit when discussing public release.
