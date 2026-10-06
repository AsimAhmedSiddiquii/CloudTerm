import {
  useEffect,
  useState,
} from "react";

import "./App.css";

import Sidebar from "./components/Sidebar";
import AwsConnectionForm from "./components/AwsConnectionForm";
import TerminalView from "./components/TerminalView";

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

  useEffect(() => {
    refreshConnections().catch(
      console.error
    );
  }, []);

  async function handleSave(
    draft: ConnectionDraft
  ) {
    const connection:
      SavedConnection = {
        ...draft,

        id: crypto.randomUUID(),

        provider: "aws",

        createdAt:
          new Date().toISOString(),
      };

    await saveConnection(connection);

    await refreshConnections();
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
    setActiveConnection(connection);

    setShowNewConnection(false);
  }

  async function handleDelete(
    id: string
  ) {
    await deleteConnection(id);

    if (
      activeConnection?.id === id
    ) {
      setActiveConnection(null);
    }

    await refreshConnections();
  }

  function openNewConnection() {
    setActiveConnection(null);

    setShowNewConnection(true);
  }

  return (
    <div className="app-shell">
      <Sidebar
        connections={connections}
        activeId={
          activeConnection?.id
        }
        onSelect={
          handleSavedSelect
        }
        onAdd={
          openNewConnection
        }
        onDelete={
          handleDelete
        }
      />

      <main className="main-content">
        {activeConnection ? (
          <TerminalView
            host={
              activeConnection.host
            }
            port={
              activeConnection.port
            }
            username={
              activeConnection.username
            }
            keyPath={
              activeConnection.keyPath
            }
            onBack={() => {
              setActiveConnection(
                null
              );

              setShowNewConnection(
                false
              );
            }}
          />
        ) : showNewConnection ? (
          <AwsConnectionForm
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