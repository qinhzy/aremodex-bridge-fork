// FILE: platform/base.js
// Purpose: Defines the platform adapter contracts shared by daemon, Codex, and firewall managers.
// Layer: Platform abstraction
// Exports: PlatformAdapter, DaemonManager, CodexLocator, FirewallManager
// Depends on: os, path, ../codex-desktop-refresher, ../daemon-state

const os = require("os");
const path = require("path");
const { readBridgeConfig } = require("../codex-desktop-refresher");
const {
  resolveBridgeLogsDir,
  resolveBridgeStatusPath,
  resolveBridgeStderrLogPath,
  resolveBridgeStdoutLogPath,
  resolveDaemonConfigPath,
  resolvePairingSessionPath,
  resolveRemodexStateDir,
} = require("../daemon-state");

class PlatformAdapter {
  constructor({
    id,
    displayName,
    daemon,
    codex,
    firewall,
  }) {
    this.id = id;
    this.displayName = displayName;
    this.daemon = daemon;
    this.codex = codex;
    this.firewall = firewall;
  }

  resolveStatePaths(options = {}) {
    return {
      stateDir: resolveRemodexStateDir(options),
      daemonConfigPath: resolveDaemonConfigPath(options),
      pairingSessionPath: resolvePairingSessionPath(options),
      bridgeStatusPath: resolveBridgeStatusPath(options),
      logsDir: resolveBridgeLogsDir(options),
      stdoutLogPath: resolveBridgeStdoutLogPath(options),
      stderrLogPath: resolveBridgeStderrLogPath(options),
    };
  }

  readBridgeConfig(options = {}) {
    return readBridgeConfig(options);
  }

  buildServiceEnvironment(config = {}, env = process.env) {
    const stateDir = config.stateDir || resolveRemodexStateDir({ env });
    return {
      ...env,
      REMODEX_DEVICE_STATE_DIR: stateDir,
    };
  }

  prepareForegroundRun({ env = process.env } = {}) {
    return {
      env,
      platform: this.id,
    };
  }

  normalizeWorkspacePath(workspacePath) {
    return typeof workspacePath === "string" && workspacePath
      ? path.resolve(workspacePath)
      : workspacePath;
  }

  openThreadInDesktop() {
    throw new Error(`${this.displayName} does not support desktop handoff here.`);
  }

  diagnose() {
    return {
      platform: this.id,
      displayName: this.displayName,
      daemon: {
        supportsBackgroundDaemon: this.daemon.supportsBackgroundDaemon,
      },
      codexHome: this.codex.resolveCodexHome({ env: process.env }),
      statePaths: this.resolveStatePaths(),
    };
  }
}

class DaemonManager {
  constructor({ platformId, displayName }) {
    this.platformId = platformId;
    this.displayName = displayName;
  }

  get supportsBackgroundDaemon() {
    return false;
  }

  get usesDaemonForUp() {
    return false;
  }

  async installDaemon() {
    throw unsupportedDaemonError(this.displayName);
  }

  async uninstallDaemon() {
    throw unsupportedDaemonError(this.displayName);
  }

  async startDaemon() {
    throw unsupportedDaemonError(this.displayName);
  }

  async stopDaemon() {
    throw unsupportedDaemonError(this.displayName);
  }

  async restartDaemon(options = {}) {
    return this.startDaemon(options);
  }

  getDaemonStatus() {
    throw unsupportedDaemonError(this.displayName);
  }

  printDaemonStatus() {
    throw unsupportedDaemonError(this.displayName);
  }

  tailDaemonLogs() {
    throw unsupportedDaemonError(this.displayName);
  }

  runDaemonEntrypoint() {
    throw unsupportedDaemonError(this.displayName);
  }

  waitForPairingSession() {
    throw unsupportedDaemonError(this.displayName);
  }

  printPairingQr() {
    throw unsupportedDaemonError(this.displayName);
  }

  resetPairing() {
    throw unsupportedDaemonError(this.displayName);
  }
}

class CodexLocator {
  constructor({
    platformId,
    displayName,
    osImpl = os,
  }) {
    this.platformId = platformId;
    this.displayName = displayName;
    this.osImpl = osImpl;
  }

  createCodexLaunchPlans() {
    return [];
  }

  detectCodexInstallations(options = {}) {
    return this.createCodexLaunchPlans(options).map((plan, index) => ({
      id: `${this.platformId}:codex:${index}`,
      platform: this.platformId,
      description: plan.description || plan.command,
      command: plan.command,
      args: plan.args || [],
      available: true,
    }));
  }

  selectCodexRuntime(options = {}) {
    const installations = this.detectCodexInstallations(options);
    return installations[0] || null;
  }

  resolveCodexHome({ env = process.env } = {}) {
    return env.CODEX_HOME || path.join(this.osImpl.homedir(), ".codex");
  }

  resolveSessionsDir(options = {}) {
    return path.join(this.resolveCodexHome(options), "sessions");
  }

  verifyAppServer() {
    return {
      ok: null,
      reason: "not_checked",
    };
  }
}

class FirewallManager {
  constructor({ platformId, displayName }) {
    this.platformId = platformId;
    this.displayName = displayName;
  }

  getFirewallStatus() {
    return {
      supported: false,
      rules: [],
      warnings: [],
    };
  }

  ensureFirewallRule() {
    return {
      changed: false,
      supported: false,
    };
  }

  removeFirewallRules() {
    return {
      changed: false,
      supported: false,
    };
  }
}

function unsupportedDaemonError(displayName) {
  return new Error(`${displayName} does not support background daemon management yet.`);
}

module.exports = {
  CodexLocator,
  DaemonManager,
  FirewallManager,
  PlatformAdapter,
};
