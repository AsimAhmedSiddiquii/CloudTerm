import type { SavedConnection } from "../types/connection";

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
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file.");
  const backup = parsed as { format?: unknown; version?: unknown; connections?: unknown };
  if (backup.format !== FORMAT || backup.version !== VERSION || !Array.isArray(backup.connections)) {
    throw new Error("This is not a supported CloudTerm connection backup.");
  }

  return backup.connections.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<SavedConnection>;
    if (typeof item.host !== "string" || typeof item.username !== "string") return [];
    return [{
      id: crypto.randomUUID(),
      provider: "aws" as const,
      createdAt: new Date().toISOString(),
      name: typeof item.name === "string" && item.name.trim() ? item.name : item.host,
      host: item.host,
      port: typeof item.port === "number" && item.port > 0 ? item.port : 22,
      username: item.username,
      keyId: typeof item.keyId === "string" ? item.keyId : "",
      keyName: typeof item.keyName === "string" ? item.keyName : "",
      commandOnConnect: typeof item.commandOnConnect === "string" ? item.commandOnConnect : "",
      connectTimeoutSeconds: typeof item.connectTimeoutSeconds === "number" ? item.connectTimeoutSeconds : undefined,
      keepAliveSeconds: typeof item.keepAliveSeconds === "number" ? item.keepAliveSeconds : undefined,
      bastion: item.bastion,
    }];
  });
}
