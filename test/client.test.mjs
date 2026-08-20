import assert from "node:assert/strict";
import test from "node:test";
import {
  ControlDApiError,
  ControlDClient,
  bodyList,
  unwrapBody,
} from "../dist/client.js";

const config = {
  apiToken: "test-secret",
  apiBaseUrl: "https://api.controld.test",
  timeoutMs: 1000,
};

test("sends bearer authentication and unwraps standard lists", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.controld.test/profiles");
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    return new Response(
      JSON.stringify({ body: { profiles: [{ PK: "one", name: "Global" }] } }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
  const client = new ControlDClient(config);
  const rows = bodyList(await client.request("GET", "/profiles"), "profiles");
  assert.equal(rows[0].name, "Global");
});

test("does not include provider response bodies in HTTP errors", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response("sensitive upstream details", { status: 500 });
  const client = new ControlDClient(config);
  await assert.rejects(client.request("GET", "/profiles"), (error) => {
    assert.ok(error instanceof ControlDApiError);
    assert.equal(error.message, "Control D returned HTTP 500.");
    assert.ok(!error.message.includes("sensitive"));
    return true;
  });
});

test("constrains API paths", async () => {
  const client = new ControlDClient(config);
  await assert.rejects(
    client.request("GET", "https://evil.example"),
    /Invalid Control D API path/u,
  );
  await assert.rejects(
    client.request("GET", "//evil.example"),
    /Invalid Control D API path/u,
  );
});

test("unwraps analytics-style success/body envelopes", () => {
  const body = { meta: { page: 1 }, queries: [{ question: "example.com" }] };
  assert.deepEqual(unwrapBody({ success: true, body }), body);
});
