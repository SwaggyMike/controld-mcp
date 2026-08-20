import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ControlDConfig {
  apiToken?: string;
  apiBaseUrl: string;
  timeoutMs: number;
}

function readSecretsFile(secretsPath: string): Record<string, string> {
  if (!existsSync(secretsPath)) return {};

  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(secretsPath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadConfig(): ControlDConfig {
  const configDirectory = join(homedir(), ".config");
  const sharedValues = readSecretsFile(
    join(configDirectory, "mcp-secrets.env"),
  );
  const controlDValues = readSecretsFile(
    join(configDirectory, "controld-mcp.env"),
  );
  const apiToken =
    process.env.CONTROL_D_API_TOKEN ??
    controlDValues.CONTROL_D_API_TOKEN ??
    sharedValues.CONTROL_D_API_TOKEN;
  const timeoutText = process.env.CONTROL_D_REQUEST_TIMEOUT_MS ?? "15000";
  const timeoutMs = Number.parseInt(timeoutText, 10);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error(
      "CONTROL_D_REQUEST_TIMEOUT_MS must be an integer from 1000 to 60000.",
    );
  }

  return {
    ...(apiToken ? { apiToken } : {}),
    apiBaseUrl: (
      process.env.CONTROL_D_API_BASE_URL ?? "https://api.controld.com"
    ).replace(/\/$/u, ""),
    timeoutMs,
  };
}
