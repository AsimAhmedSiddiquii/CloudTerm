import { useEffect, useState } from "react";

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

  async function refresh() {
    try {
      setLoading(true);
      setError("");
      setEntries(await invoke<RemoteEntry[]>("sftp_list", {
        sessionId,
        path,
      }));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => { });
  }, [sessionId, path]);

  async function download(entry: RemoteEntry) {
    const localPath = await save({
      defaultPath: entry.name,
      title: `Download ${entry.name}`,
    });
    if (!localPath) return;

    try {
      setError("");
      await invoke("sftp_download", {
        sessionId,
        remotePath: entry.path,
        localPath,
      });
    } catch (err) {
      setError(String(err));
    }
  }

  async function upload() {
    const localPath = await open({
      multiple: false,
      directory: false,
      title: "Upload file",
    });
    if (typeof localPath !== "string") return;

    const name = localPath.split(/[\\/]/).pop() ?? "upload";
    const remotePath = path === "." ? `./${name}` : `${path}/${name}`;

    try {
      setError("");
      await invoke("sftp_upload", {
        sessionId,
        localPath,
        remotePath,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  function goUp() {
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
        <button className="secondary-button" type="button" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button className="primary-button" type="button" onClick={upload}>Upload</button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="sftp-list">
        {entries.length === 0 && !loading ? (
          <div className="sftp-empty">This directory is empty.</div>
        ) : entries.map((entry) => (
          <div className="sftp-entry" key={entry.path}>
            <button
              className="sftp-entry-main"
              type="button"
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
