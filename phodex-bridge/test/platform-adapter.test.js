// FILE: platform-adapter.test.js
// Purpose: Verifies platform adapter selection and M1 foreground/daemon contracts.
// Layer: Unit test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/platform

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlatformAdapter } = require("../src/platform");
const { DarwinDaemonManager } = require("../src/platform/darwin/daemon-manager");

test("createPlatformAdapter selects the Darwin adapter with background daemon support", () => {
  const adapter = createPlatformAdapter({
    platform: "darwin",
  });

  assert.equal(adapter.id, "darwin");
  assert.equal(adapter.displayName, "macOS");
  assert.equal(adapter.daemon.supportsBackgroundDaemon, true);
  assert.equal(adapter.daemon.usesDaemonForUp, true);
  assert.equal(adapter.firewall.getFirewallStatus().supported, false);
});

test("createPlatformAdapter selects the Linux foreground adapter", () => {
  const calls = [];
  const adapter = createPlatformAdapter({
    platform: "linux",
    startBridge(options) {
      calls.push(options);
      return "started";
    },
  });

  assert.equal(adapter.id, "linux");
  assert.equal(adapter.daemon.supportsBackgroundDaemon, false);
  assert.equal(adapter.daemon.usesDaemonForUp, false);
  assert.equal(adapter.daemon.runForeground({ from: "test" }), "started");
  assert.deepEqual(calls, [{ from: "test" }]);
});

test("createPlatformAdapter keeps unsupported platforms foreground-only for M1", () => {
  const adapter = createPlatformAdapter({
    platform: "win32",
    startBridge() {
      return "foreground";
    },
  });

  assert.equal(adapter.id, "win32");
  assert.equal(adapter.displayName, "Windows");
  assert.equal(adapter.daemon.supportsBackgroundDaemon, false);
  assert.equal(adapter.daemon.runForeground(), "foreground");
});

test("DarwinDaemonManager delegates to existing launchd helpers", async () => {
  const calls = [];
  const daemon = new DarwinDaemonManager({
    startService(options) {
      calls.push(["start", options]);
      return { plistPath: "/tmp/remodex.plist" };
    },
    stopService(options) {
      calls.push(["stop", options]);
    },
    getStatus(options) {
      calls.push(["status", options]);
      return { launchdLoaded: true };
    },
    printStatus(options) {
      calls.push(["print-status", options]);
    },
    printPairingQr(options) {
      calls.push(["print-qr", options]);
    },
    resetPairing(options) {
      calls.push(["reset", options]);
      return { hadState: true };
    },
    runService(options) {
      calls.push(["run-service", options]);
    },
  });

  assert.equal(daemon.supportsBackgroundDaemon, true);
  assert.equal(daemon.usesDaemonForUp, true);
  assert.deepEqual(await daemon.startDaemon({ waitForPairing: false }), {
    plistPath: "/tmp/remodex.plist",
  });
  await daemon.stopDaemon({ reason: "test" });
  assert.deepEqual(daemon.getDaemonStatus({ json: true }), { launchdLoaded: true });
  daemon.printDaemonStatus({ color: false });
  daemon.printPairingQr({ pairingSession: { sessionId: "session-1" } });
  assert.deepEqual(daemon.resetPairing({ purge: false }), { hadState: true });
  daemon.runDaemonEntrypoint({ env: { HOME: "/Users/tester" } });

  assert.deepEqual(calls, [
    ["start", { waitForPairing: false }],
    ["stop", { reason: "test" }],
    ["status", { json: true }],
    ["print-status", { color: false }],
    ["print-qr", { pairingSession: { sessionId: "session-1" } }],
    ["reset", { purge: false }],
    ["run-service", { env: { HOME: "/Users/tester" } }],
  ]);
});
