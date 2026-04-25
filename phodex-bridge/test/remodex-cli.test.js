// FILE: remodex-cli.test.js
// Purpose: Verifies the public CLI exposes version, service control, and machine-readable status output.
// Layer: Integration-lite test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, child_process, path, ../package.json, ../bin/remodex

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const path = require("path");
const { version } = require("../package.json");
const { main } = require("../bin/remodex");

test("remodex --version prints the package version", () => {
  const cliPath = path.join(__dirname, "..", "bin", "remodex.js");
  const output = execFileSync(process.execPath, [cliPath, "--version"], {
    encoding: "utf8",
  }).trim();

  assert.equal(output, version);
});

test("remodex restart reuses the macOS service start flow", async () => {
  const calls = [];
  const messages = [];
  const adapter = createMockAdapter({
    id: "darwin",
    displayName: "macOS",
    supportsBackgroundDaemon: true,
    usesDaemonForUp: true,
    async restartDaemon(options) {
      calls.push(["restart-daemon", options]);
      return {
        plistPath: "/tmp/remodex.plist",
        pairingSession: { relay: "ws://127.0.0.1:9000/relay" },
      };
    },
  });

  await main({
    argv: ["node", "remodex", "restart"],
    platform: "darwin",
    consoleImpl: {
      log(message) {
        messages.push(message);
      },
      error(message) {
        messages.push(message);
      },
    },
    exitImpl(code) {
      throw new Error(`unexpected exit ${code}`);
    },
    deps: {
      createPlatformAdapter() {
        return adapter;
      },
      readBridgeConfig() {
        calls.push("read-config");
      },
    },
  });

  assert.deepEqual(calls, [
    "read-config",
    ["restart-daemon", { waitForPairing: false }],
  ]);
  assert.deepEqual(messages, [
    "[remodex] macOS bridge service restarted.",
  ]);
});

test("remodex status --json exposes daemon metadata for companion apps", async () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  const adapter = createMockAdapter({
    id: "darwin",
    displayName: "macOS",
    supportsBackgroundDaemon: true,
    usesDaemonForUp: true,
    getDaemonStatus() {
      return {
        daemonConfig: {
          relayUrl: "ws://127.0.0.1:9000/relay",
        },
        bridgeStatus: {
          connectionStatus: "connected",
          pid: 77,
        },
        pairingSession: {
          pairingPayload: {
            relay: "ws://127.0.0.1:9000/relay",
            sessionId: "session-json",
          },
        },
      };
    },
    printDaemonStatus() {
      throw new Error("status printer should not run for --json");
    },
  });

  process.stdout.write = (chunk, encoding, callback) => {
    writes.push(String(chunk));
    if (typeof callback === "function") {
      callback();
    }
    return true;
  };

  try {
    await main({
      argv: ["node", "remodex", "status", "--json"],
      platform: "darwin",
      consoleImpl: {
        log() {},
        error(message) {
          throw new Error(`unexpected error: ${message}`);
        },
      },
      exitImpl(code) {
        throw new Error(`unexpected exit ${code}`);
      },
      deps: {
        createPlatformAdapter() {
          return adapter;
        },
      },
    });
  } finally {
    process.stdout.write = originalWrite;
  }

  const payload = JSON.parse(writes.join("").trim());
  assert.equal(payload.currentVersion, version);
  assert.equal(payload.daemonConfig?.relayUrl, "ws://127.0.0.1:9000/relay");
  assert.equal(payload.bridgeStatus?.connectionStatus, "connected");
  assert.equal(payload.pairingSession?.pairingPayload?.sessionId, "session-json");
});

test("remodex up keeps Linux in the foreground path", async () => {
  const calls = [];
  const adapter = createMockAdapter({
    id: "linux",
    displayName: "Linux",
    supportsBackgroundDaemon: false,
    usesDaemonForUp: false,
  });

  await main({
    argv: ["node", "remodex", "up"],
    platform: "linux",
    consoleImpl: {
      log() {},
      error(message) {
        throw new Error(`unexpected error: ${message}`);
      },
    },
    exitImpl(code) {
      throw new Error(`unexpected exit ${code}`);
    },
    deps: {
      createPlatformAdapter() {
        return adapter;
      },
      startBridge() {
        calls.push("start-bridge");
      },
    },
  });

  assert.deepEqual(calls, ["start-bridge"]);
});

test("remodex up uses the macOS daemon and prints the pairing QR", async () => {
  const calls = [];
  const adapter = createMockAdapter({
    id: "darwin",
    displayName: "macOS",
    supportsBackgroundDaemon: true,
    usesDaemonForUp: true,
    async startDaemon(options) {
      calls.push(["start-daemon", options]);
      return {
        pairingSession: {
          pairingPayload: {
            sessionId: "pairing-session",
          },
        },
      };
    },
    printPairingQr(options) {
      calls.push(["print-qr", options]);
    },
  });

  await main({
    argv: ["node", "remodex", "up"],
    platform: "darwin",
    consoleImpl: {
      log() {},
      error(message) {
        throw new Error(`unexpected error: ${message}`);
      },
    },
    exitImpl(code) {
      throw new Error(`unexpected exit ${code}`);
    },
    deps: {
      createPlatformAdapter() {
        return adapter;
      },
      startBridge() {
        throw new Error("foreground bridge should not run for macOS up");
      },
    },
  });

  assert.deepEqual(calls, [
    ["start-daemon", { waitForPairing: true }],
    [
      "print-qr",
      {
        pairingSession: {
          pairingPayload: {
            sessionId: "pairing-session",
          },
        },
      },
    ],
  ]);
});

function createMockAdapter({
  id,
  displayName,
  supportsBackgroundDaemon,
  usesDaemonForUp,
  startDaemon = async () => null,
  restartDaemon = async (options) => startDaemon(options),
  stopDaemon = async () => null,
  getDaemonStatus = () => ({}),
  printDaemonStatus = () => {},
  printPairingQr = () => {},
  resetPairing = () => {},
} = {}) {
  return {
    id,
    displayName,
    daemon: {
      supportsBackgroundDaemon,
      usesDaemonForUp,
      startDaemon,
      restartDaemon,
      stopDaemon,
      getDaemonStatus,
      printDaemonStatus,
      printPairingQr,
      resetPairing,
    },
  };
}
