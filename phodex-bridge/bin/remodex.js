#!/usr/bin/env node
// FILE: remodex.js
// Purpose: CLI surface for foreground bridge runs, pairing reset, thread resume, and macOS service control.
// Layer: CLI binary
// Exports: none
// Depends on: ../src

const os = require("os");
const {
  createPlatformAdapter,
  readBridgeConfig,
  startBridge,
  resetBridgePairing,
  openLastActiveThread,
  watchThreadRollout,
} = require("../src");
const { version } = require("../package.json");

const defaultDeps = {
  createPlatformAdapter,
  readBridgeConfig,
  startBridge,
  resetBridgePairing,
  openLastActiveThread,
  watchThreadRollout,
};

if (require.main === module) {
  void main();
}

// ─── ENTRY POINT ─────────────────────────────────────────────

async function main({
  argv = process.argv,
  platform = os.platform(),
  consoleImpl = console,
  exitImpl = process.exit,
  deps = defaultDeps,
} = {}) {
  const { command, jsonOutput, watchThreadId } = parseCliArgs(argv.slice(2));

  if (isVersionCommand(command)) {
    emitVersion({ jsonOutput, consoleImpl });
    return;
  }

  const adapter = deps.createPlatformAdapter({
    platform,
    startBridge: deps.startBridge,
    resetBridgePairing: deps.resetBridgePairing,
  });

  if (command === "up") {
    if (adapter.daemon.usesDaemonForUp) {
      const result = await adapter.daemon.startDaemon({
        waitForPairing: true,
      });
      adapter.daemon.printPairingQr({
        pairingSession: result.pairingSession,
      });
      return;
    }

    runForegroundBridge({ adapter, consoleImpl, startBridge: deps.startBridge });
    return;
  }

  if (command === "run") {
    runForegroundBridge({ adapter, consoleImpl, startBridge: deps.startBridge });
    return;
  }

  if (command === "run-service") {
    adapter.daemon.runDaemonEntrypoint();
    return;
  }

  if (command === "diagnose") {
    emitDiagnostics(adapter.diagnose({
      env: process.env,
      cwd: process.cwd(),
    }), {
      jsonOutput,
      consoleImpl,
    });
    return;
  }

  if (command === "start") {
    assertBackgroundDaemonCommand(command, {
      adapter,
      consoleImpl,
      exitImpl,
    });
    deps.readBridgeConfig();
    const result = await adapter.daemon.startDaemon({
      waitForPairing: false,
    });
    emitResult({
      payload: {
        ok: true,
        currentVersion: version,
        plistPath: result?.plistPath,
        pairingSession: result?.pairingSession,
      },
      message: "[remodex] macOS bridge service is running.",
      jsonOutput,
      consoleImpl,
    });
    return;
  }

  if (command === "restart") {
    assertBackgroundDaemonCommand(command, {
      adapter,
      consoleImpl,
      exitImpl,
    });
    deps.readBridgeConfig();
    const result = await adapter.daemon.restartDaemon({
      waitForPairing: false,
    });
    emitResult({
      payload: {
        ok: true,
        currentVersion: version,
        plistPath: result?.plistPath,
        pairingSession: result?.pairingSession,
      },
      message: "[remodex] macOS bridge service restarted.",
      jsonOutput,
      consoleImpl,
    });
    return;
  }

  if (command === "stop") {
    assertBackgroundDaemonCommand(command, {
      adapter,
      consoleImpl,
      exitImpl,
    });
    await adapter.daemon.stopDaemon();
    emitResult({
      payload: {
        ok: true,
        currentVersion: version,
      },
      message: "[remodex] macOS bridge service stopped.",
      jsonOutput,
      consoleImpl,
    });
    return;
  }

  if (command === "status") {
    assertBackgroundDaemonCommand(command, {
      adapter,
      consoleImpl,
      exitImpl,
    });
    if (jsonOutput) {
      emitJson({
        ...adapter.daemon.getDaemonStatus(),
        currentVersion: version,
      });
      return;
    }
    adapter.daemon.printDaemonStatus();
    return;
  }

  if (command === "reset-pairing") {
    try {
      if (adapter.daemon.supportsBackgroundDaemon) {
        adapter.daemon.resetPairing();
        emitResult({
          payload: {
            ok: true,
            currentVersion: version,
            platform: adapter.id,
          },
          message: `[remodex] Stopped the ${adapter.displayName} bridge service and cleared the saved pairing state. Run \`remodex up\` to pair again.`,
          jsonOutput,
          consoleImpl,
        });
      } else {
        deps.resetBridgePairing();
        emitResult({
          payload: {
            ok: true,
            currentVersion: version,
            platform,
          },
          message: "[remodex] Cleared the saved pairing state. Run `remodex up` to pair again.",
          jsonOutput,
          consoleImpl,
        });
      }
    } catch (error) {
      consoleImpl.error(`[remodex] ${(error && error.message) || "Failed to clear the saved pairing state."}`);
      exitImpl(1);
    }
    return;
  }

  if (command === "resume") {
    try {
      const state = deps.openLastActiveThread();
      emitResult({
        payload: {
          ok: true,
          currentVersion: version,
          threadId: state.threadId,
          source: state.source || "unknown",
        },
        message: `[remodex] Opened last active thread: ${state.threadId} (${state.source || "unknown"})`,
        jsonOutput,
        consoleImpl,
      });
    } catch (error) {
      consoleImpl.error(`[remodex] ${(error && error.message) || "Failed to reopen the last thread."}`);
      exitImpl(1);
    }
    return;
  }

  if (command === "watch") {
    try {
      deps.watchThreadRollout(watchThreadId);
    } catch (error) {
      consoleImpl.error(`[remodex] ${(error && error.message) || "Failed to watch the thread rollout."}`);
      exitImpl(1);
    }
    return;
  }

  consoleImpl.error(`Unknown command: ${command}`);
  consoleImpl.error(
    "Usage: remodex up | remodex run | remodex diagnose | remodex start | remodex restart | remodex stop | "
    + "remodex status | remodex reset-pairing | remodex resume | remodex watch [threadId] | remodex --version | "
    + "append --json to diagnose/start/restart/stop/status/reset-pairing/resume for machine-readable output"
  );
  exitImpl(1);
}

