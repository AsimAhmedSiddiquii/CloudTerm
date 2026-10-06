import type { SavedConnection } from "../types/connection";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected";

interface Props {
  connections: SavedConnection[];
  activeId?: string;
  status: ConnectionStatus;

  onSelect: (connection: SavedConnection) => void;
  onEdit: (connection: SavedConnection) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export default function Sidebar({
  connections,
  activeId,
  status,
  onSelect,
  onEdit,
  onDelete,
  onAdd,
}: Props) {
  function getStatusClass(id: string) {
    if (activeId !== id) {
      return "status-disconnected";
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
        <div className="brand-icon">C</div>

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

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          AWS
        </div>

        <div className="connection-list">
          {connections.length === 0 && (
            <div className="empty-connections">
              No connections saved
            </div>
          )}

          {connections.map((connection) => (
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
        AWS
      </div>
    </aside>
  );
}