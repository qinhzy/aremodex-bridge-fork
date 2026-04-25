// FILE: windows-adapter.test.js
// Purpose: Verifies the M2 Windows adapter diagnostics for encoding, paths, firewall, and Codex discovery.
// Layer: Unit test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/platform/windows

const test = require("node:test");
const assert = require("node:assert/strict");
const { WindowsAdapter } = require("../src/platform/windows");
const {
  WindowsCodexLocator,
  parseWslDistributions,
} = require("../src/platform/windows/codex-locator");
const {
  WindowsConsoleManager,
  decodeCommandOutput,
} = require("../src/platform/windows/console");
const {
  WindowsFirewallManager,
  classifyWindowsBridgeUrl,
} = require("../src/platform/windows/firewall-manager");
const {
  buildWindowsPathDiagnostics,
  normalizeWindowsWorkspacePath,
} = require("../src/platform/windows/path-diagnostics");

test("WindowsConsoleManager decodes UTF-16LE command output and switches interactive consoles to UTF-8", () => {
  const calls = [];
  const manager = new WindowsConsoleManager({
    stdout: {
      isTTY: true,
      setDefaultEncoding(encoding) {
        calls.push(["stdout-encoding", encoding]);
      },
    },
    stderr: {
      isTTY: true,
      setDefaultEncoding(encoding) {
        calls.push(["stderr-encoding", encoding]);
      },
    },
    execFileSyncImpl(command, args) {
      calls.push([command, args]);
      if (args.length === 0 && calls.filter((call) => call[0] === "chcp.com").length === 1) {
        return Buffer.from("Active code page: 936", "utf16le");
      }
      if (args[0] === "65001") {
        return Buffer.from("Active code page: 65001", "utf8");
      }
      return Buffer.from("Active code page: 65001", "utf8");
    },
  });

  const result = manager.configure({ env: {} });

  assert.equal(decodeCommandOutput(Buffer.from("活动代码页: 936", "utf16le")), "活动代码页: 936");
  assert.equal(result.attempted, true);
  assert.equal(result.changed, true);
  assert.equal(result.codePageBefore, "936");
  assert.equal(result.codePageAfter, "65001");
  assert.deepEqual(calls.slice(0, 2), [
    ["chcp.com", []],
    ["stdout-encoding", "utf8"],
  ]);
});

test("WindowsCodexLocator reports native, WSL, and desktop Codex candidates separately", () => {
  const env = {
    USERPROFILE: "C:\\Users\\tester",
    LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
  };
  const desktopExe = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0.0.0_x64__test\\app\\resources\\codex.exe";
  const locator = new WindowsCodexLocator({
    osImpl: {
      homedir() {
        return "C:\\Users\\fallback";
      },
    },
    fsImpl: {
      statSync(candidate) {
        if (candidate === desktopExe) {
          return {
            isFile() {
              return true;
            },
          };
        }
        throw new Error("missing");
      },
    },
    execFileSyncImpl(command, args) {
      const key = `${command} ${args.join(" ")}`;
      if (key === "where.exe codex") {
        return Buffer.from("C:\\Tools\\codex.cmd\r\nC:\\Tools\\codex.exe\r\n", "utf8");
      }
      if (key === "cmd.exe /d /c \"C:\\Tools\\codex.cmd\" --version") {
        return Buffer.from("codex 0.120.0\r\n", "utf8");
      }
      if (key === "wsl.exe --status") {
        return Buffer.from("Default Version: 2\r\n", "utf8");
      }
      if (key === "wsl.exe -l -q") {
        return Buffer.from("Ubuntu\r\nDebian (Default)\r\n", "utf16le");
      }
      if (key === "wsl.exe -- bash -lc command -v codex") {
        return Buffer.from("/usr/bin/codex\n", "utf8");
      }
      if (key === "wsl.exe -- bash -lc codex --version") {
        return Buffer.from("codex 0.120.0\n", "utf8");
      }
      if (command === "powershell.exe") {
        return Buffer.from("C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0.0.0_x64__test\r\n", "utf8");
      }
      throw new Error(`unexpected command: ${key}`);
    },
  });

  const installations = locator.detectCodexInstallations({ env });

  assert.equal(locator.resolveCodexHome({ env }), "C:\\Users\\tester\\.codex");
  assert.equal(installations.length, 3);
  assert.equal(installations[0].kind, "native");
  assert.equal(installations[0].available, true);
  assert.equal(installations[0].command, "C:\\Tools\\codex.cmd");
  assert.equal(installations[1].kind, "wsl");
  assert.equal(installations[1].available, true);
  assert.deepEqual(installations[1].distributions, ["Ubuntu", "Debian"]);
  assert.equal(installations[2].kind, "desktop");
  assert.equal(installations[2].available, true);
  assert.equal(installations[2].appPath, desktopExe);
});

