// FILE: platform/windows/firewall-manager.js
// Purpose: Reports Windows Defender Firewall implications without elevating in foreground mode.
// Layer: Platform abstraction
// Exports: WindowsFirewallManager, classifyWindowsBridgeUrl
// Depends on: ../base

const { FirewallManager } = require("../base");

class WindowsFirewallManager extends FirewallManager {
  constructor() {
    super({
      platformId: "win32",
      displayName: "Windows",
    });
  }

  getFirewallStatus({ env = process.env, config = null } = {}) {
    const relayUrl = readConfigOrEnv(config, env, "relayUrl", ["REMODEX_RELAY", "PHODEX_RELAY"]);
    const codexEndpoint = readConfigOrEnv(config, env, "codexEndpoint", [
      "REMODEX_CODEX_ENDPOINT",
      "PHODEX_CODEX_ENDPOINT",
    ]);
    const listenHost = readFirstDefinedEnv([
      "AREMODEX_BRIDGE_LISTEN_HOST",
      "REMODEX_LISTEN_HOST",
      "PHODEX_LISTEN_HOST",
    ], "", env);
    const checks = [
      classifyWindowsBridgeUrl({ id: "relay", label: "Relay WebSocket", value: relayUrl }),
      classifyWindowsBridgeUrl({ id: "codexEndpoint", label: "Codex endpoint", value: codexEndpoint }),
    ];
    const warnings = [];

    if (listenHost && !isLoopbackHost(listenHost)) {
      warnings.push({
        code: "windows_firewall_non_loopback_listener",
        severity: "warning",
        message: `A non-loopback listen host (${listenHost}) would require an explicit Windows Firewall allow rule.`,
      });
    }

    return {
      supported: true,
      defaultAction: "diagnose_only",
      inboundRuleRequired: Boolean(listenHost && !isLoopbackHost(listenHost)),
      bridgeListensForInboundConnections: false,
      rules: [],
      checks,
      warnings,
      notes: [
        "The foreground bridge uses outbound WebSocket connections and stdio to Codex, so the default relay flow does not need an inbound Defender Firewall rule.",
        "M2 never writes firewall rules automatically; an explicit future firewall allow command must request elevation.",
      ],
    };
  }

  ensureFirewallRule() {
    return {
      changed: false,
      supported: true,
      requiresElevation: true,
      reason: "explicit_firewall_allow_not_implemented_in_m2",
    };
  }

  removeFirewallRules() {
    return {
      changed: false,
      supported: true,
      requiresElevation: true,
      reason: "no_m2_firewall_rules_are_created",
    };
  }
}

function classifyWindowsBridgeUrl({ id, label, value }) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return {
      id,
      label,
      configured: false,
      firewallRisk: "none",
      reason: "not_configured",
    };
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      id,
      label,
      configured: true,
      value: normalized,
      firewallRisk: "unknown",
      reason: "invalid_url",
    };
  }

  const host = stripIpv6Brackets(parsed.hostname);
  return {
    id,
    label,
    configured: true,
    value: normalized,
    protocol: parsed.protocol,
    host,
    loopback: isLoopbackHost(host),
    firewallRisk: "none",
    reason: "outbound_client_connection",
  };
}

function readConfigOrEnv(config, env, configKey, envKeys) {
  if (config && typeof config[configKey] === "string" && config[configKey].trim()) {
    return config[configKey].trim();
  }

  return readFirstDefinedEnv(envKeys, "", env);
}

function readFirstDefinedEnv(keys, fallback, env) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function isLoopbackHost(host) {
  const normalized = stripIpv6Brackets(String(host || "").trim().toLowerCase());
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || normalized.startsWith("127.");
}

function stripIpv6Brackets(host) {
  return String(host || "").replace(/^\[(.*)\]$/, "$1");
}

module.exports = {
  WindowsFirewallManager,
  classifyWindowsBridgeUrl,
  isLoopbackHost,
};
