import assert from "node:assert/strict";
import test from "node:test";
import { hostnameFromContext, normalizeHostname } from "../dist/domain.js";

test("normalizes URLs, case, and wildcard rules", () => {
  assert.equal(
    normalizeHostname("HTTPS://WWW.Example.COM/path"),
    "www.example.com",
  );
  assert.equal(normalizeHostname("*.Example.COM"), "*.example.com");
  assert.equal(hostnameFromContext("example.com/account"), "example.com");
});

test("rejects paths masquerading as rule hostnames", () => {
  assert.throws(
    () => normalizeHostname("example.com/path"),
    /Invalid hostname/u,
  );
});
