import type { BastionConfig, SavedConnection } from "../types/connection";

const FORMAT = "cloudterm-connections";
const VERSION = 1;

export function serializeConnections(connections: SavedConnection[]) {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    connections,
  }, null, 2);
}

export function parseConnections(contents: string): SavedConnection[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("The backup file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file.");
  const backup = parsed as { format?: unknown; version?: unknown; connections?: unknown };
  if (backup.format !== FORMAT || backup.version !== VERSION || !Array.isArray(backup.connections)) {
    throw new Error("This is not a supported CloudTerm connection backup.");
  }

  const validPort = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535
      ? value
      : fallback;

  const parseBastion = (value: unknown): BastionConfig | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const bastion = value as Partial<BastionConfig>;
    if (
      typeof bastion.host !== "string" || !bastion.host.trim() ||
      typeof bastion.username !== "string" || !bastion.username.trim() ||
      typeof bastion.keyId !== "string"
    ) {
      return undefined;
    }
    return {
      host: bastion.host.trim(),
      port: validPort(bastion.port, 22),
      username: bastion.username.trim(),
      keyId: bastion.keyId,
      keyName: typeof bastion.keyName === "string" ? bastion.keyName : "",
    };
  };

  return backup.connections.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<SavedConnection>;
    if (
      typeof item.host !== "string" || !item.host.trim() ||
      typeof item.username !== "string" || !item.username.trim()
    ) return [];
    return [{
      id: crypto.randomUUID(),
      provider: "aws" as const,
      createdAt: new Date().toISOString(),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : item.host.trim(),
      host: item.host.trim(),
      port: validPort(item.port, 22),
      username: item.username.trim(),
      keyId: typeof item.keyId === "string" ? item.keyId : "",
      keyName: typeof item.keyName === "string" ? item.keyName : "",
      commandOnConnect: typeof item.commandOnConnect === "string" ? item.commandOnConnect : "",
      connectTimeoutSeconds: typeof item.connectTimeoutSeconds === "number" ? item.connectTimeoutSeconds : undefined,
      keepAliveSeconds: typeof item.keepAliveSeconds === "number" ? item.keepAliveSeconds : undefined,
      bastion: parseBastion(item.bastion),
    }];
  });
}
