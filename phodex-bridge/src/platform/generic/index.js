// FILE: platform/generic/index.js
// Purpose: Foreground-only adapter for platforms that do not yet have a dedicated implementation.
// Layer: Platform abstraction
// Exports: GenericForegroundAdapter
// Depends on: ../base, ../codex-locator, ../foreground-daemon-manager, ../null-firewall-manager, ../../bridge

const { PlatformAdapter } = require("../base");
const { DefaultCodexLocator } = require("../codex-locator");
const { ForegroundDaemonManager } = require("../foreground-daemon-manager");
const { NullFirewallManager } = require("../null-firewall-manager");
const { startBridge } = require("../../bridge");

class GenericForegroundAdapter extends PlatformAdapter {
  constructor({
    id,
    displayName,
    startBridge: startBridgeImpl = startBridge,
    resetBridgePairing,
    daemon,
    codex,
    firewall,
  }) {
    super({
      id,
      displayName,
      daemon: daemon || new ForegroundDaemonManager({
        platformId: id,
        displayName,
        startBridge: startBridgeImpl,
        resetBridgePairing,
      }),
      codex: codex || new DefaultCodexLocator({
        platformId: id,
        displayName,
      }),
      firewall: firewall || new NullFirewallManager({
        platformId: id,
        displayName,
      }),
    });
  }
}

module.exports = {
  GenericForegroundAdapter,
};
