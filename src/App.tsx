import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";

import "./App.css";

import Sidebar from "./components/Sidebar";
const AwsConnectionForm = lazy(() => import("./components/AwsConnectionForm"));
const TerminalView = lazy(() => import("./components/TerminalView"));
const KeyManager = lazy(() => import("./components/KeyManager"));
const SftpPanel = lazy(() => import("./components/SftpPanel"));
const AwsDiscovery = lazy(() => import("./components/AwsDiscovery"));
const SshConfigImport = lazy(() => import("./components/SshConfigImport"));
const PortForwardPanel = lazy(() => import("./components/PortForwardPanel"));
const ConnectionBackup = lazy(() => import("./components/ConnectionBackup"));
import type {
  HostKeyPrompt,
  KeyPassphrasePrompt,
} from "./components/TerminalView";

import { invoke } from "@tauri-apps/api/core";

import type {
  ConnectionStatus,
} from "./components/Sidebar";

import {
  deleteConnection,
  getConnections,
  saveConnection,
  saveConnections,
} from "./services/connectionStore";
import { listKeys } from "./services/keyVault";
import type { ImportedKey } from "./services/keyVault";
import type { Ec2Instance } from "./services/aws";
import type { SshConfigEntry } from "./services/sshConfig";
import type { SavedConnection as BackupConnection } from "./types/connection";

