import { useCallback, useEffect, useRef, useState } from "react";

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SftpPanel({ sessionId, onClose }: Props) {
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [transfer, setTransfer] = useState<"upload" | "download" | null>(null);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      setLoading(true);
      setError("");
      setSuccess("");
      const nextEntries = await invoke<RemoteEntry[]>("sftp_list", {
        sessionId,
        path,
      });
      if (generation !== refreshGeneration.current) return;
      setEntries(nextEntries);
    } catch (err) {
      if (generation !== refreshGeneration.current) return;
      setError(String(err));
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [path, sessionId]);

  useEffect(() => {
    // This effect intentionally refreshes the remote directory when its path changes.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => { });
    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  async function download(entry: RemoteEntry) {
    if (transfer) return;

    const localPath = await save({
      defaultPath: entry.name,
      title: `Download ${entry.name}`,
    });
    if (!localPath) return;

    try {
      setTransfer("download");
      setError("");
      setSuccess("");
      await invoke("sftp_download", {
        sessionId,
        remotePath: entry.path,
        localPath,
      });
      setSuccess(`Downloaded ${entry.name}.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setTransfer(null);
    }
  }

  async function upload() {
    if (transfer) return;

    const localPath = await open({
      multiple: false,
      directory: false,
      title: "Upload file",
    });
    if (typeof localPath !== "string") return;

    const name = localPath.split(/[\\/]/).pop() ?? "upload";
    const remotePath = path === "." ? `./${name}` : `${path}/${name}`;

    try {
      setTransfer("upload");
      setError("");
      setSuccess("");
      await invoke("sftp_upload", {
        sessionId,
        localPath,
        remotePath,
      });
      await refresh();
      setSuccess(`Uploaded ${name}.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setTransfer(null);
    }
  }

  function goUp() {
    if (transfer) return;
    if (path === "." || path === "/") return;
    const clean = path.replace(/\/$/, "");
    const parent = clean.slice(0, clean.lastIndexOf("/"));
    setPath(parent || "/");
  }

  return (
    <section className="sftp-panel">
      <header className="sftp-header">
        <div>
          <p className="eyebrow">REMOTE FILES</p>
          <h2>SFTP browser</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Close</button>
      </header>

      <div className="sftp-toolbar">
        <button className="secondary-button" type="button" onClick={goUp}>↑</button>
        <code>{path}</code>
        <button className="secondary-button" type="button" onClick={refresh} disabled={loading || Boolean(transfer)}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button className="primary-button" type="button" onClick={upload} disabled={loading || Boolean(transfer)}>
          {transfer === "upload" ? "Uploading…" : "Upload"}
        </button>
      </div>

      {transfer && (
        <div className="sftp-transfer-status" role="status">
          {transfer === "upload" ? "Uploading file…" : "Downloading file…"}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success" role="status">{success}</div>}

      <div className="sftp-list">
        {entries.length === 0 && !loading ? (
          <div className="sftp-empty">This directory is empty.</div>
        ) : entries.map((entry) => (
          <div className="sftp-entry" key={entry.path}>
            <button
              className="sftp-entry-main"
              type="button"
              disabled={Boolean(transfer)}
              onClick={() => entry.isDir ? setPath(entry.path) : download(entry)}
            >
              <span className={`sftp-entry-icon ${entry.isDir ? "folder" : "file"}`}>
                {entry.isDir ? "▰" : "▱"}
              </span>
              <span>{entry.name}</span>
            </button>
            <span className="sftp-entry-size">{entry.isDir ? "Folder" : formatSize(entry.size)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
