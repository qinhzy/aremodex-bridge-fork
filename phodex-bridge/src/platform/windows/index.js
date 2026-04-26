// FILE: platform/windows/index.js
// Purpose: Windows platform adapter for M2 foreground runs, diagnostics, and path/firewall checks.
// Layer: Platform abstraction
// Exports: WindowsAdapter
// Depends on: ../base, ../foreground-daemon-manager, ../../bridge, ./codex-locator, ./console, ./firewall-manager, ./path-diagnostics

const { PlatformAdapter } = require("../base");
const { ForegroundDaemonManager } = require("../foreground-daemon-manager");
const { startBridge } = require("../../bridge");
const { WindowsCodexLocator } = require("./codex-locator");
const { WindowsConsoleManager } = require("./console");
const { WindowsFirewallManager } = require("./firewall-manager");
const {
  buildWindowsPathDiagnostics,
  normalizeWindowsWorkspacePath,
} = require("./path-diagnostics");

class WindowsAdapter extends PlatformAdapter {
  constructor(deps = {}) {
    const consoleManager = deps.consoleManager || new WindowsConsoleManager(deps.consoleDeps);
    const codex = deps.codex || new WindowsCodexLocator(deps.codexDeps);
    const firewall = deps.firewall || new WindowsFirewallManager(deps.firewallDeps);
    super({
      id: "win32",
      displayName: "Windows",
      daemon: deps.daemon || new ForegroundDaemonManager({
        platformId: "win32",
        displayName: "Windows",
        startBridge: deps.startBridge || startBridge,
        resetBridgePairing: deps.resetBridgePairing,
      }),
      codex,
      firewall,
    });
    this.consoleManager = consoleManager;
  }

  prepareForegroundRun({
    env = process.env,
    cwd = process.cwd(),
    config = null,
    forceConsole = false,
  } = {}) {
    const encoding = this.consoleManager.configure({ env, force: forceConsole });
    const firewall = this.firewall.getFirewallStatus({ env, config });
    const workspacePath = this.normalizeWorkspacePath(cwd);
    const warnings = [
      ...encoding.warnings,
      ...firewall.warnings,
    ];

    return {
      env,
      platform: this.id,
      encoding,
      firewall,
      workspacePath,
      warnings,
      messages: [
        buildEncodingMessage(encoding),
        `[remodex] Windows workspace: ${workspacePath}`,
      ].filter(Boolean),
      bridgeOptions: {},
    };
  }

  normalizeWorkspacePath(workspacePath) {
    return normalizeWindowsWorkspacePath(workspacePath);
  }

  diagnose({
    env = process.env,
    cwd = process.cwd(),
    config = null,
  } = {}) {
    const statePaths = this.resolveStatePaths({ env });
    const codexHome = this.codex.resolveCodexHome({ env });
    const sessionsDir = this.codex.resolveSessionsDir({ env });
    const paths = buildWindowsPathDiagnostics({
      env,
      cwd,
      codexHome,
      sessionsDir,
      statePaths,
    });
    const codexInstallations = this.codex.detectCodexInstallations({ env });
    const firewall = this.firewall.getFirewallStatus({ env, config });

    return {
      platform: this.id,
      displayName: this.displayName,
      daemon: {
        supportsBackgroundDaemon: this.daemon.supportsBackgroundDaemon,
        usesDaemonForUp: this.daemon.usesDaemonForUp,
        foregroundOnly: true,
      },
      encoding: this.consoleManager.getDiagnostics({ env }),
      codex: {
        nativeCodexHome: codexHome,
        nativeSessionsDir: sessionsDir,
        installations: codexInstallations,
        selected: codexInstallations.find((candidate) => candidate.available) || null,
      },
      paths,
      firewall,
      statePaths,
    };
  }
}

function buildEncodingMessage(encoding) {
  if (!encoding?.attempted) {
    return "[remodex] Windows console output uses UTF-8 when redirected; no interactive code page change was needed.";
  }

  if (encoding.codePageAfter === "65001") {
    return "[remodex] Windows console prepared for UTF-8 output (code page 65001).";
  }

  return "[remodex] Windows console UTF-8 preparation was attempted; run `aremodex-bridge diagnose` if logs look garbled.";
}

module.exports = {
  WindowsAdapter,
};
