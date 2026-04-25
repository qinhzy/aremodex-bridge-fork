// FILE: platform/windows/codex-locator.js
// Purpose: Locates native, WSL, and desktop Codex runtimes on Windows.
// Layer: Platform abstraction
// Exports: WindowsCodexLocator
// Depends on: child_process, fs, os, path, ../base, ../../codex-transport, ./console

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { CodexLocator } = require("../base");
const { createCodexLaunchPlans } = require("../../codex-transport");
const { decodeCommandOutput } = require("./console");

class WindowsCodexLocator extends CodexLocator {
  constructor({
    execFileSyncImpl = execFileSync,
    fsImpl = fs,
    osImpl = os,
    pathImpl = path.win32,
    timeoutMs = 2_500,
  } = {}) {
    super({
      platformId: "win32",
      displayName: "Windows",
      osImpl,
    });
    this.execFileSync = execFileSyncImpl;
    this.fs = fsImpl;
    this.path = pathImpl;
    this.timeoutMs = timeoutMs;
  }

  createCodexLaunchPlans(options = {}) {
    return createCodexLaunchPlans({
      ...options,
      platform: "win32",
    });
  }

  detectCodexInstallations({ env = process.env } = {}) {
    return [
      this.detectNativeCodex({ env }),
      this.detectWslCodex({ env }),
      this.detectDesktopApp({ env }),
    ];
  }

  resolveCodexHome({ env = process.env } = {}) {
    if (env.CODEX_HOME && env.CODEX_HOME.trim()) {
      return this.path.normalize(env.CODEX_HOME.trim());
    }

    const profile = env.USERPROFILE || this.osImpl.homedir();
    return this.path.join(profile, ".codex");
  }

  resolveSessionsDir(options = {}) {
    return this.path.join(this.resolveCodexHome(options), "sessions");
  }

  detectNativeCodex({ env = process.env } = {}) {
    const paths = this.findOnPath("codex", { env });
    if (paths.length === 0) {
      return {
        id: "windows:native",
        kind: "native",
        label: "Native Codex CLI",
        available: false,
        reason: "not_found_on_path",
        codexHome: this.resolveCodexHome({ env }),
      };
    }

    const command = selectPreferredWindowsCommand(paths);
    return {
      id: "windows:native",
      kind: "native",
      label: "Native Codex CLI",
      available: true,
      command,
      args: ["app-server"],
      version: this.readVersion(command, { env }),
      allPaths: paths,
      codexHome: this.resolveCodexHome({ env }),
    };
  }

  detectWslCodex({ env = process.env } = {}) {
    const wslStatus = this.runCommand("wsl.exe", ["--status"], { env });
    if (!wslStatus.ok) {
      return {
        id: "windows:wsl",
        kind: "wsl",
        label: "WSL Codex CLI",
        available: false,
        reason: "wsl_not_available",
        error: wslStatus.errorMessage,
        codexHome: "~/.codex",
      };
    }

    const distroList = this.runCommand("wsl.exe", ["-l", "-q"], { env });
    const distributions = distroList.ok ? parseWslDistributions(distroList.stdout) : [];
    const codexPath = this.runCommand("wsl.exe", ["--", "bash", "-lc", "command -v codex"], { env });
    if (!codexPath.ok || !codexPath.stdout.trim()) {
      return {
        id: "windows:wsl",
        kind: "wsl",
        label: "WSL Codex CLI",
        available: false,
        reason: "codex_not_found_in_default_wsl_distribution",
        distributions,
        codexHome: "~/.codex",
      };
    }

    const version = this.runCommand("wsl.exe", ["--", "bash", "-lc", "codex --version"], { env });
    return {
      id: "windows:wsl",
      kind: "wsl",
      label: "WSL Codex CLI",
      available: true,
      command: "wsl.exe",
      args: ["--", "bash", "-lc", "codex app-server"],
      wslCodexPath: codexPath.stdout.trim(),
      version: version.ok ? version.stdout.trim() : "",
      distributions,
      codexHome: "~/.codex",
      note: "WSL uses its own Linux home; it does not share %USERPROFILE%\\.codex by default.",
    };
  }

  detectDesktopApp({ env = process.env } = {}) {
    const appxInstallLocation = this.findCodexAppxInstallLocation({ env });
    const candidates = this.buildDesktopAppCandidates({ env, appxInstallLocation });
    const executable = candidates.find((candidate) => this.isFile(candidate));
    if (executable) {
      return {
        id: "windows:desktop-app",
        kind: "desktop",
        label: "Codex desktop app",
        available: true,
        appPath: executable,
        candidates,
        codexHome: this.resolveCodexHome({ env }),
        sharesNativeCodexHome: true,
      };
    }

    if (appxInstallLocation) {
      return {
        id: "windows:desktop-app",
        kind: "desktop",
        label: "Codex desktop app",
        available: true,
        appPath: appxInstallLocation,
        candidates,
        codexHome: this.resolveCodexHome({ env }),
        sharesNativeCodexHome: true,
        reason: "appx_package_detected_without_known_exe_path",
      };
    }

    return {
      id: "windows:desktop-app",
      kind: "desktop",
      label: "Codex desktop app",
      available: false,
      reason: "not_found_in_common_locations",
      candidates,
      codexHome: this.resolveCodexHome({ env }),
    };
  }

