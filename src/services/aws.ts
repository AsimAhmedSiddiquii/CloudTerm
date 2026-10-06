import { invoke } from "@tauri-apps/api/core";

export interface Ec2Instance {
  id: string;
  name: string;
  state: string;
  instanceType: string;
  region: string;
  availabilityZone: string;
  publicIp?: string;
  privateIp?: string;
  publicDns?: string;
}

export function discoverInstances(profile: string, region: string) {
  return invoke<Ec2Instance[]>("aws_discover_instances", {
    request: { profile: profile.trim() || null, region: region.trim() || null },
  });
}
