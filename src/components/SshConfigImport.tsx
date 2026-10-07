import { useEffect, useRef, useState } from "react";
import type { SshConfigEntry } from "../services/sshConfig";
import { listSshConfigEntries } from "../services/sshConfig";

interface Props {
  onClose: () => void;
  onUseEntry: (entry: SshConfigEntry) => void;
}

export default function SshConfigImport({ onClose, onUseEntry }: Props) {
  const [entries, setEntries] = useState<SshConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  async function refresh() {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const nextEntries = await listSshConfigEntries();
      if (generation === requestGeneration.current) setEntries(nextEntries);
    } catch (err) {
      if (generation === requestGeneration.current) setError(`Unable to read SSH config: ${String(err)}`);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    // Intentional initial synchronization with the user's local SSH config.
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => { });
    return () => {
      requestGeneration.current += 1;
    };
  }, []);

  return (
    <div className="discovery-page">
      <div className="discovery-card">
        <div className="page-heading-row">
          <div><p className="eyebrow">SSH CONFIG</p><h1>Import hosts</h1><p>Choose a host from your local ~/.ssh/config. Existing saved connections stay unchanged.</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close SSH config">×</button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {loading ? <div className="empty-state">Reading SSH config…</div> : entries.length === 0 ? <div className="empty-state">No usable host entries found in ~/.ssh/config.</div> : (
          <div className="instance-list">
            {entries.map((entry) => <article className="instance-card" key={`${entry.alias}-${entry.host}-${entry.port}`}>
              <div className="instance-card-main"><div className="instance-title-row"><h2>{entry.alias}</h2><span className="instance-state">SSH</span></div><p>{entry.username ? `${entry.username}@` : ""}{entry.host}:{entry.port}</p><span className="instance-address">{entry.identityFiles[0] ?? "No IdentityFile configured"}</span></div>
              <button className="secondary-button" type="button" onClick={() => onUseEntry(entry)}>Use for connection</button>
            </article>)}
          </div>
        )}
        <div className="discovery-actions"><button className="secondary-button" type="button" onClick={refresh} disabled={loading}>Refresh</button></div>
      </div>
    </div>
  );
}
