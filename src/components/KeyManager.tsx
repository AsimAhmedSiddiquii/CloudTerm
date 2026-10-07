import { useCallback, useState } from "react";

import {
  deleteKey,
  listKeys,
  type ImportedKey,
} from "../services/keyVault";

interface Props {
  password: string;
  onPasswordChange: (password: string) => void;
  onKeysChange: (keys: ImportedKey[]) => void;
  keyUsageCounts?: Readonly<Record<string, number>>;
}

export default function KeyManager({
  password,
  onPasswordChange,
  onKeysChange,
  keyUsageCounts = {},
}: Props) {
  const [keys, setKeys] = useState<ImportedKey[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const refresh = useCallback(async () => {
    if (!password) {
      setKeys([]);
      onKeysChange([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const next = await listKeys(password);
      setKeys(next);
      onKeysChange(next);
    } catch (err) {
      setKeys([]);
      onKeysChange([]);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [onKeysChange, password]);

  async function remove(key: ImportedKey) {
    const usageCount = keyUsageCounts[key.id] ?? 0;
    const usageWarning = usageCount > 0
      ? ` It is referenced by ${usageCount} saved connection${usageCount === 1 ? "" : "s"}.`
      : "";
    if (!window.confirm(`Delete "${key.name}" from the encrypted vault?${usageWarning}`)) {
      return;
    }

    try {
      setError("");
      await deleteKey(password, key.id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  function handlePasswordChange(nextPassword: string) {
    setKeys([]);
    onKeysChange([]);
    onPasswordChange(nextPassword);
  }

  function lockVault() {
    setKeys([]);
    onKeysChange([]);
    onPasswordChange("");
    setError("");
  }

  return (
    <div className="keys-page">
      <div className="keys-heading">
        <div>
          <p className="eyebrow">SECURE STORAGE</p>
          <h1>SSH keys</h1>
          <p>Imported keys are encrypted locally and can be reused across connections.</p>
        </div>
        <div className="vault-badge">Encrypted vault</div>
      </div>

      <section className="vault-unlock-card">
        <label htmlFor="vault-password">Vault password</label>
        <div className="vault-unlock-row">
          <div className="password-input-wrap">
            <input
              id="vault-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => handlePasswordChange(event.target.value)}
              placeholder="Enter your vault password"
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide vault password" : "Show vault password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button className="secondary-button" type="button" onClick={refresh} disabled={loading || !password}>
            {loading ? "Unlocking…" : "Unlock vault"}
          </button>
          <button className="secondary-button" type="button" onClick={lockVault} disabled={loading || !password}>
            Lock vault
          </button>
        </div>
        <small>The password is kept in memory for this session only.</small>
      </section>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="key-list-card">
        <div className="key-list-header">
          <span>Imported keys</span>
          <span className="key-count">{keys.length}</span>
        </div>

        {keys.length === 0 ? (
          <div className="keys-empty">
            <div className="keys-empty-icon">⌁</div>
            <strong>No keys unlocked</strong>
            <p>Import a key from the connection form to see it here.</p>
          </div>
        ) : (
          <div className="key-list">
            {keys.map((key) => (
              <div className="key-row-item" key={key.id}>
                <div className="key-symbol">⌁</div>
                <div className="key-item-details">
                  <strong>{key.name}</strong>
                  <code>{key.id.slice(0, 12)}…</code>
                </div>
                <button
                  className="connection-delete visible"
                  type="button"
                  onClick={() => remove(key)}
                  title="Delete key"
                  aria-label={`Delete ${key.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
