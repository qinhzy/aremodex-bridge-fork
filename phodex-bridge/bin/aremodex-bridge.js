#!/usr/bin/env node
// FILE: aremodex-bridge.js
// Purpose: Aremodex-facing CLI alias for the Remodex bridge command surface.
// Layer: CLI binary
// Exports: none
// Depends on: ./remodex

const { main } = require("./remodex");

void main();
