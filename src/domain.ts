import { domainToASCII } from "node:url";

export function normalizeHostname(input: string): string {
  let value = input.trim().toLowerCase();
  let wildcard = "";
  if (value.startsWith("*.")) {
    wildcard = "*.";
    value = value.slice(2);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) value = new URL(value).hostname;
  if (value.includes("/") || value.includes(":") || value.includes(" ")) {
    throw new Error(`Invalid hostname: ${input}`);
  }
  const ascii = domainToASCII(value).replace(/\.$/u, "");
  if (
    !ascii ||
    ascii.length > 253 ||
    !ascii.includes(".") ||
    !/^[a-z0-9.-]+$/u.test(ascii)
  ) {
    throw new Error(`Invalid hostname: ${input}`);
  }
  return `${wildcard}${ascii}`;
}

export function hostnameFromContext(input: string): string {
  try {
    return normalizeHostname(input);
  } catch {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    return normalizeHostname(url.hostname);
  }
}
