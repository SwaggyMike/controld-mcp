import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bodyList, ControlDApiError, type ControlDClient } from "./client.js";
import { hostnameFromContext } from "./domain.js";
import {
  checkDomain,
  createRules,
  deleteRules,
  profileRules,
  profileServices,
  profiles,
  proxyLocations,
  recentActivity,
  setPause,
  setRulesEnabled,
  setServicePolicy,
} from "./operations.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const mutation = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
const profile = z.string().min(1).describe("Exact profile name or profile ID");
const confirm = z
  .literal(true)
  .describe("Must be exactly true after reviewing the requested change");
const hostnames = z
  .array(z.string().min(1))
  .min(1)
  .max(50)
  .describe("Exact domains or *.domain wildcard patterns");

function success(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { result: data },
  };
}

function failure(error: unknown): CallToolResult {
  const message =
    error instanceof ControlDApiError || error instanceof Error
      ? error.message
      : "Unexpected Control D MCP error.";
  return { content: [{ type: "text", text: message }], isError: true };
}

async function run(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return success(await operation());
  } catch (error) {
    return failure(error);
  }
}

export function registerTools(server: McpServer, client: ControlDClient): void {
  server.registerTool(
    "check_setup",
    {
      title: "Check Control D connection",
      description:
        "Validate the token and report account capabilities without revealing the token.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () =>
      run(async () => {
        const [user, profileRows] = await Promise.all([
          client.request("GET", "/users"),
          profiles(client),
        ]);
        return { connected: true, user, profileCount: profileRows.length };
      }),
  );

  server.registerTool(
    "list_profiles",
    {
      title: "List Control D profiles",
      description: "List profiles and their current pause state.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => run(() => profiles(client)),
  );
  server.registerTool(
    "list_endpoints",
    {
      title: "List Control D endpoints",
      description: "List devices/endpoints with recent activity metadata.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () =>
      run(async () =>
        bodyList(
          await client.request("GET", "/devices?last_activity=1"),
          "devices",
        ),
      ),
  );
  server.registerTool(
    "list_proxy_locations",
    {
      title: "List redirect locations",
      description: "List Control D proxy locations and IDs for redirect rules.",
      inputSchema: {},
      annotations: readOnly,
    },
    async () => run(() => proxyLocations(client)),
  );
  server.registerTool(
    "list_profile_rules",
    {
      title: "List custom rules",
      description: "List all custom rules for one profile.",
      inputSchema: { profile },
      annotations: readOnly,
    },
    async ({ profile: selector }) => run(() => profileRules(client, selector)),
  );
  server.registerTool(
    "list_profile_services",
    {
      title: "List service policies",
      description:
        "List the current profile service states plus the service catalog. Use this to resolve names such as YouTube to exact IDs. Pass search to filter the catalog, which is otherwise several hundred entries.",
      inputSchema: {
        profile,
        search: z
          .string()
          .min(1)
          .optional()
          .describe("Case-insensitive text to match service names or IDs"),
      },
      annotations: readOnly,
    },
    async ({ profile: selector, search }) =>
      run(() => profileServices(client, selector, search)),
  );

  server.registerTool(
    "check_domain",
    {
      title: "Check how a domain is handled",
      description:
        "Ask Control D how it would answer a domain right now (blocked, bypassed, redirected, or resolved normally) and which filter, service, custom rule, or default rule decided it. Needs no real traffic. Checks every endpoint unless one is named.",
      inputSchema: {
        site: z.string().min(1).describe("A domain or URL"),
        endpoint: z
          .string()
          .min(1)
          .optional()
          .describe("Exact endpoint name or ID; omit to check every endpoint"),
      },
      annotations: readOnly,
    },
    async ({ site, endpoint }) => run(() => checkDomain(client, site, endpoint)),
  );

  const activitySchema = {
    minutes: z.number().int().min(1).max(1440).default(15),
    limit: z.number().int().min(1).max(200).default(50),
    endpointId: z.string().min(1).optional(),
    search: z
      .string()
      .min(1)
      .optional()
      .describe("Domain or activity-log search text"),
  };
  server.registerTool(
    "get_recent_activity",
    {
      title: "Get recent DNS activity",
      description:
        "Read recent Control D activity. Activity logs require Full Analytics and are sensitive; results are not stored.",
      inputSchema: {
        ...activitySchema,
        blockedOnly: z.boolean().default(false),
      },
      annotations: readOnly,
    },
    async ({ minutes, limit, blockedOnly, endpointId, search }) =>
      run(() =>
        recentActivity(client, minutes, limit, blockedOnly, endpointId, search),
      ),
  );
  server.registerTool(
    "diagnose_recent_blocks",
    {
      title: "Diagnose a blocked website",
      description:
        "Find DNS queries blocked in the recent browsing window. Supply the site you tried; dependent domains may appear separately in the results.",
      inputSchema: { site: z.string().min(1), ...activitySchema },
      annotations: readOnly,
    },
    async ({ site, minutes, limit, endpointId }) =>
      run(async () => {
        const siteHostname = hostnameFromContext(site);
        const activity = await recentActivity(
          client,
          minutes,
          limit,
          true,
          endpointId,
        );
        return {
          siteHostname,
          guidance:
            "Review the timestamps and trigger fields. Modern pages often fail because a related CDN, login, media, or consent domain was blocked—not only the visible site. A bypass rule applies to every endpoint that enforces this profile, not just the device that hit the block; use check_domain to confirm the result.",
          activity,
        };
      }),
  );

  server.registerTool(
    "pause_profile",
    {
      title: "Temporarily pause Control D",
      description:
        "Pause all enforcement on a profile for a bounded time. This changes live DNS behavior and requires confirm=true.",
      inputSchema: {
        profile,
        minutes: z.number().int().min(1).max(1440),
        confirm,
      },
      annotations: mutation,
    },
    async ({ profile: selector, minutes }) =>
      run(() => setPause(client, selector, minutes)),
  );
  server.registerTool(
    "resume_profile",
    {
      title: "Resume Control D",
      description:
        "Immediately resume a paused profile. Requires confirm=true.",
      inputSchema: { profile, confirm },
      annotations: mutation,
    },
    async ({ profile: selector }) => run(() => setPause(client, selector, 0)),
  );

  const ruleOptions = {
    profile,
    hostnames,
    comment: z.string().max(250).default("Created through controld-mcp"),
    expiresInMinutes: z
      .number()
      .int()
      .min(1)
      .max(43200)
      .optional()
      .describe("Optional expiry, up to 30 days"),
    confirm,
  };
  server.registerTool(
    "create_bypass_rules",
    {
      title: "Unblock domains",
      description:
        "Create enabled custom bypass rules. Use exact domains first; wildcards are broader. Requires confirm=true.",
      inputSchema: ruleOptions,
      annotations: mutation,
    },
    async ({
      profile: selector,
      hostnames: names,
      comment,
      expiresInMinutes,
    }) =>
      run(() =>
        createRules(client, selector, names, "bypass", {
          comment,
          ...(expiresInMinutes === undefined ? {} : { expiresInMinutes }),
        }),
      ),
  );
  server.registerTool(
    "create_block_rules",
    {
      title: "Block domains",
      description: "Create enabled custom block rules. Requires confirm=true.",
      inputSchema: ruleOptions,
      annotations: mutation,
    },
    async ({
      profile: selector,
      hostnames: names,
      comment,
      expiresInMinutes,
    }) =>
      run(() =>
        createRules(client, selector, names, "block", {
          comment,
          ...(expiresInMinutes === undefined ? {} : { expiresInMinutes }),
        }),
      ),
  );
  server.registerTool(
    "create_redirect_rules",
    {
      title: "Redirect domains",
      description:
        "Redirect matching domains through a Control D proxy location. Use list_proxy_locations first. Requires confirm=true.",
      inputSchema: { ...ruleOptions, proxyLocationId: z.string().min(1) },
      annotations: mutation,
    },
    async ({
      profile: selector,
      hostnames: names,
      comment,
      expiresInMinutes,
      proxyLocationId,
    }) =>
      run(() =>
        createRules(client, selector, names, "redirect", {
          comment,
          proxyLocationId,
          ...(expiresInMinutes === undefined ? {} : { expiresInMinutes }),
        }),
      ),
  );
  server.registerTool(
    "set_rules_enabled",
    {
      title: "Enable or disable custom rules",
      description:
        "Switch existing custom rules on or off without deleting them. The rule's action and redirect target are kept. Requires confirm=true.",
      inputSchema: {
        profile,
        hostnames: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("Exact rule names as shown by list_profile_rules"),
        enabled: z.boolean(),
        confirm,
      },
      annotations: mutation,
    },
    async ({ profile: selector, hostnames: names, enabled }) =>
      run(() => setRulesEnabled(client, selector, names, enabled)),
  );

  server.registerTool(
    "delete_rules",
    {
      title: "Delete custom rules",
      description:
        "Delete rules by exact hostname. This is destructive and requires confirm=true.",
      inputSchema: { profile, hostnames, confirm },
      annotations: mutation,
    },
    async ({ profile: selector, hostnames: names }) =>
      run(() => deleteRules(client, selector, names)),
  );
  server.registerTool(
    "set_service_policy",
    {
      title: "Set service policy",
      description:
        "Turn a named service off, block it, bypass it, or route it through a Control D proxy location. Service rules can cover changing domain sets and override filters. Requires confirm=true.",
      inputSchema: {
        profile,
        service: z
          .string()
          .min(1)
          .describe(
            "Exact service name or service ID from list_profile_services",
          ),
        mode: z.enum(["off", "block", "bypass", "redirect"]),
        proxyLocationId: z.string().min(1).optional(),
        confirm,
      },
      annotations: mutation,
    },
    async ({ profile: selector, service, mode, proxyLocationId }) =>
      run(() =>
        setServicePolicy(client, selector, service, mode, proxyLocationId),
      ),
  );
}
