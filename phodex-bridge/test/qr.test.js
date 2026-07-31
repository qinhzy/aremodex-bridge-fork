// FILE: qr.test.js
// Purpose: Verifies the short terminal pairing code stays human-sized and URL-safe.
// Layer: Unit Test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/qr

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SHORT_PAIRING_CODE_ALPHABET,
  SHORT_PAIRING_CODE_LENGTH,
  createShortPairingCode,
  printQR,
} = require("../src/qr");

test("createShortPairingCode emits a short human-friendly token", () => {
  const code = createShortPairingCode({
    randomBytesImpl() {
      return Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    },
  });

  assert.equal(code.length, SHORT_PAIRING_CODE_LENGTH);
  assert.match(code, new RegExp(`^[${SHORT_PAIRING_CODE_ALPHABET}]+$`));
});

test("printQR does not echo live pairing identifiers", () => {
  const logs = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));

  try {
    printQR({
      pairingPayload: {
        sessionId: "live-session-secret",
        macDeviceId: "private-device-id",
        expiresAt: Date.UTC(2030, 0, 1),
      },
      pairingCode: "AB23CD45EF",
    });
  } finally {
    console.log = originalConsoleLog;
  }

  const output = logs.join("\n");
  assert.doesNotMatch(output, /live-session-secret/);
  assert.doesNotMatch(output, /private-device-id/);
  assert.match(output, /identifiers hidden/);
  assert.match(output, /AB23CD45EF/);
});
