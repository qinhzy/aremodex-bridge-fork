// FILE: platform/darwin/daemon-manager.js
// Purpose: Darwin daemon manager adapter around the existing launchd bridge service helpers.
// Layer: Platform abstraction
// Exports: DarwinDaemonManager
// Depends on: ../base, ../../macos-launch-agent

const { DaemonManager } = require("../base");
const {
  getMacOSBridgeServiceStatus,
  printMacOSBridgePairingQr,
  printMacOSBridgeServiceStatus,
  resetMacOSBridgePairing,
  runMacOSBridgeService,
  startMacOSBridgeService,
  stopMacOSBridgeService,
} = require("../../macos-launch-agent");

class DarwinDaemonManager extends DaemonManager {
  constructor(deps = {}) {
    super({
      platformId: "darwin",
      displayName: "macOS",
    });
    this.impl = {
      getStatus: deps.getStatus || getMacOSBridgeServiceStatus,
      printPairingQr: deps.printPairingQr || printMacOSBridgePairingQr,
      printStatus: deps.printStatus || printMacOSBridgeServiceStatus,
      resetPairing: deps.resetPairing || resetMacOSBridgePairing,
      runService: deps.runService || runMacOSBridgeService,
      startService: deps.startService || startMacOSBridgeService,
      stopService: deps.stopService || stopMacOSBridgeService,
    };
  }

  get supportsBackgroundDaemon() {
    return true;
  }

  get usesDaemonForUp() {
    return true;
  }

  async installDaemon(options = {}) {
    return this.startDaemon(options);
  }

  async uninstallDaemon(options = {}) {
    return this.stopDaemon(options);
  }

  async startDaemon(options = {}) {
    return this.impl.startService(options);
  }

  async stopDaemon(options = {}) {
    return this.impl.stopService(options);
  }

  async restartDaemon(options = {}) {
    return this.startDaemon(options);
  }

  getDaemonStatus(options = {}) {
    return this.impl.getStatus(options);
  }

  printDaemonStatus(options = {}) {
    return this.impl.printStatus(options);
  }

  runDaemonEntrypoint(options = {}) {
    return this.impl.runService(options);
  }

  waitForPairingSession(options = {}) {
    return this.startDaemon({
      ...options,
      waitForPairing: true,
    });
  }

  printPairingQr(options = {}) {
    return this.impl.printPairingQr(options);
  }

  resetPairing(options = {}) {
    return this.impl.resetPairing(options);
  }
}

module.exports = {
  DarwinDaemonManager,
};
