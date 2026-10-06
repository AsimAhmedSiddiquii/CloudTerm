import type {
  SavedConnection,
} from "../types/connection";

interface Props {
  connections: SavedConnection[];

  activeId?: string;

  onSelect: (
    connection: SavedConnection
  ) => void;

  onAdd: () => void;

  onDelete: (
    id: string
  ) => void;
}

export default function Sidebar({
  connections,
  activeId,
  onSelect,
  onAdd,
  onDelete,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          C
        </div>

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

          {connections.map(
            (connection) => (
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
                  <span className="connection-status">
                    ●
                  </span>

                  <span className="connection-details">
                    <span className="connection-name">
                      {connection.name}
                    </span>

                    <span className="connection-host">
                      {connection.username}
                      @
                      {connection.host}
                    </span>
                  </span>
                </button>

                <button
                  className="connection-delete"
                  title="Delete connection"
                  onClick={(event) => {
                    event.stopPropagation();

                    onDelete(
                      connection.id
                    );
                  }}
                >
                  ×
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        AWS
      </div>
    </aside>
  );
}