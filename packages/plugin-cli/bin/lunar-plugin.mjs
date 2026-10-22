#!/usr/bin/env node
// Runs the CLI from source inside the Lunar workspace (Node 23.6+ strips the
// types). The published package runs the compiled dist/bin.js instead.
import '../src/bin.ts';
