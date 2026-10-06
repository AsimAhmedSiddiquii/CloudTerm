import {
  useEffect,
  useState,
} from "react";

import "./App.css";

import Sidebar from "./components/Sidebar";
import AwsConnectionForm from "./components/AwsConnectionForm";
import TerminalView from "./components/TerminalView";
import type { HostKeyPrompt } from "./components/TerminalView";

import { invoke } from "@tauri-apps/api/core";

import type {
  ConnectionStatus,
} from "./components/Sidebar";

import {
  deleteConnection,
  getConnections,
  saveConnection,
} from "./services/connectionStore";

import type {
  ConnectionDraft,
  SavedConnection,
} from "./types/connection";

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
    const saved =
      await getConnections();

    setConnections(saved);
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

  const [vaultPassword, setVaultPassword] =
    useState("");

  const [splitMode, setSplitMode] =
    useState(false);

  const [splitConnections, setSplitConnections] =
    useState<SavedConnection[]>([]);

  const [splitStatuses, setSplitStatuses] =
    useState<Record<string, ConnectionStatus>>({});

  useEffect(() => {
    refreshConnections().catch(
      console.error
    );
  }, []);

  async function handleSave(
    draft: ConnectionDraft,
    existingId?: string
  ) {
    let connection: SavedConnection;

    if (existingId) {
      const old =
        connections.find(
          (item) =>
            item.id === existingId
        );

      connection = {
        ...draft,

        id: existingId,

        provider: "aws",

        createdAt:
          old?.createdAt ??
          new Date().toISOString(),
      };
    } else {
      connection = {
        ...draft,

        id: crypto.randomUUID(),

        provider: "aws",

        createdAt:
          new Date().toISOString(),
      };
    }

    await saveConnection(connection);

    await refreshConnections();

    setEditingConnection(null);
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

    await deleteConnection(id);

    if (
      activeConnection?.id === id
    ) {
      setActiveConnection(null);

      setConnectionStatus(
        "disconnected"
      );
    }

    setSplitConnections((current) =>
      current.filter((item) => item.id !== id)
    );

    if (
      editingConnection?.id === id
    ) {
      setEditingConnection(null);
    }

    await refreshConnections();
  }

  function openNewConnection() {
    setActiveConnection(null);
    setEditingConnection(null);

    setConnectionStatus(
      "disconnected"
    );

    setShowNewConnection(true);
    setSplitConnections([]);
    setSplitMode(false);
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
      />

      <main className="main-content">
        {activeConnection ? (
          <div className={`terminal-workspace ${splitMode ? "is-split" : ""}`}>
            <TerminalView
              sessionId={`primary-${activeConnection.id}`}
              host={activeConnection.host}
              port={activeConnection.port}
              username={activeConnection.username}
              keyId={activeConnection.keyId}
              vaultPassword={vaultPassword}
              status={connectionStatus}
              onHostKeyPrompt={setHostKeyPrompt}
              onSplitToggle={toggleSplitMode}
              splitMode={splitMode}
              onConnected={() => setConnectionStatus("connected")}
              onDisconnected={() => setConnectionStatus("disconnected")}
              onBack={() => {
                setActiveConnection(null);
                setSplitConnections([]);
                setSplitMode(false);
                setConnectionStatus("disconnected");
                setShowNewConnection(false);
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
                status={splitStatuses[connection.id] ?? "connecting"}
                onHostKeyPrompt={setHostKeyPrompt}
                onConnected={() => setSplitStatus(connection.id, "connected")}
                onDisconnected={() => setSplitStatus(connection.id, "disconnected")}
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
          </div>
        ) : showNewConnection ? (
          <AwsConnectionForm
            initialConnection={
              editingConnection
            }
            onSave={handleSave}
            onConnect={
              handleConnect
            }
            onVaultPasswordChange={setVaultPassword}
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
    </div>
  );
}

export default App;
