import type { ControlDConfig } from "./config.js";

export class ControlDApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ControlDApiError";
  }
}

export class ControlDClient {
  constructor(private readonly config: ControlDConfig) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new ControlDApiError("Invalid Control D API path.");
    }
    return this.requestUrl(method, `${this.config.apiBaseUrl}${path}`, body);
  }

  async analytics(params: URLSearchParams): Promise<unknown> {
    const user = asRecord(unwrapBody(await this.request("GET", "/users")));
    const organization = asOptionalRecord(user.org);
    const endpoint =
      stringValue(user.stats_endpoint) ??
      stringValue(organization?.stats_endpoint);
    if (!endpoint) {
      throw new ControlDApiError(
        "This Control D account did not provide an analytics endpoint. Full Analytics may be disabled.",
      );
    }
    const baseUrl = analyticsBaseUrl(endpoint);
    return this.requestUrl(
      "GET",
      `${baseUrl}/v2/activity-log?${params.toString()}`,
    );
  }

  // Asks an endpoint's own DNS-over-HTTPS resolver how it would answer a name.
  // This is not an API call: the resolver is public, so no token is sent.
  async dnsVerdict(endpointId: string, hostname: string): Promise<unknown> {
    if (!/^[a-z0-9]+$/iu.test(endpointId)) {
      throw new ControlDApiError("Invalid Control D endpoint ID.");
    }
    const params = new URLSearchParams({
      name: hostname,
      type: "A",
      controld: "1",
      no_log: "1",
    });
    let response: Response;
    try {
      response = await fetch(
        `https://dns.controld.com/${endpointId}?${params.toString()}`,
        {
          headers: { Accept: "application/dns+json" },
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ControlDApiError(`Control D DNS lookup failed: ${message}`);
    }
    if (!response.ok) {
      throw new ControlDApiError(
        `Control D DNS lookup returned HTTP ${response.status}.`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ControlDApiError(
        "Control D DNS lookup returned a non-JSON response.",
        response.status,
      );
    }
  }

  private async requestUrl(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!this.config.apiToken) {
      throw new ControlDApiError(
        "CONTROL_D_API_TOKEN is missing. Add it to the environment, ~/.config/controld-mcp.env, or ~/.config/mcp-secrets.env, then restart the MCP host.",
      );
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ControlDApiError(`Control D request failed: ${message}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ControlDApiError(
        "Control D rejected the API token or its source-IP policy.",
        response.status,
      );
    }
    if (!response.ok) {
      throw new ControlDApiError(
        `Control D returned HTTP ${response.status}.`,
        response.status,
      );
    }
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    )
      return null;
    try {
      return await response.json();
    } catch {
      throw new ControlDApiError(
        "Control D returned a non-JSON response.",
        response.status,
      );
    }
  }
}

export function unwrapBody(value: unknown): unknown {
  const record = asRecord(value);
  return "body" in record ? record.body : record;
}

export function bodyList(
  value: unknown,
  key: string,
): Record<string, unknown>[] {
  const body = asRecord(unwrapBody(value));
  const list = body[key];
  if (!Array.isArray(list))
    throw new ControlDApiError(
      `Control D response is missing the ${key} list.`,
    );
  return list.map((item) => asRecord(item));
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ControlDApiError(
      "Control D returned an unexpected response shape.",
    );
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function itemId(item: Record<string, unknown>): string | undefined {
  for (const key of ["PK", "pk", "id"]) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
  }
  return undefined;
}

function analyticsBaseUrl(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/$/u, "");
  if (/^https:\/\/[a-z0-9.-]+\.analytics\.controld\.com$/iu.test(normalized))
    return normalized;
  if (/^[a-z0-9-]+\.analytics\.controld\.com$/iu.test(normalized))
    return `https://${normalized}`;
  if (/^[a-z0-9-]+$/iu.test(normalized))
    return `https://${normalized}.analytics.controld.com`;
  throw new ControlDApiError(
    "Control D returned an invalid analytics endpoint.",
  );
}
