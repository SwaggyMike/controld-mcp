import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ControlDClient } from "../dist/client.js";
import { createServer } from "../dist/server.js";

test("advertises the complete guarded tool surface", async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createServer(
    new ControlDClient({
      apiBaseUrl: "https://api.controld.test",
      timeoutMs: 1000,
    }),
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const response = await client.listTools();
  const names = response.tools.map((tool) => tool.name);
  assert.deepEqual(
    names.sort(),
    [
      "check_domain",
      "check_setup",
      "create_block_rules",
      "create_bypass_rules",
      "create_redirect_rules",
      "delete_rules",
      "diagnose_recent_blocks",
      "get_recent_activity",
      "list_endpoints",
      "list_profile_rules",
      "list_profile_services",
      "list_profiles",
      "list_proxy_locations",
      "pause_profile",
      "resume_profile",
      "set_rules_enabled",
      "set_service_policy",
    ].sort(),
  );
  for (const name of [
    "pause_profile",
    "resume_profile",
    "create_bypass_rules",
    "create_block_rules",
    "create_redirect_rules",
    "delete_rules",
    "set_rules_enabled",
    "set_service_policy",
  ]) {
    const tool = response.tools.find((candidate) => candidate.name === name);
    assert.ok(
      tool.inputSchema.required.includes("confirm"),
      `${name} must require confirm`,
    );
  }
  await client.close();
  await server.close();
});
