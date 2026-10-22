#!/usr/bin/env node
// Node 23.6+ strips TypeScript types natively, so the CLI runs from source.
import { main } from '../src/cli.ts';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