import type {
  ConnectionDraft,
  SavedConnection,
} from "./types/connection";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function App() {
  const [
    connections,
    setConnections,
  ] = useState<SavedConnection[]>([]);

  const [
    activeConnection,
    setActiveConnection,
  ] =
    useState<SavedConnection | null>(
      null
    );

  const [
    showNewConnection,
    setShowNewConnection,
  ] = useState(true);

  async function refreshConnections() {
    try {
      const saved = await getConnections();
      setConnections(saved);
      setStorageError(null);
    } catch (error) {
      setStorageError(errorMessage(error, "Unable to load saved connections."));
    }
  }

  const [
    editingConnection,
    setEditingConnection,
  ] =
    useState<SavedConnection | null>(
      null
    );

  const [
    connectionStatus,
    setConnectionStatus,
  ] =
    useState<ConnectionStatus>(
      "disconnected"
    );

  const [hostKeyPrompt, setHostKeyPrompt] =
    useState<HostKeyPrompt | null>(null);

  const [keyPassphrasePrompt, setKeyPassphrasePrompt] =
    useState<KeyPassphrasePrompt | null>(null);

  const [keyPassphrase, setKeyPassphrase] =
    useState("");

  const [vaultPassword, setVaultPassword] =
    useState("");

  const [vaultKeys, setVaultKeys] =
    useState<ImportedKey[]>([]);

  const [showKeys, setShowKeys] =
    useState(false);

  const [showSftp, setShowSftp] =
    useState(false);
  const [showForward, setShowForward] = useState(false);

  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showSshConfig, setShowSshConfig] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [connectionPrefill, setConnectionPrefill] = useState<Partial<ConnectionDraft> | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const keyUsageCounts = connections.reduce<Record<string, number>>((counts, connection) => {
    const usedKeyIds = new Set([connection.keyId]);
    if (connection.bastion) {
      usedKeyIds.add(connection.bastion.keyId);
    }
    for (const keyId of usedKeyIds) {
      counts[keyId] = (counts[keyId] ?? 0) + 1;
    }
    return counts;
  }, {});

  const [splitMode, setSplitMode] =
    useState(false);

  const [splitConnections, setSplitConnections] =
    useState<SavedConnection[]>([]);

  const [splitStatuses, setSplitStatuses] =
    useState<Record<string, ConnectionStatus>>({});

  // Intentional mount-time synchronization with the persistent store.
  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    refreshConnections().catch(
      console.error
    );
  }, []);

  async function handleSave(
    draft: ConnectionDraft,
    existingId?: string
  ) {
    try {
      let connection: SavedConnection;

      if (existingId) {
        const old = connections.find((item) => item.id === existingId);

        connection = {
          ...draft,
          id: existingId,
          provider: "aws",
          createdAt: old?.createdAt ?? new Date().toISOString(),
        };
      } else {
        connection = {
          ...draft,
          id: crypto.randomUUID(),
          provider: "aws",
          createdAt: new Date().toISOString(),
        };
      }

      await saveConnection(connection);
      await refreshConnections();
      setEditingConnection(null);
    } catch (error) {
      setStorageError(errorMessage(error, "Unable to save this connection."));
    }
  }

  function handleConnect(
    draft: ConnectionDraft
  ) {
    setActiveConnection({
      ...draft,

      id: `temporary-${Date.now()}`,

      provider: "aws",

      createdAt:
        new Date().toISOString(),
    });
    setSplitConnections([]);
    setSplitMode(false);

    setShowNewConnection(false);
    setShowKeys(false);
    setShowSftp(false);
    setShowForward(false);
  }

  function handleSavedSelect(
    connection: SavedConnection
  ) {
    if (splitMode && activeConnection) {
      if (
        connection.id !== activeConnection.id &&
        !splitConnections.some((item) => item.id === connection.id)
      ) {
        setSplitConnections((current) =>
          [...current, connection].slice(0, 3)
        );
      }
      return;
    }

    setEditingConnection(null);
    setShowKeys(false);
    setShowSftp(false);
    setShowForward(false);

    setConnectionStatus(
      "connecting"
    );

    setActiveConnection(
      connection
    );

    setShowNewConnection(false);
  }

  function handleEdit(
    connection: SavedConnection
  ) {
    setActiveConnection(null);
    setSplitConnections([]);
    setSplitMode(false);

    setEditingConnection(
      connection
    );

    setShowNewConnection(true);
    setShowKeys(false);
    setShowSftp(false);
    setShowForward(false);

    setConnectionStatus(
      "disconnected"
    );
  }

  async function handleDelete(
    id: string
  ) {
    const connection =
      connections.find(
        (item) => item.id === id
      );

    if (!connection) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${connection.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteConnection(id);

      if (activeConnection?.id === id) {
        setActiveConnection(null);
        setConnectionStatus("disconnected");
      }

      setSplitConnections((current) => current.filter((item) => item.id !== id));

      if (editingConnection?.id === id) {
        setEditingConnection(null);
      }

      await refreshConnections();
    } catch (error) {
      setStorageError(errorMessage(error, "Unable to delete this connection."));
    }
  }

  function openNewConnection() {
    setActiveConnection(null);
    setEditingConnection(null);

    setConnectionStatus(
      "disconnected"
    );

    setShowNewConnection(true);
    setShowKeys(false);
    setShowSftp(false);
    setShowDiscovery(false);
    setShowSshConfig(false);
    setShowBackup(false);
    setConnectionPrefill(null);
    setSplitConnections([]);
    setSplitMode(false);
  }

  async function refreshVaultKeys(password: string) {
    if (!password.trim()) {
      setVaultKeys([]);
      return;
    }

    try {
      setVaultKeys(await listKeys(password));
    } catch {
      setVaultKeys([]);
    }
  }

  function handleVaultPasswordChange(password: string) {
    setVaultPassword(password);
    setVaultKeys([]);
  }

  async function unlockVault(password: string) {
    await refreshVaultKeys(password);
  }

  function openKeys() {
    setActiveConnection(null);
    setEditingConnection(null);
    setSplitConnections([]);
    setSplitMode(false);
    setShowNewConnection(false);
    setShowKeys(true);
    setShowSftp(false);
    setShowDiscovery(false);
    setShowSshConfig(false);
    setShowBackup(false);
  }

  function openDiscovery() {
    setActiveConnection(null);
    setEditingConnection(null);
    setSplitConnections([]);
    setSplitMode(false);
    setShowNewConnection(false);
    setShowKeys(false);
    setShowSftp(false);
    setShowDiscovery(true);
    setShowSshConfig(false);
    setShowBackup(false);
    setConnectionPrefill(null);
  }

  function openSshConfig() {
    setActiveConnection(null);
    setEditingConnection(null);
    setSplitConnections([]);
    setSplitMode(false);
    setShowNewConnection(false);
    setShowKeys(false);
    setShowSftp(false);
    setShowDiscovery(false);
    setShowSshConfig(true);
    setConnectionPrefill(null);
  }

  function useSshConfigEntry(entry: SshConfigEntry) {
    setConnectionPrefill({
      name: entry.alias,
      host: entry.host,
      port: entry.port,
      username: entry.username ?? "ubuntu",
      keyId: "",
      keyName: entry.identityFiles[0] ?? "",
      commandOnConnect: "",
    });
    setShowSshConfig(false);
    setShowNewConnection(true);
  }

  function openBackup() {
    setActiveConnection(null);
    setEditingConnection(null);
    setSplitConnections([]);
    setSplitMode(false);
    setShowNewConnection(false);
    setShowKeys(false);
    setShowSftp(false);
    setShowForward(false);
    setShowDiscovery(false);
    setShowSshConfig(false);
    setShowBackup(true);
  }

  function connectionFingerprint(connection: BackupConnection) {
    const bastion = connection.bastion;
    return [
      connection.host.trim().toLowerCase(),
      connection.port,
      connection.username.trim().toLowerCase(),
      connection.keyId,
      bastion?.host.trim().toLowerCase() ?? "",
      bastion?.port ?? "",
      bastion?.username.trim().toLowerCase() ?? "",
      bastion?.keyId ?? "",
    ].join("\u001f");
  }

  async function importConnections(imported: BackupConnection[]): Promise<number> {
    try {
      const fingerprints = new Set(connections.map(connectionFingerprint));
      const unique = imported.filter((connection) => {
        const fingerprint = connectionFingerprint(connection);
        if (fingerprints.has(fingerprint)) return false;
        fingerprints.add(fingerprint);
        return true;
      });
      if (!unique.length) return 0;
      await saveConnections(unique);
      await refreshConnections();
      return unique.length;
    } catch (error) {
      setStorageError(errorMessage(error, "Unable to import the selected connections."));
      throw error;
    }
  }

  function useDiscoveredInstance(instance: Ec2Instance) {
    const host = instance.publicIp ?? instance.publicDns ?? instance.privateIp ?? "";
    setConnectionPrefill({
      name: instance.name === instance.id ? `EC2 ${instance.id}` : instance.name,
      host,
      port: 22,
      username: "ubuntu",
      keyId: "",
      keyName: "",
      commandOnConnect: "",
    });
    setShowDiscovery(false);
    setShowNewConnection(true);
  }

  function toggleSplitMode() {
    if (!activeConnection) {
      return;
    }

    if (splitMode) {
      setSplitMode(false);
      setSplitConnections([]);
      return;
    }

    const firstOther = connections.find(
      (connection) => connection.id !== activeConnection.id
    );

    setSplitMode(true);
    if (firstOther) {
      setSplitConnections([firstOther]);
    }
  }

  function setSplitStatus(
    id: string,
    status: ConnectionStatus
  ) {
    setSplitStatuses((current) => ({
      ...current,
      [id]: status,
    }));
  }

  return (
    <div className="app-shell">
      <Sidebar
        connections={connections}
        activeId={activeConnection?.id}
        status={connectionStatus}
        onSelect={handleSavedSelect}
        onEdit={handleEdit}
        onAdd={openNewConnection}
        onDelete={handleDelete}
        onKeys={openKeys}
        onDiscover={openDiscovery}
        onImportConfig={openSshConfig}
        onBackup={openBackup}
      />

      <main className="main-content">
        {storageError && (
          <div className="persistence-notice" role="alert">
            <span>{storageError}</span>
            <button
              type="button"
              onClick={() => setStorageError(null)}
              aria-label="Dismiss storage error"
            >
              Dismiss
            </button>
          </div>
        )}

        <Suspense fallback={<div className="panel-loading" role="status">Loading workspace…</div>}>
          {showBackup ? (
            <ConnectionBackup connections={connections} onImport={importConnections} onClose={() => setShowBackup(false)} />
          ) : showSshConfig ? (
            <SshConfigImport onClose={() => setShowSshConfig(false)} onUseEntry={useSshConfigEntry} />
          ) : showDiscovery ? (
            <AwsDiscovery onClose={() => setShowDiscovery(false)} onUseInstance={useDiscoveredInstance} />
          ) : showKeys ? (
            <KeyManager
              password={vaultPassword}
              onPasswordChange={handleVaultPasswordChange}
              onKeysChange={setVaultKeys}
              keyUsageCounts={keyUsageCounts}
            />
          ) : activeConnection ? (
          <div className={`terminal-workspace ${splitMode ? "is-split" : ""}`}>
            <TerminalView
              sessionId={`primary-${activeConnection.id}`}
              host={activeConnection.host}
              port={activeConnection.port}
              username={activeConnection.username}
              keyId={activeConnection.keyId}
              vaultPassword={vaultPassword}
              commandOnConnect={activeConnection.commandOnConnect}
              bastion={activeConnection.bastion}
              connectTimeoutSeconds={activeConnection.connectTimeoutSeconds}
              keepAliveSeconds={activeConnection.keepAliveSeconds}
              status={connectionStatus}
              onHostKeyPrompt={setHostKeyPrompt}
              onKeyPassphrasePrompt={(prompt) => {
                setKeyPassphrase("");
                setKeyPassphrasePrompt(prompt);
              }}
              onSplitToggle={toggleSplitMode}
              onSftpOpen={() => setShowSftp(true)}
              onForwardOpen={() => setShowForward(true)}
              splitMode={splitMode}
              onConnected={() => setConnectionStatus("connected")}
              onDisconnected={() => setConnectionStatus("disconnected")}
              onFailed={() => setConnectionStatus("failed")}
              onRetry={() => setConnectionStatus("connecting")}
              onBack={() => {
                setActiveConnection(null);
                setSplitConnections([]);
                setSplitMode(false);
                setConnectionStatus("disconnected");
                setShowNewConnection(false);
                setShowSftp(false);
                setShowForward(false);
              }}
            />

            {splitMode && splitConnections.map((connection) => (
              <TerminalView
                key={connection.id}
                sessionId={`split-${connection.id}`}
                host={connection.host}
                port={connection.port}
                username={connection.username}
                keyId={connection.keyId}
                vaultPassword={vaultPassword}
                commandOnConnect={connection.commandOnConnect}
                bastion={connection.bastion}
                connectTimeoutSeconds={connection.connectTimeoutSeconds}
                keepAliveSeconds={connection.keepAliveSeconds}
                status={splitStatuses[connection.id] ?? "connecting"}
                onHostKeyPrompt={setHostKeyPrompt}
                onKeyPassphrasePrompt={(prompt) => {
                  setKeyPassphrase("");
                  setKeyPassphrasePrompt(prompt);
                }}
                onConnected={() => setSplitStatus(connection.id, "connected")}
                onDisconnected={() => setSplitStatus(connection.id, "disconnected")}
                onFailed={() => setSplitStatus(connection.id, "failed")}
                onRetry={() => setSplitStatus(connection.id, "connecting")}
                onBack={() => setSplitConnections((current) =>
                  current.filter((item) => item.id !== connection.id)
                )}
              />
            ))}

            {splitMode && splitConnections.length < 3 && (
              <button
                className="add-terminal-pane"
                type="button"
                onClick={() => {
                  const next = connections.find((item) =>
                    item.id !== activeConnection.id &&
                    !splitConnections.some((open) => open.id === item.id)
                  );
                  if (next) {
                    setSplitConnections((current) => [...current, next].slice(0, 3));
                  }
                }}
              >
                + Add terminal pane
              </button>
            )}

            {showSftp && (
              <SftpPanel
                sessionId={`primary-${activeConnection.id}`}
                onClose={() => setShowSftp(false)}
              />
            )}
            {showForward && (
              <PortForwardPanel sessionId={`primary-${activeConnection.id}`} onClose={() => setShowForward(false)} />
            )}
          </div>
        ) : showNewConnection ? (
          <AwsConnectionForm
            key={`${editingConnection?.id ?? "new"}:${connectionPrefill?.host ?? ""}:${connectionPrefill?.name ?? ""}`}
            initialConnection={
              editingConnection
            }
            prefill={connectionPrefill}
            onSave={handleSave}
            onConnect={
              handleConnect
            }
            onVaultPasswordChange={handleVaultPasswordChange}
            onVaultUnlock={unlockVault}
            availableKeys={vaultKeys}
            onKeyImported={(key) => {
              setVaultKeys((current) => [...current, key]);
            }}
          />
        ) : (
          <div className="welcome-page">
            <h1>CloudTerm</h1>

            <p>
              Select a connection
              from the sidebar or
              create a new one.
            </p>

            <button
              onClick={
                openNewConnection
              }
            >
              + New Connection
            </button>
          </div>
          )}
        </Suspense>
      </main>

      {hostKeyPrompt && (
        <div className="modal-backdrop">
          <section className="trust-dialog" role="dialog" aria-modal="true">
            <div className="trust-dialog-icon">!</div>
            <p className="eyebrow">FIRST CONNECTION</p>
            <h2>Verify this server</h2>
            <p>
              CloudTerm cannot verify this server yet. Continue only if this fingerprint matches the server you expect.
            </p>
            <div className="fingerprint-card">
              <span>{hostKeyPrompt.host}:{hostKeyPrompt.port}</span>
              <code>{hostKeyPrompt.fingerprint}</code>
            </div>
            <div className="trust-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  invoke("ssh_host_key_decision", {
                    sessionId: hostKeyPrompt.sessionId,
                    accepted: false,
                  }).catch(console.error);
                  setHostKeyPrompt(null);
                }}
              >
                Reject
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  invoke("ssh_host_key_decision", {
                    sessionId: hostKeyPrompt.sessionId,
                    accepted: true,
                  }).catch(console.error);
                  setHostKeyPrompt(null);
                }}
              >
                Trust & connect
              </button>
            </div>
          </section>
        </div>
      )}

      {keyPassphrasePrompt && (
        <div className="modal-backdrop">
          <section className="trust-dialog passphrase-dialog" role="dialog" aria-modal="true">
            <div className="trust-dialog-icon key-icon">⌑</div>
            <p className="eyebrow">ENCRYPTED SSH KEY</p>
            <h2>Unlock private key</h2>
            <p>
              This key is protected with a passphrase. It will be used only for this connection and will not be saved.
            </p>
            <input
              autoFocus
              type="password"
              value={keyPassphrase}
              onChange={(event) => setKeyPassphrase(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  invoke("ssh_key_passphrase", {
                    sessionId: keyPassphrasePrompt.sessionId,
                    passphrase: keyPassphrase,
                  }).catch(console.error);
                  setKeyPassphrasePrompt(null);
                }
              }}
              placeholder="SSH key passphrase"
            />
            <div className="trust-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  invoke("ssh_key_passphrase", {
                    sessionId: keyPassphrasePrompt.sessionId,
                    passphrase: "",
                  }).catch(console.error);
                  setKeyPassphrasePrompt(null);
                }}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  invoke("ssh_key_passphrase", {
                    sessionId: keyPassphrasePrompt.sessionId,
                    passphrase: keyPassphrase,
                  }).catch(console.error);
                  setKeyPassphrasePrompt(null);
                }}
              >
                Unlock key
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
