// FILE: platform/foreground-daemon-manager.js
// Purpose: Foreground-only daemon manager used by platforms before a background supervisor exists.
// Layer: Platform abstraction
// Exports: ForegroundDaemonManager
// Depends on: ./base, ../secure-device-state

const { DaemonManager } = require("./base");
const { resetBridgeDeviceState } = require("../secure-device-state");

class ForegroundDaemonManager extends DaemonManager {
  constructor({
    platformId,
    displayName,
    startBridge,
    resetBridgePairing = resetBridgeDeviceState,
  }) {
    super({ platformId, displayName });
    this.startBridge = startBridge;
    this.resetBridgePairing = resetBridgePairing;
  }

  runForeground(options = {}) {
    return this.startBridge(options);
  }

  runDaemonEntrypoint(options = {}) {
    return this.runForeground(options);
  }

  resetPairing() {
    return this.resetBridgePairing();
  }
}

module.exports = {
  ForegroundDaemonManager,
};
