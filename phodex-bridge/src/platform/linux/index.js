// FILE: platform/linux/index.js
// Purpose: Linux platform adapter preserving the existing foreground-only bridge behavior.
// Layer: Platform abstraction
// Exports: LinuxAdapter
// Depends on: ../base, ../codex-locator, ../foreground-daemon-manager, ../null-firewall-manager, ../../bridge

const { PlatformAdapter } = require("../base");
const { DefaultCodexLocator } = require("../codex-locator");
const { ForegroundDaemonManager } = require("../foreground-daemon-manager");
const { NullFirewallManager } = require("../null-firewall-manager");
const { startBridge } = require("../../bridge");

class LinuxAdapter extends PlatformAdapter {
  constructor(deps = {}) {
    super({
      id: "linux",
      displayName: "Linux",
      daemon: deps.daemon || new ForegroundDaemonManager({
        platformId: "linux",
        displayName: "Linux",
        startBridge: deps.startBridge || startBridge,
        resetBridgePairing: deps.resetBridgePairing,
      }),
      codex: deps.codex || new DefaultCodexLocator({
        platformId: "linux",
        displayName: "Linux",
      }),
      firewall: deps.firewall || new NullFirewallManager({
        platformId: "linux",
        displayName: "Linux",
      }),
    });
  }
}

module.exports = {
  LinuxAdapter,
};
