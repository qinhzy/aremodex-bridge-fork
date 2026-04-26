#!/usr/bin/env node
// FILE: scripts/windows-console-smoke.js
// Purpose: Exercises Windows foreground console preparation through adapter injection.
// Layer: CI/manual smoke test
// Exports: none
// Depends on: child_process shell launchers, fs, os, path, ws, ../bin/remodex

const fs = require("fs");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");

async function main() {
  if (os.platform() !== "win32") {
    throw new Error("Windows console smoke must run on Windows.");
  }

  const options = parseArgs(process.argv.slice(2));
  const bridgeDir = path.resolve(__dirname, "..");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-windows-console-smoke-"));
  const stateDir = path.join(tempRoot, "state");
  fs.mkdirSync(stateDir, { recursive: true });

  const logPath = options.log || path.join(tempRoot, `${options.shell || "windows"}-run-injected.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "");

  const restoreOutput = mirrorProcessOutputToLog(logPath);
  const relay = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const codex = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  const relayConnections = [];
  const codexConnections = [];
  const observed = {
    connected: false,
    workspace: false,
    chcpBranch: false,
  };
  let finishing = false;

  relay.on("connection", (socket, request) => {
    relayConnections.push({
      url: request.url,
      role: request.headers["x-role"] || "",
    });
    socket.on("message", () => {});
  });
  codex.on("connection", (socket) => {
    codexConnections.push({ connectedAt: new Date().toISOString() });
    socket.on("message", () => {});
  });

  patchObservation(observed, bridgeDir);
  await Promise.all([waitForServer(relay), waitForServer(codex)]);

  const bridge = require("../src");
  const { main: runCli } = require("../bin/remodex.js");
  const deps = {
    ...bridge,
    createPlatformAdapter(createOptions) {
      const adapter = bridge.createPlatformAdapter(createOptions);
      const originalPrepare = adapter.prepareForegroundRun.bind(adapter);
      adapter.prepareForegroundRun = (prepareOptions = {}) => {
        const prepared = originalPrepare({
          ...prepareOptions,
          forceConsole: true,
        });
        const encoding = prepared.encoding || {};
        console.log(
          `[smoke] injected forceConsole=true attempted=${Boolean(encoding.attempted)} `
          + `changed=${Boolean(encoding.changed)} codePageBefore=${encoding.codePageBefore || "unknown"} `
          + `codePageAfter=${encoding.codePageAfter || "unknown"}`
        );
        if (encoding.attempted && encoding.changed && encoding.codePageAfter === "65001") {
          observed.chcpBranch = true;
        }
        return prepared;
      };
      return adapter;
    },
  };

  process.env.REMODEX_RELAY = `ws://127.0.0.1:${relay.address().port}/relay`;
  process.env.REMODEX_CODEX_ENDPOINT = `ws://127.0.0.1:${codex.address().port}`;
  process.env.REMODEX_DEVICE_STATE_DIR = stateDir;
  process.env.REMODEX_REFRESH_ENABLED = "false";

  console.log(`[smoke] shell=${options.shell || "unknown"}`);
  if (options.initialCodePage) {
    console.log(`[smoke] initial shell command: chcp ${options.initialCodePage}`);
  }
  console.log("[smoke] adapter injection: prepareForegroundRun({ forceConsole: true })");
  console.log(`[smoke] log=${logPath}`);

  const timeout = setTimeout(() => {
    fail(
      `timeout observed=${JSON.stringify(observed)} relay=${JSON.stringify(relayConnections)} `
      + `codex=${JSON.stringify(codexConnections)}`
    );
  }, options.timeoutMs);
  timeout.unref?.();

  await runCli({
    argv: ["node", "aremodex-bridge", "run"],
    platform: "win32",
    deps,
  });

  function finishIfComplete() {
    if (finishing) {
      return;
    }
    if (!observed.connected || !observed.workspace || !observed.chcpBranch) {
      return;
    }

    finishing = true;
    clearTimeout(timeout);
    console.log("[smoke] observed connected + workspace + injected chcp branch");
    console.log(`[smoke] relay connections: ${JSON.stringify(relayConnections)}`);
    console.log(`[smoke] codex endpoint connections: ${JSON.stringify(codexConnections)}`);
    cleanup({
      restoreOutput,
      relay,
      codex,
      tempRoot,
      exitCode: 0,
    });
  }

  function patchObservation(state, workspaceNeedle) {
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, encoding, callback) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (text.includes("[remodex] connected")) {
        state.connected = true;
      }
      if (text.includes(workspaceNeedle)) {
        state.workspace = true;
      }
      const result = originalStdoutWrite(chunk, encoding, callback);
      finishIfComplete();
      return result;
    };
  }

  function fail(message) {
    console.error(`[smoke] ${message}`);
    cleanup({
      restoreOutput,
      relay,
      codex,
      tempRoot,
      exitCode: 1,
    });
  }
}

function parseArgs(args) {
  const options = {
    initialCodePage: "",
    log: "",
    shell: "",
    timeoutMs: 15_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--initial-code-page") {
      options.initialCodePage = args[++index] || "";
    } else if (arg === "--log") {
      options.log = args[++index] || "";
    } else if (arg === "--shell") {
      options.shell = args[++index] || "";
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(args[++index] || options.timeoutMs);
    }
  }

  return options;
}

function waitForServer(server) {
  if (server.address()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function mirrorProcessOutputToLog(logPath) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk, encoding, callback) => {
    appendLog(logPath, chunk);
    return originalStdoutWrite(chunk, encoding, callback);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    appendLog(logPath, chunk);
    return originalStderrWrite(chunk, encoding, callback);
  };

  return () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  };
}

function appendLog(logPath, chunk) {
  fs.appendFileSync(logPath, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
}

function cleanup({
  restoreOutput,
  relay,
  codex,
  tempRoot,
  exitCode,
}) {
  try {
    restoreOutput?.();
  } finally {
    closeServer(relay, () => {
      closeServer(codex, () => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        process.exit(exitCode);
      });
    });
  }
}

function closeServer(server, callback) {
  try {
    for (const client of server.clients || []) {
      client.terminate?.();
    }
    server.close(() => callback());
  } catch {
    callback();
  }
}

main().catch((error) => {
  console.error(`[smoke] ${error.stack || error.message}`);
  process.exit(1);
});
