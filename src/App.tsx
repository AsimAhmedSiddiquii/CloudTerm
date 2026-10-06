import {
  useEffect,
  useState,
} from "react";

import "./App.css";

import Sidebar from "./components/Sidebar";
import AwsConnectionForm from "./components/AwsConnectionForm";
import TerminalView from "./components/TerminalView";

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

    setShowNewConnection(false);
  }

  function handleSavedSelect(
    connection: SavedConnection
  ) {
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
          <TerminalView
            host={activeConnection.host}
            port={activeConnection.port}
            username={
              activeConnection.username
            }
            keyPath={
              activeConnection.keyPath
            }

            onConnected={() =>
              setConnectionStatus(
                "connected"
              )
            }

            onDisconnected={() =>
              setConnectionStatus(
                "disconnected"
              )
            }

            onBack={() => {
              setActiveConnection(null);

              setConnectionStatus(
                "disconnected"
              );

              setShowNewConnection(
                false
              );
            }}
          />
        ) : showNewConnection ? (
          <AwsConnectionForm
            initialConnection={
              editingConnection
            }
            onSave={handleSave}
            onConnect={
              handleConnect
            }
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
    </div>
  );
}

export default App;