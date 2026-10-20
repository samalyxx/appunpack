#!/usr/bin/env node
import { main } from "../src/cli.mjs";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`apk-lens: ${error.message}\n`);
  process.exitCode = 1;
}
