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
import { isVaultInitialized, listKeys } from "./services/keyVault";
import type { ImportedKey } from "./services/keyVault";
import type { Ec2Instance } from "./services/aws";
import type { SshConfigEntry } from "./services/sshConfig";
import type { SavedConnection as BackupConnection } from "./types/connection";
import {
  findUpdate,
  installUpdate,
  isUpdaterConfigured,
} from "./services/updater";

import type {
  ConnectionDraft,
  SavedConnection,
} from "./types/connection";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

type PendingVaultConnection = {
  connection: SavedConnection;
  mode: "primary" | "split";
};

function App() {
  const [
    connections,
    setConnections,
  ] = useState<SavedConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);

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
    } finally {
      setConnectionsLoaded(true);
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
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  const [vaultKeys, setVaultKeys] =
    useState<ImportedKey[]>([]);
  const [pendingVaultConnection, setPendingVaultConnection] =
    useState<PendingVaultConnection | null>(null);
  const [vaultUnlockPassword, setVaultUnlockPassword] = useState("");
  const [vaultUnlockError, setVaultUnlockError] = useState("");
  const [vaultUnlockLoading, setVaultUnlockLoading] = useState(false);

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
  const [updaterConfigured, setUpdaterConfigured] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [showVaultSetup, setShowVaultSetup] = useState(false);
  const [vaultSetupPassword, setVaultSetupPassword] = useState("");
  const [vaultSetupConfirmation, setVaultSetupConfirmation] = useState("");
  const [vaultSetupError, setVaultSetupError] = useState("");
  const [vaultSetupLoading, setVaultSetupLoading] = useState(false);

  const keyUsageCounts = connections.reduce<Map<string, number>>((counts, connection) => {
    const usedKeyIds = new Set([connection.keyId]);
    if (connection.bastion) {
      usedKeyIds.add(connection.bastion.keyId);
    }
    for (const keyId of usedKeyIds) {
      counts.set(keyId, (counts.get(keyId) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>());

  const [splitMode, setSplitMode] =
    useState(false);

  const [splitConnections, setSplitConnections] =
    useState<SavedConnection[]>([]);

  const [splitStatuses, setSplitStatuses] =
    useState<Record<string, ConnectionStatus>>({});
  const [showSplitPicker, setShowSplitPicker] = useState(false);

  const availableSplitConnections = activeConnection
    ? connections.filter((connection) =>
        connection.id !== activeConnection.id &&
        !(
          connection.host === activeConnection.host &&
          connection.port === activeConnection.port &&
          connection.username === activeConnection.username
        ) &&
        !splitConnections.some((open) => open.id === connection.id)
      )
    : [];

  // Intentional mount-time synchronization with the persistent store.
  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    refreshConnections().catch(
      console.error
    );
  }, []);

  useEffect(() => {
    if (!connectionsLoaded || connections.length > 0) {
      return;
    }

    isVaultInitialized()
      .then((initialized) => {
        if (!initialized) setShowVaultSetup(true);
      })
      .catch((error) => setStorageError(errorMessage(error, "Unable to inspect the encrypted vault.")));
  }, [connections.length, connectionsLoaded]);

  useEffect(() => {
    isUpdaterConfigured()
      .then(setUpdaterConfigured)
      .catch(() => setUpdaterConfigured(false));
  }, []);

  async function handleCheckForUpdates() {
    setUpdateStatus("Checking…");
    try {
      const update = await findUpdate();
      if (!update) {
        setUpdateStatus("Up to date");
        return;
      }

      const details = update.notes?.trim()
        ? `\n\n${update.notes.trim()}`
        : "";
      if (!window.confirm(`CloudTerm ${update.version} is available.${details}\n\nInstall it now?`)) {
        setUpdateStatus(null);
        return;
      }

      setUpdateStatus("Installing…");
      await installUpdate();
    } catch (error) {
      setUpdateStatus(errorMessage(error, "Unable to check for updates."));
    }
  }

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
      return connection;
    } catch (error) {
      const message = errorMessage(error, "Unable to save this connection.");
      setStorageError(message);
      throw new Error(message);
    }
  }

  function handleConnect(
    draft: ConnectionDraft,
    savedId?: string
  ) {
    setActiveConnection({
      ...draft,

      id: savedId ?? editingConnection?.id ?? `temporary-${Date.now()}`,

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
      openInSplit(connection);
      return;
    }

    if (connectionUsesVault(connection) && !vaultUnlocked) {
      requestVaultUnlock(connection, "primary");
      return;
    }

    activatePrimaryConnection(connection);
  }

  function activatePrimaryConnection(connection: SavedConnection) {

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
      const keys = await listKeys(password);
      setVaultKeys(keys);
      return keys;
    } catch (error) {
      setVaultKeys([]);
      throw error;
    }
  }

  function handleVaultPasswordChange(password: string) {
    setVaultPassword(password);
    setVaultKeys([]);
    setVaultUnlocked(false);
  }

  async function unlockVault(password: string) {
    await refreshVaultKeys(password);
    setVaultUnlocked(true);
  }

  async function createVaultPassword() {
    if (vaultSetupPassword.trim().length < 8) {
      setVaultSetupError("Use at least 8 characters for the vault password.");
      return;
    }
    if (vaultSetupPassword !== vaultSetupConfirmation) {
      setVaultSetupError("The vault passwords do not match.");
      return;
    }

    try {
      setVaultSetupLoading(true);
      setVaultSetupError("");
      const keys = await listKeys(vaultSetupPassword);
      setVaultPassword(vaultSetupPassword);
      setVaultKeys(keys);
      setVaultUnlocked(true);
      setVaultSetupPassword("");
      setVaultSetupConfirmation("");
      setShowVaultSetup(false);
    } catch (error) {
      setVaultSetupError(errorMessage(error, "Unable to create the encrypted vault."));
    } finally {
      setVaultSetupLoading(false);
    }
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
      setShowSplitPicker(false);
      return;
    }

    setShowSplitPicker(true);
  }

  function openInSplit(connection: SavedConnection) {
    if (!activeConnection || splitConnections.length >= 3) {
      return;
    }

    const isCurrentConnection =
      connection.id === activeConnection.id ||
      (
        connection.host === activeConnection.host &&
        connection.port === activeConnection.port &&
        connection.username === activeConnection.username
      );
    if (isCurrentConnection || splitConnections.some((open) => open.id === connection.id)) {
      return;
    }

    if (connectionUsesVault(connection) && !vaultUnlocked) {
      requestVaultUnlock(connection, "split");
      return;
    }

    addSplitConnection(connection);
  }

  function addSplitConnection(connection: SavedConnection) {
    if (!activeConnection || splitConnections.length >= 3) {
      return;
    }

    setSplitConnections((current) => [...current, connection].slice(0, 3));
    setSplitMode(true);
    setShowSplitPicker(false);
  }

  function connectionUsesVault(connection: SavedConnection) {
    return Boolean(connection.keyId || connection.bastion?.keyId);
  }

  function requestVaultUnlock(connection: SavedConnection, mode: PendingVaultConnection["mode"]) {
    setPendingVaultConnection({ connection, mode });
    setVaultUnlockPassword("");
    setVaultUnlockError("");
    setShowSplitPicker(false);
  }

  async function unlockPendingConnection() {
    if (!pendingVaultConnection || !vaultUnlockPassword.trim()) {
      setVaultUnlockError("Enter your vault password.");
      return;
    }

    try {
      setVaultUnlockLoading(true);
      setVaultUnlockError("");
      const keys = await listKeys(vaultUnlockPassword);
      const pending = pendingVaultConnection;
      setVaultPassword(vaultUnlockPassword);
      setVaultKeys(keys);
      setVaultUnlocked(true);
      setPendingVaultConnection(null);
      setVaultUnlockPassword("");

      if (pending.mode === "split") {
        addSplitConnection(pending.connection);
      } else {
        activatePrimaryConnection(pending.connection);
      }
    } catch (error) {
      setVaultUnlockError(errorMessage(error, "Unable to unlock the encrypted vault."));
    } finally {
      setVaultUnlockLoading(false);
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
        updaterConfigured={updaterConfigured}
        updateStatus={updateStatus}
        onCheckForUpdates={handleCheckForUpdates}
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
              onUnlockChange={setVaultUnlocked}
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
                onClick={() => setShowSplitPicker(true)}
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
              setVaultUnlocked(true);
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

      {pendingVaultConnection && (
        <div className="modal-backdrop">
          <section className="trust-dialog passphrase-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-unlock-title">
            <div className="trust-dialog-icon key-icon">⌑</div>
            <p className="eyebrow">ENCRYPTED SSH KEY</p>
            <h2 id="vault-unlock-title">Unlock vault to connect</h2>
            <p>
              Enter your vault password to use the key saved for {pendingVaultConnection.connection.name}. The password will be remembered only for this app session.
            </p>
            <input
              autoFocus
              type="password"
              value={vaultUnlockPassword}
              onChange={(event) => setVaultUnlockPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void unlockPendingConnection();
              }}
              placeholder="Vault password"
            />
            {vaultUnlockError && <div className="form-error" role="alert">{vaultUnlockError}</div>}
            <div className="trust-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setPendingVaultConnection(null);
                  setVaultUnlockPassword("");
                  setVaultUnlockError("");
                }}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void unlockPendingConnection()}
                disabled={vaultUnlockLoading || !vaultUnlockPassword.trim()}
              >
                {vaultUnlockLoading ? "Unlocking…" : "Unlock & connect"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showSplitPicker && activeConnection && !pendingVaultConnection && (
        <div className="modal-backdrop">
          <section className="trust-dialog split-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="split-picker-title">
            <p className="eyebrow">SPLIT VIEW</p>
            <h2 id="split-picker-title">Choose another connection</h2>
            <p>Select a different saved connection to open beside {activeConnection.name}.</p>
            <div className="split-picker-list">
              {availableSplitConnections.length === 0 ? (
                <div className="split-picker-empty">No other saved connections are available.</div>
              ) : availableSplitConnections.map((connection) => (
                <button
                  className="split-picker-option"
                  type="button"
                  key={connection.id}
                  onClick={() => openInSplit(connection)}
                >
                  <strong>{connection.name}</strong>
                  <span>{connection.username}@{connection.host}:{connection.port}</span>
                </button>
              ))}
            </div>
            <div className="trust-actions">
              <button className="secondary-button" type="button" onClick={() => setShowSplitPicker(false)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {showVaultSetup && (
        <div className="modal-backdrop">
          <section className="trust-dialog passphrase-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-setup-title">
            <div className="trust-dialog-icon key-icon">⌑</div>
            <p className="eyebrow">FIRST CONNECTION</p>
            <h2 id="vault-setup-title">Create your vault password</h2>
            <p>
              CloudTerm encrypts imported SSH keys locally. Set a password to protect your key vault; it is kept only in memory during this session.
            </p>
            <input
              autoFocus
              type="password"
              value={vaultSetupPassword}
              onChange={(event) => setVaultSetupPassword(event.target.value)}
              placeholder="Create vault password"
            />
            <input
              type="password"
              value={vaultSetupConfirmation}
              onChange={(event) => setVaultSetupConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createVaultPassword();
              }}
              placeholder="Confirm vault password"
            />
            {vaultSetupError && <div className="form-error" role="alert">{vaultSetupError}</div>}
            <div className="trust-actions">
              <button className="primary-button" type="button" onClick={() => void createVaultPassword()} disabled={vaultSetupLoading}>
                {vaultSetupLoading ? "Creating vault…" : "Set password"}
              </button>
            </div>
          </section>
        </div>
      )}

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
