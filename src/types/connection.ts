export interface ConnectionDraft {
  name: string;
  host: string;
  port: number;
  username: string;
  keyPath: string;
}

export interface SavedConnection
  extends ConnectionDraft {
  id: string;

  provider: "aws";

  createdAt: string;
}