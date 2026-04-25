// FILE: platform/index.js
// Purpose: Selects the platform adapter while keeping platform branching out of bridge business logic.
// Layer: Platform abstraction
// Exports: createPlatformAdapter plus adapter classes
// Depends on: ./darwin, ./generic, ./linux, ./windows

const { DarwinAdapter } = require("./darwin");
const { GenericForegroundAdapter } = require("./generic");
const { LinuxAdapter } = require("./linux");
const { WindowsAdapter } = require("./windows");

function createPlatformAdapter({
  platform = process.platform,
  startBridge,
  resetBridgePairing,
  deps = {},
} = {}) {
  if (platform === "darwin") {
    return new DarwinAdapter(deps.darwin);
  }

  if (platform === "linux") {
    return new LinuxAdapter({
      ...deps.linux,
      startBridge: deps.linux?.startBridge || startBridge,
      resetBridgePairing: deps.linux?.resetBridgePairing || resetBridgePairing,
    });
  }

  if (platform === "win32") {
    return new WindowsAdapter({
      startBridge: deps.windows?.startBridge || startBridge,
      resetBridgePairing: deps.windows?.resetBridgePairing || resetBridgePairing,
      ...deps.windows,
    });
  }

  return new GenericForegroundAdapter({
    id: platform,
    displayName: platform || "Unknown platform",
    startBridge,
    resetBridgePairing,
    ...deps.generic,
  });
}

module.exports = {
  DarwinAdapter,
  GenericForegroundAdapter,
  LinuxAdapter,
  WindowsAdapter,
  createPlatformAdapter,
};
