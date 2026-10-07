import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { SavedConnection } from "../types/connection";
import { parseConnections, serializeConnections } from "../services/connectionBackup";

interface Props {
  connections: SavedConnection[];
  onImport: (connections: SavedConnection[]) => Promise<void>;
  onClose: () => void;
}

export default function ConnectionBackup({ connections, onImport, onClose }: Props) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function exportConnections() {
    setError("");
    setMessage("");
    const path = await save({ defaultPath: "cloudterm-connections.json", title: "Export CloudTerm connections", filters: [{ name: "JSON backup", extensions: ["json"] }] });
    if (!path) return;
    try {
      await invoke("write_connection_backup", { path, contents: serializeConnections(connections) });
      setMessage(`Exported ${connections.length} connection${connections.length === 1 ? "" : "s"}.`);
    } catch (err) { setError(String(err)); }
  }

  async function importConnections() {
    setError("");
    setMessage("");
    const path = await open({ multiple: false, directory: false, title: "Import CloudTerm connections", filters: [{ name: "JSON backup", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try {
      setLoading(true);
      const imported = parseConnections(await invoke<string>("read_connection_backup", { path }));
      if (!imported.length) throw new Error("The backup contains no valid connections.");
      await onImport(imported);
      setMessage(`Imported ${imported.length} connection${imported.length === 1 ? "" : "s"}. Private keys are never included; reselect a vault key if needed.`);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }

  return <div className="backup-page"><section className="backup-card">
    <div className="page-heading-row"><div><p className="eyebrow">PORTABILITY</p><h1>Connection backup</h1><p>Move connection metadata between machines without exporting private keys or vault contents.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
    <div className="backup-summary"><strong>{connections.length}</strong><span>saved connection{connections.length === 1 ? "" : "s"}</span></div>
    <div className="backup-actions"><button className="secondary-button" type="button" onClick={exportConnections} disabled={!connections.length}>Export JSON</button><button className="primary-button" type="button" onClick={importConnections} disabled={loading}>{loading ? "Importing…" : "Import JSON"}</button></div>
    {message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}
  </section></div>;
}
