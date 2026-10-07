import { useState } from "react";
import type { Ec2Instance } from "../services/aws";
import { discoverInstances } from "../services/aws";

interface Props {
  onClose: () => void;
  onUseInstance: (instance: Ec2Instance) => void;
}

export default function AwsDiscovery({ onClose, onUseInstance }: Props) {
  const [profile, setProfile] = useState("");
  const [region, setRegion] = useState("");
  const [instances, setInstances] = useState<Ec2Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function discover() {
    setLoading(true);
    setError("");
    setInstances([]);
    try { setInstances(await discoverInstances(profile, region)); }
    catch (err) { setError(`Unable to discover EC2 instances: ${String(err)}`); }
    finally { setLoading(false); }
  }

  return (
    <div className="discovery-page">
      <div className="discovery-card">
        <div className="page-heading-row">
          <div><p className="eyebrow">AWS EC2</p><h1>Discover instances</h1><p>Use your local AWS profile and region to find instances you can connect to.</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close discovery">×</button>
        </div>
        <div className="discovery-controls">
          <label>AWS profile <span className="optional-label">Optional</span><input value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="default" disabled={loading} /></label>
          <label>Region <span className="optional-label">Optional</span><input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east-1" disabled={loading} /></label>
          <button className="primary-button discovery-button" type="button" onClick={discover} disabled={loading}>{loading ? "Discovering…" : "Discover"}</button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="instance-list">
          {!loading && !error && instances.length === 0 && <div className="empty-state">No instances loaded yet. Choose a profile or region, then run discovery.</div>}
          {instances.map((instance) => {
            const address = instance.publicIp ?? instance.publicDns ?? instance.privateIp;
            return <article className="instance-card" key={instance.id}>
              <div className="instance-card-main"><div className="instance-title-row"><h2>{instance.name}</h2><span className={`instance-state state-${instance.state}`}>{instance.state}</span></div><p>{instance.id} · {instance.region} · {instance.instanceType}</p><span className="instance-address">{address ?? "No reachable address"}</span></div>
              <button className="secondary-button" type="button" disabled={!address} onClick={() => onUseInstance(instance)}>Use for connection</button>
            </article>;
          })}
        </div>
      </div>
    </div>
  );
}
