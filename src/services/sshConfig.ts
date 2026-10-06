import { invoke } from "@tauri-apps/api/core";

export interface SshConfigEntry {
  alias: string;
  host: string;
  port: number;
  username?: string;
  identityFiles: string[];
}

export function listSshConfigEntries() {
  return invoke<SshConfigEntry[]>("ssh_config_entries");
}
