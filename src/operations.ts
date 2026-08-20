import {
  asRecord,
  bodyList,
  ControlDApiError,
  type ControlDClient,
  itemId,
  stringValue,
  unwrapBody,
} from "./client.js";
import { normalizeHostname } from "./domain.js";

export type RuleAction = "block" | "bypass" | "redirect";

const actionCode: Record<RuleAction, number> = {
  block: 0,
  bypass: 1,
  redirect: 3,
};

export async function profiles(
  client: ControlDClient,
): Promise<Record<string, unknown>[]> {
  return bodyList(await client.request("GET", "/profiles"), "profiles");
}

export async function resolveProfile(
  client: ControlDClient,
  selector: string,
): Promise<Record<string, unknown>> {
  const rows = await profiles(client);
  const needle = selector.trim().toLowerCase();
  const matches = rows.filter((row) => {
    const id = itemId(row)?.toLowerCase();
    const name = stringValue(row.name)?.toLowerCase();
    return id === needle || name === needle;
  });
  if (matches.length !== 1) {
    throw new ControlDApiError(
      matches.length === 0
        ? `No profile matches ${selector}.`
        : `Profile selector ${selector} is ambiguous.`,
    );
  }
  return matches[0]!;
}

export async function profileRules(
  client: ControlDClient,
  selector: string,
): Promise<Record<string, unknown>[]> {
  const profile = await resolveProfile(client, selector);
  const id = requiredId(profile, "profile");
  return bodyList(
    await client.request(
      "GET",
      `/profiles/${encodeURIComponent(id)}/rules/all`,
    ),
    "rules",
  );
}

export async function profileServices(
  client: ControlDClient,
  selector: string,
): Promise<unknown> {
  const profile = await resolveProfile(client, selector);
  const profileId = requiredId(profile, "profile");
  const [states, catalog] = await Promise.all([
    bodyList(
      await client.request(
        "GET",
        `/profiles/${encodeURIComponent(profileId)}/services`,
      ),
      "services",
    ),
    serviceCatalog(client),
  ]);
  return { profileId, profileName: profile.name, states, catalog };
}

export async function setServicePolicy(
  client: ControlDClient,
  profileSelector: string,
  serviceSelector: string,
  mode: "off" | "block" | "bypass" | "redirect",
  proxyLocationId?: string,
): Promise<unknown> {
  const profile = await resolveProfile(client, profileSelector);
  const profileId = requiredId(profile, "profile");
  const catalog = await serviceCatalog(client);
  const needle = serviceSelector.trim().toLowerCase();
  const matches = catalog.filter(
    (service) =>
      itemId(service)?.toLowerCase() === needle ||
      stringValue(service.name)?.toLowerCase() === needle,
  );
  if (matches.length !== 1) {
    throw new ControlDApiError(
      matches.length === 0
        ? `No service matches ${serviceSelector}.`
        : `Service selector ${serviceSelector} is ambiguous; use its ID.`,
    );
  }
  const serviceId = requiredId(matches[0]!, "service");
  const modeCode = mode === "bypass" ? 1 : mode === "redirect" ? 3 : 0;
  const payload: Record<string, unknown> = {
    status: mode === "off" ? 0 : 1,
    do: modeCode,
  };
  if (mode === "redirect") {
    if (!proxyLocationId)
      throw new Error(
        "proxyLocationId is required in redirect mode. Use list_proxy_locations first.",
      );
    payload.via = proxyLocationId;
    payload.via_v6 = proxyLocationId;
  }
  await client.request(
    "PUT",
    `/profiles/${encodeURIComponent(profileId)}/services/${encodeURIComponent(serviceId)}`,
    payload,
  );
  const states = bodyList(
    await client.request(
      "GET",
      `/profiles/${encodeURIComponent(profileId)}/services`,
    ),
    "services",
  );
  return {
    profileId,
    serviceId,
    serviceName: matches[0]!.name,
    mode,
    proxyLocationId: proxyLocationId ?? null,
    verifiedState: states.find((state) => itemId(state) === serviceId) ?? null,
  };
}

export async function setPause(
  client: ControlDClient,
  selector: string,
  minutes: number,
): Promise<unknown> {
  const profile = await resolveProfile(client, selector);
  const id = requiredId(profile, "profile");
  const disableTtl =
    minutes === 0 ? 0 : Math.floor(Date.now() / 1000) + minutes * 60;
  await client.request("PUT", `/profiles/${encodeURIComponent(id)}`, {
    disable_ttl: disableTtl,
  });
  const verified = await resolveProfile(client, id);
  return {
    profileId: id,
    profileName: verified.name,
    pausedUntil:
      disableTtl === 0 ? null : new Date(disableTtl * 1000).toISOString(),
    verifiedProfile: verified,
  };
}

