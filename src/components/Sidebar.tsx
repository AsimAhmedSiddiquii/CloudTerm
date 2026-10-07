import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { SavedConnection } from "../types/connection";

import cloudTermIcon from "../assets/cloudterm-icon.png";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed";

interface Props {
  connections: SavedConnection[];
  activeId?: string;
  status: ConnectionStatus;

  onSelect: (connection: SavedConnection) => void;
  onEdit: (connection: SavedConnection) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onKeys: () => void;
  onDiscover: () => void;
  onImportConfig: () => void;
  onBackup: () => void;
}

export default function Sidebar({
  connections,
  activeId,
  status,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
  onKeys,
  onDiscover,
  onImportConfig,
  onBackup,
}: Props) {
  const [query, setQuery] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    let mounted = true;

    getVersion()
      .then((version) => {
        if (mounted) {
          setAppVersion(version);
        }
      })
      .catch(() => {
        // The browser-only development preview has no Tauri app metadata.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const visibleConnections = normalizedQuery
    ? connections.filter((connection) =>
      [connection.name, connection.host, connection.username, connection.keyName]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    )
    : connections;

  function getStatusClass(id: string) {
    if (activeId !== id) {
      return "status-disconnected";
    }

    if (status === "failed") {
      return "status-failed";
    }

    if (status === "connected") {
      return "status-connected";
    }

    if (status === "connecting") {
      return "status-connecting";
    }

    return "status-disconnected";
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img
          src={cloudTermIcon}
          alt="CloudTerm"
          className="brand-icon-image"
        />

        <div>
          <div className="brand-name">
            CloudTerm
          </div>

          <div className="brand-subtitle">
            SSH Manager
          </div>
        </div>
      </div>

      <button
        className="new-connection-button"
        onClick={onAdd}
      >
        + New Connection
      </button>

      <button className="keys-nav-button" type="button" onClick={onKeys}>
        <span>⌁</span>
        SSH Keys
      </button>

      <button className="keys-nav-button discovery-nav-button" type="button" onClick={onDiscover}>
        <span>⌁</span>
        Discover EC2
      </button>

      <button className="keys-nav-button" type="button" onClick={onImportConfig}>
        <span>⌘</span>
        Import SSH config
      </button>

      <button className="keys-nav-button" type="button" onClick={onBackup}>
        <span>⇄</span>
        Backup connections
      </button>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          AWS
        </div>

        <input
          className="connection-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter connections"
          aria-label="Filter saved connections"
        />

        <div className="connection-list">
          {connections.length === 0 && (
            <div className="empty-connections">
              No connections saved
            </div>
          )}

          {connections.length > 0 && visibleConnections.length === 0 && (
            <div className="empty-connections">
              No matching connections
            </div>
          )}

          {visibleConnections.map((connection) => (
            <div
              key={connection.id}
              className={
                activeId === connection.id
                  ? "connection-item active"
                  : "connection-item"
              }
            >
              <button
                className="connection-main"
                onClick={() =>
                  onSelect(connection)
                }
              >
                <span
                  className={`connection-status ${getStatusClass(
                    connection.id
                  )}`}
                >
                  ●
                </span>

                <span className="connection-details">
                  <span className="connection-name">
                    {connection.name}
                  </span>

                  <span className="connection-host">
                    {connection.username}@
                    {connection.host}
                  </span>
                </span>
              </button>

              <div className="connection-actions-small">
                <button
                  className="connection-edit"
                  title="Edit connection"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(connection);
                  }}
                >
                  ✎
                </button>

                <button
                  className="connection-delete"
                  title="Delete connection"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(connection.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <span>AWS · SSH Manager</span>
        <span className="app-version">{appVersion ? `v${appVersion}` : "CloudTerm"}</span>
      </div>
    </aside>
  );
}
