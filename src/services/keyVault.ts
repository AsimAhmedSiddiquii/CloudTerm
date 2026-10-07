import { invoke } from "@tauri-apps/api/core";

export interface ImportedKey {
  id: string;
  name: string;
}

export async function importKey(
  password: string,
  name: string,
  path: string
): Promise<ImportedKey> {
  if (!password.trim()) {
    throw new Error("Enter a vault password first.");
  }

  return invoke<ImportedKey>("vault_import_key", {
    request: { path, name, password },
  });
}

export async function readKey(
  password: string,
  id: string
): Promise<string> {
  if (!password.trim()) {
    throw new Error("Enter the vault password to unlock this key.");
  }

  return invoke<string>("vault_read_key", {
    id,
    password,
  });
}

export async function listKeys(
  password: string
): Promise<ImportedKey[]> {
  return invoke<ImportedKey[]>("vault_list_keys", { password });
}

export async function isVaultInitialized(): Promise<boolean> {
  return invoke<boolean>("vault_initialized");
}

export async function deleteKey(
  password: string,
  id: string
): Promise<void> {
  await invoke("vault_delete_key", { id, password });
}