function parseCliArgs(rawArgs) {
  const positionals = [];
  let jsonOutput = false;

  for (const arg of rawArgs) {
    if (arg === "--json") {
      jsonOutput = true;
      continue;
    }

    positionals.push(arg);
  }

  return {
    command: positionals[0] || "up",
    jsonOutput,
    watchThreadId: positionals[1] || "",
  };
}

function emitVersion({
  jsonOutput = false,
  consoleImpl = console,
} = {}) {
  if (jsonOutput) {
    emitJson({
      currentVersion: version,
    });
    return;
  }

  consoleImpl.log(version);
}

function emitResult({
  payload,
  message,
  jsonOutput = false,
  consoleImpl = console,
} = {}) {
  if (jsonOutput) {
    emitJson(payload);
    return;
  }

  consoleImpl.log(message);
}

function runForegroundBridge({
  adapter,
  consoleImpl = console,
  startBridge: startBridgeImpl = defaultDeps.startBridge,
} = {}) {
  const prepared = adapter.prepareForegroundRun?.({
    env: process.env,
    cwd: process.cwd(),
  }) || {};
  for (const message of prepared.messages || []) {
    consoleImpl.log(message);
  }
  for (const warning of prepared.warnings || []) {
    consoleImpl.warn?.(`[remodex] ${warning.message || warning.code || "Windows foreground warning"}`);
  }

  if (typeof adapter.daemon?.runForeground === "function") {
    return adapter.daemon.runForeground(prepared.bridgeOptions || {});
  }

  return startBridgeImpl(prepared.bridgeOptions || {});
}

function emitDiagnostics(report, {
  jsonOutput = false,
  consoleImpl = console,
} = {}) {
  if (jsonOutput) {
    emitJson(report);
    return;
  }

  consoleImpl.log(`[remodex] Platform: ${report.displayName || report.platform} (${report.platform})`);
  consoleImpl.log(`[remodex] Daemon: ${report.daemon?.supportsBackgroundDaemon ? "background supported" : "foreground only"}`);

  if (report.encoding) {
    consoleImpl.log(`[remodex] Encoding: code page ${report.encoding.activeCodePage || "unknown"}`);
  }

  if (report.codex) {
    consoleImpl.log(`[remodex] Native Codex home: ${report.codex.nativeCodexHome || report.codexHome || "unknown"}`);
    for (const candidate of report.codex.installations || []) {
      consoleImpl.log(formatCodexCandidate(candidate));
    }
  } else if (report.codexHome) {
    consoleImpl.log(`[remodex] Codex home: ${report.codexHome}`);
  }

  if (report.paths) {
    for (const entry of report.paths.trackedPaths || []) {
      consoleImpl.log(`[remodex] Path ${entry.id}: ${entry.value || "not set"}${entry.length != null ? ` (${entry.length} chars)` : ""}`);
    }
    for (const warning of report.paths.warnings || []) {
      consoleImpl.warn?.(`[remodex] ${warning.message}`);
    }
  }

  if (report.firewall) {
    const firewallMode = report.firewall.inboundRuleRequired ? "inbound rule may be required" : "no inbound rule needed";
    consoleImpl.log(`[remodex] Firewall: ${firewallMode}`);
    for (const warning of report.firewall.warnings || []) {
      consoleImpl.warn?.(`[remodex] ${warning.message}`);
    }
  }
}

function formatCodexCandidate(candidate) {
  const status = candidate.available ? "available" : `missing (${candidate.reason || "not_found"})`;
  const detail = candidate.command || candidate.appPath || candidate.codexHome || "";
  return `[remodex] Codex ${candidate.kind || candidate.id}: ${status}${detail ? ` - ${detail}` : ""}`;
}

function emitJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function assertBackgroundDaemonCommand(name, {
  adapter,
  consoleImpl = console,
  exitImpl = process.exit,
} = {}) {
  if (adapter?.daemon?.supportsBackgroundDaemon) {
    return;
  }

  consoleImpl.error(`[remodex] \`${name}\` is only available on macOS. Use \`remodex up\` or \`remodex run\` for the foreground bridge on this OS.`);
  exitImpl(1);
}

function isVersionCommand(value) {
  return value === "-v" || value === "--v" || value === "-V" || value === "--version" || value === "version";
}

module.exports = {
  emitDiagnostics,
  formatCodexCandidate,
  isVersionCommand,
  main,
  runForegroundBridge,
};