  findOnPath(command, { env = process.env } = {}) {
    const result = this.runCommand("where.exe", [command], { env });
    if (!result.ok) {
      return [];
    }

    return uniqueNonEmptyLines(result.stdout);
  }

  readVersion(command, { env = process.env } = {}) {
    const result = isCmdShim(command)
      ? this.runCommand(env.ComSpec || "cmd.exe", ["/d", "/c", `"${command}" --version`], { env })
      : this.runCommand(command, ["--version"], { env });
    return result.ok ? result.stdout.trim().split(/\r?\n/)[0] || "" : "";
  }

  findCodexAppxInstallLocation({ env = process.env } = {}) {
    const command = [
      "$pkg = Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue;",
      "if ($pkg) { $pkg.InstallLocation }",
    ].join(" ");
    const result = this.runCommand("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ], { env });

    return result.ok ? result.stdout.trim().split(/\r?\n/)[0] || "" : "";
  }

  buildDesktopAppCandidates({ env = process.env, appxInstallLocation = "" } = {}) {
    const localAppData = env.LOCALAPPDATA || "";
    const programFiles = env.ProgramFiles || "";
    const programFilesX86 = env["ProgramFiles(x86)"] || "";
    const candidates = [];

    pushCandidate(candidates, env.CODEX_APP_PATH);
    pushCandidate(candidates, localAppData && this.path.join(localAppData, "Programs", "Codex", "Codex.exe"));
    pushCandidate(candidates, localAppData && this.path.join(localAppData, "OpenAI", "Codex", "Codex.exe"));
    pushCandidate(candidates, localAppData && this.path.join(localAppData, "Microsoft", "WindowsApps", "Codex.exe"));
    pushCandidate(candidates, localAppData && this.path.join(localAppData, "Microsoft", "WindowsApps", "OpenAI.Codex.exe"));
    pushCandidate(candidates, programFiles && this.path.join(programFiles, "Codex", "Codex.exe"));
    pushCandidate(candidates, programFiles && this.path.join(programFiles, "OpenAI", "Codex", "Codex.exe"));
    pushCandidate(candidates, programFilesX86 && this.path.join(programFilesX86, "Codex", "Codex.exe"));

    if (appxInstallLocation) {
      for (const suffix of [
        "Codex.exe",
        this.path.join("app", "Codex.exe"),
        this.path.join("app", "resources", "Codex.exe"),
        this.path.join("app", "resources", "codex.exe"),
      ]) {
        pushCandidate(candidates, this.path.join(appxInstallLocation, suffix));
      }
    }

    return Array.from(new Set(candidates.map((candidate) => this.path.normalize(candidate))));
  }

  runCommand(command, args, { env = process.env } = {}) {
    try {
      const output = this.execFileSync(command, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: this.timeoutMs,
      });
      return {
        ok: true,
        stdout: decodeCommandOutput(output),
      };
    } catch (error) {
      const stdout = decodeCommandOutput(error.stdout);
      const stderr = decodeCommandOutput(error.stderr);
      return {
        ok: false,
        stdout,
        stderr,
        errorMessage: stderr || stdout || error.code || error.message,
      };
    }
  }

  isFile(candidatePath) {
    try {
      return this.fs.statSync(candidatePath).isFile();
    } catch {
      return false;
    }
  }
}

function parseWslDistributions(output) {
  return uniqueNonEmptyLines(output)
    .map((line) => line.replace(/\s+\(Default\)$/i, "").trim())
    .filter(Boolean);
}

function uniqueNonEmptyLines(output) {
  return Array.from(new Set(String(output || "").replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)));
}

function pushCandidate(candidates, candidate) {
  if (typeof candidate === "string" && candidate.trim()) {
    candidates.push(candidate.trim());
  }
}

function selectPreferredWindowsCommand(paths) {
  return [...paths].sort((left, right) => commandScore(left) - commandScore(right))[0] || paths[0];
}

function commandScore(candidate) {
  const normalized = String(candidate || "").toLowerCase();
  if (normalized.endsWith(".cmd")) {
    return 0;
  }
  if (normalized.endsWith(".exe")) {
    return 1;
  }
  if (normalized.endsWith(".bat")) {
    return 2;
  }
  return 3;
}

function isCmdShim(command) {
  const normalized = String(command || "").toLowerCase();
  return normalized.endsWith(".cmd") || normalized.endsWith(".bat");
}

module.exports = {
  WindowsCodexLocator,
  parseWslDistributions,
};
