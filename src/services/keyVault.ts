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
