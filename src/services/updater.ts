import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AvailableUpdate {
  version: string;
  notes?: string;
}

export async function isUpdaterConfigured(): Promise<boolean> {
  return invoke<boolean>("updater_configured");
}

export async function findUpdate(): Promise<AvailableUpdate | null> {
  const update = await check();
  if (!update) {
    return null;
  }

  return {
    version: update.version,
    notes: update.body ?? undefined,
  };
}

export async function installUpdate(): Promise<void> {
  const update = await check();
  if (!update) {
    return;
  }

  await update.downloadAndInstall();
  await relaunch();
}
