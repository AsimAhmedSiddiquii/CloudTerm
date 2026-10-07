import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function PortForwardPanel({ sessionId, onClose }: Props) {
  const [localHost, setLocalHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState(0);
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState(5432);
  const [boundAddress, setBoundAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLoopbackHost = ["localhost", "127.0.0.1", "::1"].includes(localHost.trim().toLowerCase());

  useEffect(() => () => {
    if (boundAddress) invoke("ssh_stop_local_forward", { sessionId }).catch(() => { });
  }, [boundAddress, sessionId]);

  async function start() {
    if (!localHost.trim()) {
      setError("Local host is required.");
      return;
    }
    if (!remoteHost.trim()) {
      setError("Remote host is required.");
      return;
    }
    if (!Number.isInteger(localPort) || localPort < 0 || localPort > 65535) {
      setError("Local port must be between 0 and 65535.");
      return;
    }
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
      setError("Remote port must be between 1 and 65535.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const address = await invoke<string>("ssh_start_local_forward", {
        sessionId, localHost, localPort, remoteHost, remotePort,
      });
      setBoundAddress(address);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    await invoke("ssh_stop_local_forward", { sessionId }).catch((err) => setError(String(err)));
    setBoundAddress("");
  }

  return <section className="forward-panel">
    <header className="sftp-header"><div><p className="eyebrow">SSH TUNNEL</p><h2>Local port forwarding</h2></div><button className="secondary-button" type="button" onClick={onClose}>Close</button></header>
    <p className="forward-help">Expose a service reachable from the SSH server on a local port.</p>
    <div className="forward-grid">
      <label>Local host<input value={localHost} onChange={(event) => setLocalHost(event.target.value)} disabled={Boolean(boundAddress)} /></label>
      <label>Local port<input type="number" min="0" max="65535" value={localPort} onChange={(event) => setLocalPort(Number(event.target.value))} disabled={Boolean(boundAddress)} /></label>
      <label>Remote host<input value={remoteHost} onChange={(event) => setRemoteHost(event.target.value)} disabled={Boolean(boundAddress)} /></label>
      <label>Remote port<input type="number" min="1" max="65535" value={remotePort} onChange={(event) => setRemotePort(Number(event.target.value))} disabled={Boolean(boundAddress)} /></label>
    </div>
    {localHost.trim() && !isLoopbackHost && (
      <div className="forward-warning" role="status">
        This forwards on <code>{localHost.trim()}</code>, which may expose the tunnel to other devices on the network.
      </div>
    )}
    {error && <div className="form-error">{error}</div>}
    {boundAddress && <div className="forward-active">Forwarding active on <code>{boundAddress}</code> → <code>{remoteHost}:{remotePort}</code></div>}
    <div className="forward-actions">
      {boundAddress ? <button className="secondary-button" type="button" onClick={stop}>Stop forwarding</button> : <button className="primary-button" type="button" onClick={start} disabled={loading}>{loading ? "Starting…" : "Start forwarding"}</button>}
    </div>
  </section>;
}
