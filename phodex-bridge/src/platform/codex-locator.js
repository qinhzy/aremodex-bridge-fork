// FILE: platform/codex-locator.js
// Purpose: Default Codex runtime locator backed by the existing launch-plan builder.
// Layer: Platform abstraction
// Exports: DefaultCodexLocator
// Depends on: ./base, ../codex-transport

const { CodexLocator } = require("./base");
const { createCodexLaunchPlans } = require("../codex-transport");

class DefaultCodexLocator extends CodexLocator {
  createCodexLaunchPlans(options = {}) {
    return createCodexLaunchPlans({
      ...options,
      platform: options.platform || this.platformId,
    });
  }
}

module.exports = {
  DefaultCodexLocator,
};