test("parseWslDistributions tolerates UTF-16LE-decoded distribution names", () => {
  assert.deepEqual(parseWslDistributions("Ubuntu\u0000\r\u0000\n\u0000Debian (Default)\u0000"), [
    "Ubuntu",
    "Debian",
  ]);
});

test("WindowsFirewallManager keeps default relay mode diagnose-only without inbound rules", () => {
  const manager = new WindowsFirewallManager();
  const status = manager.getFirewallStatus({
    env: {
      REMODEX_RELAY: "ws://127.0.0.1:9000/relay",
      REMODEX_CODEX_ENDPOINT: "ws://localhost:1455",
    },
  });

  assert.equal(status.supported, true);
  assert.equal(status.bridgeListensForInboundConnections, false);
  assert.equal(status.inboundRuleRequired, false);
  assert.equal(status.warnings.length, 0);
  assert.equal(classifyWindowsBridgeUrl({
    id: "relay",
    label: "Relay",
    value: "ws://192.168.1.5:9000/relay",
  }).reason, "outbound_client_connection");

  const riskyStatus = manager.getFirewallStatus({
    env: {
      AREMODEX_BRIDGE_LISTEN_HOST: "0.0.0.0",
    },
  });
  assert.equal(riskyStatus.inboundRuleRequired, true);
  assert.equal(riskyStatus.warnings[0].code, "windows_firewall_non_loopback_listener");
});

test("Windows path diagnostics flags OneDrive and long paths without rewriting them", () => {
  const longWorkspace = `C:\\work\\${"nested\\".repeat(40)}project`;
  const diagnostics = buildWindowsPathDiagnostics({
    env: {
      OneDrive: "C:\\Users\\tester\\OneDrive",
    },
    cwd: longWorkspace,
    codexHome: "C:\\Users\\tester\\OneDrive\\.codex",
    sessionsDir: "C:\\Users\\tester\\OneDrive\\.codex\\sessions",
    statePaths: {
      stateDir: "C:\\Users\\tester\\AppData\\Local\\remodex",
      logsDir: "C:\\Users\\tester\\AppData\\Local\\remodex\\logs",
    },
  });

  assert.equal(normalizeWindowsWorkspacePath("C:/Users/tester/project"), "C:\\Users\\tester\\project");
  assert.equal(diagnostics.nativeAndWslCodexHomesShared, false);
  assert.ok(diagnostics.warnings.some((warning) => warning.code === "windows_path_over_legacy_max"));
  assert.ok(diagnostics.warnings.some((warning) => warning.code === "windows_path_onedrive"));
});

test("WindowsAdapter diagnose combines encoding, Codex, firewall, and path reports", () => {
  const adapter = new WindowsAdapter({
    startBridge() {
      return "foreground";
    },
    consoleManager: {
      configure() {
        return {
          attempted: true,
          codePageAfter: "65001",
          warnings: [],
        };
      },
      getDiagnostics() {
        return {
          activeCodePage: "65001",
        };
      },
    },
    codex: {
      resolveCodexHome() {
        return "C:\\Users\\tester\\.codex";
      },
      resolveSessionsDir() {
        return "C:\\Users\\tester\\.codex\\sessions";
      },
      detectCodexInstallations() {
        return [{
          id: "windows:native",
          kind: "native",
          available: true,
          command: "C:\\Tools\\codex.cmd",
        }];
      },
    },
    firewall: new WindowsFirewallManager(),
  });

  const prepared = adapter.prepareForegroundRun({
    env: {},
    cwd: "C:\\Aremodex(codex版）\\bridge",
    forceConsole: true,
  });
  const report = adapter.diagnose({
    env: {
      USERPROFILE: "C:\\Users\\tester",
    },
    cwd: "C:\\Aremodex(codex版）\\bridge",
  });

  assert.equal(adapter.daemon.runForeground({ ok: true }), "foreground");
  assert.equal(prepared.messages[0], "[remodex] Windows console prepared for UTF-8 output (code page 65001).");
  assert.equal(prepared.workspacePath, "C:\\Aremodex(codex版）\\bridge");
  assert.equal(report.platform, "win32");
  assert.equal(report.daemon.foregroundOnly, true);
  assert.equal(report.codex.selected.command, "C:\\Tools\\codex.cmd");
  assert.equal(report.firewall.inboundRuleRequired, false);
});
