#!/usr/bin/env node
// FILE: scripts/macos-up-smoke.js
// Purpose: Exercises the macOS launchd `remodex up` path on GitHub Actions.
// Layer: CI smoke test
// Exports: none
// Depends on: child_process, fs, os, path, ws

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");

const SERVICE_LABEL = "com.remodex.bridge";

async function main() {
  if (os.platform() !== "darwin") {
    throw new Error("macOS up smoke must run on macOS.");
  }

  const bridgeDir = path.resolve(__dirname, "..");
  const cliPath = path.join(bridgeDir, "bin", "remodex.js");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-macos-up-smoke-"));
  const homeDir = path.join(tempRoot, "home");
  const stateDir = path.join(tempRoot, "state");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const relay = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const codex = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const relayConnections = [];
  const codexConnections = [];

  relay.on("connection", (socket, request) => {
    relayConnections.push({
      url: request.url,
      role: request.headers["x-role"] || "",
    });
    socket.on("message", () => {});
  });
  codex.on("connection", (socket) => {
    codexConnections.push({ connectedAt: new Date().toISOString() });
    socket.on("message", () => {});
  });

  await Promise.all([
    waitForServer(relay),
    waitForServer(codex),
  ]);

  const env = {
    ...process.env,
    HOME: homeDir,
    REMODEX_DEVICE_STATE_DIR: stateDir,
    REMODEX_DEVICE_STATE_KEYCHAIN_MOCK_FILE: path.join(stateDir, "keychain-mock.json"),
    REMODEX_RELAY: `ws://127.0.0.1:${relay.address().port}/relay`,
    REMODEX_CODEX_ENDPOINT: `ws://127.0.0.1:${codex.address().port}`,
    REMODEX_KEEP_MAC_AWAKE: "false",
    REMODEX_REFRESH_ENABLED: "false",
  };

  try {
    runCommand("node remodex.js stop (pre-clean)", process.execPath, [cliPath, "stop"], {
      cwd: bridgeDir,
      env,
      allowFailure: true,
    });

    const upOutput = runCommand("node remodex.js up", process.execPath, [cliPath, "up"], {
      cwd: bridgeDir,
      env,
      timeout: 25_000,
    });
    assertIncludes(upOutput, "Scan this QR with the iPhone", "`remodex up` did not print the pairing QR.");
    assertIncludes(upOutput, "Session ID:", "`remodex up` did not print a pairing session id.");

    const launchctlList = runShell("launchctl list | grep remodex", "launchctl list | grep remodex", {
      env,
      timeout: 10_000,
    });
    emitGitHubNotice("macOS launchctl list | grep remodex", launchctlList.trimEnd());
    assertIncludes(launchctlList, SERVICE_LABEL, "`launchctl list | grep remodex` did not show the bridge service.");

    runCommand("node remodex.js stop", process.execPath, [cliPath, "stop"], {
      cwd: bridgeDir,
      env,
      timeout: 20_000,
    });
    const afterStopList = runShell("launchctl list | grep remodex after stop", "launchctl list | grep remodex || true", {
      env,
      timeout: 10_000,
    });
    if (afterStopList.includes(SERVICE_LABEL)) {
      throw new Error("The bridge service was still visible in launchctl after `remodex stop`.");
    }

    console.log(`[smoke] relay connections: ${JSON.stringify(relayConnections)}`);
    console.log(`[smoke] codex endpoint connections: ${JSON.stringify(codexConnections)}`);
  } catch (error) {
    const diagnostics = collectMacOSDiagnostics({
      env,
      stateDir,
    });
    if (diagnostics) {
      console.log(diagnostics);
    }
    const detailed = new Error(`${error.message}\n${diagnostics}`.trim());
    detailed.cause = error;
    throw detailed;
  } finally {
    try {
      runCommand("node remodex.js stop (finally)", process.execPath, [cliPath, "stop"], {
        cwd: bridgeDir,
        env,
        allowFailure: true,
      });
    } finally {
      await closeServer(relay);
      await closeServer(codex);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function waitForServer(server) {
  if (server.address()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function runCommand(label, command, args, {
  cwd = process.cwd(),
  env = process.env,
  timeout = 10_000,
  allowFailure = false,
} = {}) {
  console.log(`\n[smoke] $ ${label}`);
  try {
    const output = execFileSync(command, args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });
    console.log(output.trimEnd());
    return output;
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`;
    if (output.trim()) {
      console.log(output.trimEnd());
    }
    if (!allowFailure) {
      const detailed = new Error(`${label} failed: ${error.message}\n${output}`.trim());
      detailed.cause = error;
      throw detailed;
    }
    return output;
  }
}

function runShell(label, script, options = {}) {
  return runCommand(label, "/bin/bash", ["-lc", script], options);
}

function assertIncludes(value, needle, message) {
  if (!String(value || "").includes(needle)) {
    throw new Error(message);
  }
}

function collectMacOSDiagnostics({
  env,
  stateDir,
}) {
  const parts = ["\n[smoke] macOS diagnostics"];
  parts.push(readTextFile("[smoke] bridge stdout", path.join(stateDir, "logs", "bridge.stdout.log")));
  parts.push(readTextFile("[smoke] bridge stderr", path.join(stateDir, "logs", "bridge.stderr.log")));
  parts.push(readTextFile("[smoke] daemon config", path.join(stateDir, "daemon-config.json")));
  parts.push(readTextFile("[smoke] pairing session", path.join(stateDir, "pairing-session.json")));
  try {
    parts.push(`[smoke] launchctl print:\n${execFileSync("launchctl", [
      "print",
      `gui/${process.getuid()}/${SERVICE_LABEL}`,
    ], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trimEnd()}`);
  } catch (error) {
    parts.push(`[smoke] launchctl print failed: ${formatCommandError(error)}`);
  }
  return parts.filter(Boolean).join("\n");
}

function readTextFile(label, filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return `${label}: missing (${filePath})`;
    }
    const content = fs.readFileSync(filePath, "utf8").trimEnd();
    return `${label} (${filePath}):\n${truncateForAnnotation(content || "<empty>")}`;
  } catch (error) {
    return `${label}: failed to read ${filePath}: ${error.message}`;
  }
}

function formatCommandError(error) {
  return [
    error.message,
    error.stdout?.toString?.("utf8"),
    error.stderr?.toString?.("utf8"),
  ].filter(Boolean).join("\n").trim();
}

function truncateForAnnotation(value, maxChars = 6_000) {
  const text = String(value || "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n[smoke] ... truncated ${text.length - maxChars} chars ...`;
}

main().catch((error) => {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(`::error title=macOS remodex up smoke failed::${escapeGitHubCommand(error.message)}`);
  }
  console.error(`[smoke] ${error.stack || error.message}`);
  process.exit(1);
});

function emitGitHubNotice(title, message) {
  if (process.env.GITHUB_ACTIONS === "true" && message) {
    console.log(`::notice title=${escapeGitHubCommand(title)}::${escapeGitHubCommand(message)}`);
  }
}

function escapeGitHubCommand(value) {
  return String(value || "")
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}
