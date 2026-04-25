// FILE: platform/darwin/index.js
// Purpose: macOS platform adapter wiring launchd, Codex locator, and no-op firewall manager.
// Layer: Platform abstraction
// Exports: DarwinAdapter
// Depends on: ../base, ../codex-locator, ../null-firewall-manager, ./daemon-manager

const { PlatformAdapter } = require("../base");
const { DefaultCodexLocator } = require("../codex-locator");
const { NullFirewallManager } = require("../null-firewall-manager");
const { DarwinDaemonManager } = require("./daemon-manager");

class DarwinAdapter extends PlatformAdapter {
  constructor(deps = {}) {
    super({
      id: "darwin",
      displayName: "macOS",
      daemon: deps.daemon || new DarwinDaemonManager(deps.daemonDeps),
      codex: deps.codex || new DefaultCodexLocator({
        platformId: "darwin",
        displayName: "macOS",
      }),
      firewall: deps.firewall || new NullFirewallManager({
        platformId: "darwin",
        displayName: "macOS",
      }),
    });
  }
}

module.exports = {
  DarwinAdapter,
};
