import { load } from "@tauri-apps/plugin-store";

import type {
  SavedConnection,
} from "../types/connection";

const STORE_FILE = "connections.json";
const CONNECTIONS_KEY = "connections";

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

  return connections ?? [];
}

export async function saveConnection(
  connection: SavedConnection
) {
  const store = await getStore();

  const connections =
    (await store.get<SavedConnection[]>(
      CONNECTIONS_KEY
    )) ?? [];

  const existingIndex =
    connections.findIndex(
      (item) => item.id === connection.id
    );

  if (existingIndex >= 0) {
    connections[existingIndex] = connection;
  } else {
    connections.push(connection);
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