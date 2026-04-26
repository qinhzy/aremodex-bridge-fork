// FILE: platform/windows/console.js
// Purpose: Prepares Windows console output for UTF-8 foreground bridge logs.
// Layer: Platform abstraction
// Exports: WindowsConsoleManager, decodeCommandOutput
// Depends on: child_process

const { execFileSync } = require("child_process");

class WindowsConsoleManager {
  constructor({
    execFileSyncImpl = execFileSync,
    stdout = process.stdout,
    stderr = process.stderr,
    timeoutMs = 1_500,
  } = {}) {
    this.execFileSync = execFileSyncImpl;
    this.stdout = stdout;
    this.stderr = stderr;
    this.timeoutMs = timeoutMs;
  }

  configure({ env = process.env, force = false } = {}) {
    const stdoutIsTTY = Boolean(this.stdout?.isTTY);
    const stderrIsTTY = Boolean(this.stderr?.isTTY);
    const shouldTouchConsole = force || stdoutIsTTY || stderrIsTTY;
    const before = this.readActiveCodePage({ env });

    this.setDefaultStreamEncoding("utf8");
    env.LANG = env.LANG || "C.UTF-8";
    env.LC_ALL = env.LC_ALL || "C.UTF-8";
    env.PYTHONIOENCODING = env.PYTHONIOENCODING || "utf-8";

    if (!shouldTouchConsole) {
      return {
        attempted: false,
        changed: false,
        codePageBefore: before,
        codePageAfter: before,
        stdoutIsTTY,
        stderrIsTTY,
        warnings: [],
      };
    }

    const warnings = [];
    let changed = false;
    if (before !== "65001") {
      try {
        this.execFileSync("chcp.com", ["65001"], {
          env,
          stdio: ["ignore", "ignore", "ignore"],
          timeout: this.timeoutMs,
        });
        changed = true;
      } catch (error) {
        warnings.push({
          code: "windows_console_chcp_failed",
          message: `Could not switch the Windows console to UTF-8: ${error.message}`,
        });
      }
    }

    return {
      attempted: true,
      changed,
      codePageBefore: before,
      codePageAfter: this.readActiveCodePage({ env }),
      stdoutIsTTY,
      stderrIsTTY,
      warnings,
    };
  }

  getDiagnostics({ env = process.env } = {}) {
    return {
      activeCodePage: this.readActiveCodePage({ env }),
      stdoutIsTTY: Boolean(this.stdout?.isTTY),
      stderrIsTTY: Boolean(this.stderr?.isTTY),
      utf8Env: {
        LANG: env.LANG || "",
        LC_ALL: env.LC_ALL || "",
        PYTHONIOENCODING: env.PYTHONIOENCODING || "",
      },
    };
  }

  readActiveCodePage({ env = process.env } = {}) {
    try {
      const output = this.execFileSync("chcp.com", [], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: this.timeoutMs,
      });
      const decoded = decodeCommandOutput(output);
      const match = decoded.match(/(\d{3,6})/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  setDefaultStreamEncoding(encoding) {
    try {
      this.stdout?.setDefaultEncoding?.(encoding);
    } catch {}

    try {
      this.stderr?.setDefaultEncoding?.(encoding);
    } catch {}
  }
}

function decodeCommandOutput(output) {
  if (typeof output === "string") {
    return stripNulls(output);
  }

  if (!Buffer.isBuffer(output)) {
    return "";
  }

  const utf8 = output.toString("utf8");
  const utf16le = output.toString("utf16le");
  if (looksLikeUtf16Le(output) || decodesBetterAsUtf16Le({ utf8, utf16le })) {
    return stripNulls(utf16le);
  }

  return stripNulls(utf8);
}

function looksLikeUtf16Le(buffer) {
  if (buffer.length < 4) {
    return false;
  }

  let nullOddBytes = 0;
  let inspected = 0;
  const limit = Math.min(buffer.length, 128);
  for (let index = 1; index < limit; index += 2) {
    inspected += 1;
    if (buffer[index] === 0) {
      nullOddBytes += 1;
    }
  }

  return inspected > 0 && nullOddBytes / inspected > 0.6;
}

function stripNulls(value) {
  return String(value || "").replace(/\u0000/g, "").trim();
}

function decodesBetterAsUtf16Le({ utf8, utf16le }) {
  const utf8ReplacementChars = countMatches(utf8, "\uFFFD");
  if (utf8ReplacementChars === 0) {
    return false;
  }

  const utf16ReplacementChars = countMatches(utf16le, "\uFFFD");
  return utf16ReplacementChars < utf8ReplacementChars
    && printableRatio(utf16le) > printableRatio(utf8);
}

function countMatches(value, needle) {
  return Array.from(String(value || "")).filter((char) => char === needle).length;
}

function printableRatio(value) {
  const chars = Array.from(String(value || ""));
  if (chars.length === 0) {
    return 0;
  }

  const printable = chars.filter((char) => {
    if (char === "\r" || char === "\n" || char === "\t") {
      return true;
    }
    return char >= " " && char !== "\uFFFD";
  }).length;

  return printable / chars.length;
}

module.exports = {
  WindowsConsoleManager,
  decodeCommandOutput,
};
