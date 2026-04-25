// FILE: index.js
// Purpose: Small entrypoint wrapper for bridge lifecycle commands.
// Layer: CLI entry
// Exports: bridge lifecycle, pairing reset, thread resume/watch, and platform service helpers.
// Depends on: ./bridge, ./secure-device-state, ./session-state, ./rollout-watch, ./platform

const { startBridge } = require("./bridge");
const { readBridgeDeviceState, resetBridgeDeviceState } = require("./secure-device-state");
const { openLastActiveThread } = require("./session-state");
const { watchThreadRollout } = require("./rollout-watch");
const { readBridgeConfig } = require("./codex-desktop-refresher");
const { createPlatformAdapter } = require("./platform");

function createDarwinAdapter() {
  return createPlatformAdapter({ platform: "darwin" });
}

module.exports = {
  createPlatformAdapter,
  getMacOSBridgeServiceStatus: (options) => createDarwinAdapter().daemon.getDaemonStatus(options),
  printMacOSBridgePairingQr: (options) => createDarwinAdapter().daemon.printPairingQr(options),
  printMacOSBridgeServiceStatus: (options) => createDarwinAdapter().daemon.printDaemonStatus(options),
  readBridgeConfig,
  readBridgeDeviceState,
  resetMacOSBridgePairing: (options) => createDarwinAdapter().daemon.resetPairing(options),
  startBridge,
  runMacOSBridgeService: (options) => createDarwinAdapter().daemon.runDaemonEntrypoint(options),
  startMacOSBridgeService: (options) => createDarwinAdapter().daemon.startDaemon(options),
  stopMacOSBridgeService: (options) => createDarwinAdapter().daemon.stopDaemon(options),
  resetBridgePairing: resetBridgeDeviceState,
  openLastActiveThread,
  watchThreadRollout,
};