export async function createRules(
  client: ControlDClient,
  selector: string,
  hostnames: string[],
  action: RuleAction,
  options: {
    comment: string;
    expiresInMinutes?: number;
    proxyLocationId?: string;
  },
): Promise<unknown> {
  const profile = await resolveProfile(client, selector);
  const id = requiredId(profile, "profile");
  const normalized = [...new Set(hostnames.map(normalizeHostname))];
  const payload: Record<string, unknown> = {
    do: actionCode[action],
    status: 1,
    via: "-1",
    via_v6: "-1",
    hostnames: normalized,
    group: 0,
    comment: options.comment,
  };
  if (options.expiresInMinutes !== undefined)
    payload.ttl = Math.floor(Date.now() / 1000) + options.expiresInMinutes * 60;
  if (action === "redirect") {
    if (!options.proxyLocationId)
      throw new Error(
        "proxyLocationId is required for redirect rules. Use list_proxy_locations first.",
      );
    payload.via = options.proxyLocationId;
    payload.via_v6 = options.proxyLocationId;
  }
  await client.request(
    "POST",
    `/profiles/${encodeURIComponent(id)}/rules`,
    payload,
  );
  const rules = await profileRules(client, id);
  return {
    profileId: id,
    action,
    hostnames: normalized,
    verifiedRules: rules.filter((rule) =>
      normalized.includes(ruleHostname(rule)),
    ),
  };
}

export async function deleteRules(
  client: ControlDClient,
  selector: string,
  hostnames: string[],
): Promise<unknown> {
  const profile = await resolveProfile(client, selector);
  const id = requiredId(profile, "profile");
  const normalized = [...new Set(hostnames.map(normalizeHostname))];
  await client.request("DELETE", `/profiles/${encodeURIComponent(id)}/rules`, {
    hostnames: normalized,
  });
  const rules = await profileRules(client, id);
  return {
    profileId: id,
    deleted: normalized,
    remainingMatches: rules.filter((rule) =>
      normalized.includes(ruleHostname(rule)),
    ),
  };
}

export async function recentActivity(
  client: ControlDClient,
  minutes: number,
  limit: number,
  blockedOnly: boolean,
  endpointId?: string,
  search?: string,
): Promise<unknown> {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60_000);
  const params = new URLSearchParams({
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    page: "0",
    pageSize: "200",
  });
  if (endpointId) params.set("endpointId", endpointId);
  if (search) params.set("searchQuestion", search);
  const response = asRecord(unwrapBody(await client.analytics(params)));
  const rawQueries = Array.isArray(response.queries) ? response.queries : [];
  const queriesInWindow = rawQueries.filter((query) => {
    const record = asRecord(query);
    const timestamp = Date.parse(String(record.timestamp ?? ""));
    return timestamp >= start.getTime() && timestamp <= end.getTime();
  });
  const matchingQueries = blockedOnly
    ? queriesInWindow.filter((query) => asRecord(query).action === 0)
    : queriesInWindow;
  const queries = matchingQueries.slice(0, limit);
  return {
    window: { start: start.toISOString(), end: end.toISOString() },
    queries,
    meta: {
      provider: response.meta ?? null,
      scannedQueryCount: rawQueries.length,
      matchingQueryCount: matchingQueries.length,
      returnedQueryCount: queries.length,
      resultLimit: limit,
      sourcePageFull: rawQueries.length === 200,
    },
  };
}

export async function proxyLocations(client: ControlDClient): Promise<unknown> {
  return unwrapBody(await client.request("GET", "/proxies"));
}

async function serviceCatalog(
  client: ControlDClient,
): Promise<Record<string, unknown>[]> {
  const body = asRecord(
    unwrapBody(await client.request("GET", "/services/categories/all")),
  );
  const rows = Array.isArray(body.services) ? body.services : body.categories;
  if (!Array.isArray(rows))
    throw new ControlDApiError(
      "Control D response is missing the service catalog.",
    );
  const services: Record<string, unknown>[] = [];
  for (const rowValue of rows) {
    const row = asRecord(rowValue);
    if (Array.isArray(row.services)) {
      for (const serviceValue of row.services) {
        services.push({
          ...asRecord(serviceValue),
          category: stringValue(row.PK) ?? stringValue(row.category),
        });
      }
    } else {
      services.push(row);
    }
  }
  return services;
}

function requiredId(item: Record<string, unknown>, label: string): string {
  const id = itemId(item);
  if (!id) throw new ControlDApiError(`Control D ${label} has no identifier.`);
  return id;
}

function ruleHostname(rule: Record<string, unknown>): string {
  return (
    stringValue(rule.hostname) ??
    stringValue(rule.PK) ??
    stringValue(rule.pk) ??
    ""
  );
}
