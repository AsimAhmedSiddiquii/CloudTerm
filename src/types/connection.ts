export interface ConnectionDraft {
  name: string;
  host: string;
  port: number;
  username: string;
  keyId: string;
  keyName: string;
  commandOnConnect: string;
  connectTimeoutSeconds?: number;
  keepAliveSeconds?: number;
  bastion?: BastionConfig;
}

export interface BastionConfig {
  host: string;
  port: number;
  username: string;
  keyId: string;
  keyName: string;
}

export interface SavedConnection
  extends ConnectionDraft {
  id: string;

  provider: "aws";

  createdAt: string;
}
