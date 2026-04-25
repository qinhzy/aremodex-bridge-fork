// FILE: platform/null-firewall-manager.js
// Purpose: No-op firewall manager for platforms without bridge-managed firewall rules.
// Layer: Platform abstraction
// Exports: NullFirewallManager
// Depends on: ./base

const { FirewallManager } = require("./base");

class NullFirewallManager extends FirewallManager {}

module.exports = {
  NullFirewallManager,
};
