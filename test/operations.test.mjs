import assert from "node:assert/strict";
import test from "node:test";
import { ControlDClient } from "../dist/client.js";
import {
  createRules,
  recentActivity,
  resolveProfile,
  setPause,
} from "../dist/operations.js";

const config = {
  apiToken: "test-secret",
  apiBaseUrl: "https://api.controld.test",
  timeoutMs: 1000,
};

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("requires an exact unambiguous profile", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    json({
      body: {
        profiles: [
          { PK: "p1", name: "Global" },
          { PK: "p2", name: "Guest" },
        ],
      },
    });
  const profile = await resolveProfile(new ControlDClient(config), "global");
  assert.equal(profile.PK, "p1");
  await assert.rejects(
    resolveProfile(new ControlDClient(config), "missing"),
    /No profile matches/u,
  );
});

test("pause writes an epoch and reads the profile back", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method, body: options.body });
    if (options.method === "PUT") return json({ body: {} });
    return json({ body: { profiles: [{ PK: "p1", name: "Global" }] } });
  };
  const result = await setPause(new ControlDClient(config), "Global", 10);
  const mutation = requests.find((request) => request.method === "PUT");
  assert.equal(mutation.url, "https://api.controld.test/profiles/p1");
  const payload = JSON.parse(mutation.body);
  assert.ok(payload.disable_ttl > Math.floor(Date.now() / 1000));
  assert.equal(result.profileId, "p1");
});

test("bypass creation normalizes domains and verifies the result", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let posted;
  globalThis.fetch = async (url, options) => {
    if (options.method === "POST") {
      posted = JSON.parse(options.body);
      return json({ body: {} });
    }
    if (url.endsWith("/rules/all"))
      return json({ body: { rules: [{ PK: "cdn.example.com", do: 1 }] } });
    return json({ body: { profiles: [{ PK: "p1", name: "Global" }] } });
  };
  const result = await createRules(
    new ControlDClient(config),
    "Global",
    ["CDN.Example.com"],
    "bypass",
    { comment: "test" },
  );
  assert.deepEqual(posted.hostnames, ["cdn.example.com"]);
  assert.equal(posted.do, 1);
  assert.equal(result.verifiedRules.length, 1);
});

test("activity uses zero-based paging and filters blocked rows locally", async () => {
  let requestedParams;
  const now = Date.now();
  const client = {
    analytics: async (params) => {
      requestedParams = params;
      return {
        success: true,
        body: {
          queries: [
            {
              timestamp: new Date(now - 60_000).toISOString(),
              question: "blocked.example",
              action: 0,
            },
            {
              timestamp: new Date(now - 30_000).toISOString(),
              question: "allowed.example",
              action: 1,
            },
          ],
          meta: { page: 0 },
        },
      };
    },
  };

  const result = await recentActivity(client, 15, 50, true);
  assert.equal(requestedParams.get("page"), "0");
  assert.equal(requestedParams.get("pageSize"), "200");
  assert.equal(requestedParams.has("action"), false);
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].question, "blocked.example");
  assert.equal(result.meta.scannedQueryCount, 2);
});
