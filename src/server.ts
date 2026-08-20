import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ControlDClient } from "./client.js";
import { registerTools } from "./tools.js";

export function createServer(client: ControlDClient): McpServer {
  const server = new McpServer(
    { name: "controld-mcp", version: "0.1.0" },
    {
      instructions:
        "Control D DNS management. Start with check_setup and list_profiles. Diagnose failures with diagnose_recent_blocks, then propose the narrowest exact-domain bypass. Never mutate DNS policy until the user has reviewed the exact profile, domains, action, expiry, and proxy location and explicitly approved it; mutation tools enforce confirm=true. Activity-log support uses Control D's current dashboard contract and may change because the public API is unversioned.",
    },
  );
  registerTools(server, client);
  return server;
}
