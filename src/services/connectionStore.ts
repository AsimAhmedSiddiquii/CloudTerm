import { load } from "@tauri-apps/plugin-store";

import type {
  SavedConnection,
} from "../types/connection";

const STORE_FILE = "connections.json";
const CONNECTIONS_KEY = "connections";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeConnection(value: unknown): SavedConnection | null {
  if (!isRecord(value) || typeof value.host !== "string" || !value.host.trim() || typeof value.username !== "string" || !value.username.trim()) {
    return null;
  }

  const rawBastion = isRecord(value.bastion) ? value.bastion : null;
  const bastion = rawBastion && typeof rawBastion.host === "string" && rawBastion.host.trim() && typeof rawBastion.username === "string" && rawBastion.username.trim() && typeof rawBastion.keyId === "string"
    ? {
        host: rawBastion.host.trim(),
        port: typeof rawBastion.port === "number" && rawBastion.port >= 1 && rawBastion.port <= 65535 ? rawBastion.port : 22,
        username: rawBastion.username.trim(),
        keyId: rawBastion.keyId,
        keyName: typeof rawBastion.keyName === "string" ? rawBastion.keyName : "",
      }
    : undefined;
  const port = typeof value.port === "number" && value.port >= 1 && value.port <= 65535 ? value.port : 22;
  const timeout = typeof value.connectTimeoutSeconds === "number" ? Math.min(300, Math.max(5, value.connectTimeoutSeconds)) : undefined;
  const keepAlive = typeof value.keepAliveSeconds === "number" ? Math.min(3600, Math.max(5, value.keepAliveSeconds)) : undefined;

  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    provider: "aws",
    createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : new Date().toISOString(),
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : value.host.trim(),
    host: value.host.trim(),
    port,
    username: value.username.trim(),
    keyId: typeof value.keyId === "string" ? value.keyId : "",
    keyName: typeof value.keyName === "string" ? value.keyName : "",
    commandOnConnect: typeof value.commandOnConnect === "string" ? value.commandOnConnect : "",
    connectTimeoutSeconds: timeout,
    keepAliveSeconds: keepAlive,
    bastion,
  };
}

async function getStore() {
  return await load(STORE_FILE, {
    autoSave: 100,
  });
}

export async function getConnections(): Promise<
  SavedConnection[]
> {
  const store = await getStore();

  const connections =
    await store.get<SavedConnection[]>(
      CONNECTIONS_KEY
    );

  return (connections ?? []).map(normalizeConnection).filter((item): item is SavedConnection => item !== null);
}

export async function saveConnection(
  connection: SavedConnection
) {
  await saveConnections([connection]);
}

export async function saveConnections(
  incoming: SavedConnection[]
) {
  const normalizedConnections = incoming.map(normalizeConnection);
  if (normalizedConnections.some((connection) => connection === null)) {
    throw new Error("Every connection must include a host and username.");
  }

  const normalized = normalizedConnections as SavedConnection[];
  const store = await getStore();

  const connections =
    (await store.get<SavedConnection[]>(
      CONNECTIONS_KEY
    )) ?? [];

  for (const connection of normalized) {
    const existingIndex = connections.findIndex((item) => item.id === connection.id);

    if (existingIndex >= 0) {
      connections[existingIndex] = connection;
    } else {
      connections.push(connection);
    }
  }

  await store.set(
    CONNECTIONS_KEY,
    connections
  );

  await store.save();
}

export async function deleteConnection(
  id: string
) {
  const store = await getStore();

  const connections =
    (await store.get<SavedConnection[]>(
      CONNECTIONS_KEY
    )) ?? [];

  const updated =
    connections.filter(
      (item) => item.id !== id
    );

  await store.set(
    CONNECTIONS_KEY,
    updated
  );

  await store.save();
}
