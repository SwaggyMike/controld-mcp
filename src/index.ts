#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ControlDClient } from "./client.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

try {
  const server = createServer(new ControlDClient(loadConfig()));
  await server.connect(new StdioServerTransport());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`controld-mcp: ${message}\n`);
  process.exitCode = 1;
}
