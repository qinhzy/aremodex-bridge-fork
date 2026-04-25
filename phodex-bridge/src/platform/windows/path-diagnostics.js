// FILE: platform/windows/path-diagnostics.js
// Purpose: Surfaces Windows path risks for Codex home, bridge state, and workspaces.
// Layer: Platform abstraction
// Exports: buildWindowsPathDiagnostics, normalizeWindowsWorkspacePath
// Depends on: path

const path = require("path");

const PATH_WARNING_THRESHOLD = 240;
const LEGACY_MAX_PATH = 260;

function buildWindowsPathDiagnostics({
  env = process.env,
  cwd = process.cwd(),
  codexHome,
  sessionsDir,
  statePaths,
} = {}) {
  const oneDriveRoots = [
    env.OneDrive,
    env.OneDriveCommercial,
    env.OneDriveConsumer,
  ].filter(Boolean);
  const trackedPaths = [
    { id: "workspace", label: "Current workspace", value: cwd },
    { id: "codexHome", label: "Native Codex home", value: codexHome },
    { id: "sessionsDir", label: "Native Codex sessions", value: sessionsDir },
    { id: "stateDir", label: "Bridge state", value: statePaths?.stateDir },
    { id: "logsDir", label: "Bridge logs", value: statePaths?.logsDir },
  ].map((entry) => analyzePath(entry, { oneDriveRoots }));
  const warnings = trackedPaths.flatMap((entry) => entry.warnings.map((warning) => ({
    ...warning,
    pathId: entry.id,
    path: entry.value,
  })));

  return {
    trackedPaths,
    warnings,
    maxPath: LEGACY_MAX_PATH,
    warningThreshold: PATH_WARNING_THRESHOLD,
    wslCodexHome: "~/.codex",
    nativeAndWslCodexHomesShared: false,
    notes: [
      "%USERPROFILE%\\.codex and WSL ~/.codex are separate stores unless the user explicitly links them.",
      "OneDrive redirected profiles are supported, but diagnose flags them because sync conflicts can corrupt live session files.",
    ],
  };
}

function analyzePath({ id, label, value }, { oneDriveRoots }) {
  const normalized = typeof value === "string" && value
    ? normalizeWindowsWorkspacePath(value)
    : "";
  const warnings = [];

  if (normalized.length >= LEGACY_MAX_PATH) {
    warnings.push({
      code: "windows_path_over_legacy_max",
      severity: "error",
      message: `${label} is ${normalized.length} characters, which exceeds the legacy 260-character Windows path limit.`,
    });
  } else if (normalized.length >= PATH_WARNING_THRESHOLD) {
    warnings.push({
      code: "windows_path_near_legacy_max",
      severity: "warning",
      message: `${label} is ${normalized.length} characters and is close to the legacy 260-character Windows path limit.`,
    });
  }

  if (isUnderOneDrive(normalized, oneDriveRoots)) {
    warnings.push({
      code: "windows_path_onedrive",
      severity: "warning",
      message: `${label} is under OneDrive; live Codex session files may be affected by sync conflict handling.`,
    });
  }

  if (normalized.startsWith("\\\\")) {
    warnings.push({
      code: "windows_unc_path",
      severity: "warning",
      message: `${label} is a UNC path; local foreground bridge runs are safer from a fixed drive path.`,
    });
  }

  return {
    id,
    label,
    value: normalized,
    length: normalized.length,
    warnings,
  };
}

function normalizeWindowsWorkspacePath(workspacePath) {
  if (typeof workspacePath !== "string" || !workspacePath.trim()) {
    return workspacePath;
  }

  const trimmed = workspacePath.trim();
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    return path.win32.normalize(trimmed);
  }

  return path.resolve(trimmed);
}

function isUnderOneDrive(candidate, oneDriveRoots) {
  const normalizedCandidate = candidate.toLowerCase();
  return oneDriveRoots.some((root) => {
    const normalizedRoot = normalizeWindowsWorkspacePath(root).toLowerCase();
    return normalizedCandidate === normalizedRoot
      || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
  });
}

module.exports = {
  buildWindowsPathDiagnostics,
  normalizeWindowsWorkspacePath,
};
