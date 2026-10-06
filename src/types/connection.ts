export interface ConnectionDraft {
  name: string;
  host: string;
  port: number;
  username: string;
  keyId: string;
  keyName: string;
  commandOnConnect: string;
}

export interface SavedConnection
  extends ConnectionDraft {
  id: string;

  provider: "aws";

  createdAt: string;
}
