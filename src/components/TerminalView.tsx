import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Terminal,
} from "@xterm/xterm";

import {
  FitAddon,
} from "@xterm/addon-fit";

import {
  invoke,
} from "@tauri-apps/api/core";

import {
  listen,
} from "@tauri-apps/api/event";
import { readKey } from "../services/keyVault";
import type { BastionConfig } from "../types/connection";

import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  keyId: string;
  vaultPassword: string;
  commandOnConnect: string;
  bastion?: BastionConfig;
  connectTimeoutSeconds?: number;
  keepAliveSeconds?: number;

  onBack: () => void;

  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: () => void;
  onRetry?: () => void;
  onHostKeyPrompt?: (prompt: HostKeyPrompt) => void;
  onKeyPassphrasePrompt?: (prompt: KeyPassphrasePrompt) => void;
  onSplitToggle?: () => void;
  onSftpOpen?: () => void;
  onForwardOpen?: () => void;
  splitMode?: boolean;
  status?: "disconnected" | "connecting" | "connected" | "failed";
}

export interface HostKeyPrompt {
  sessionId: string;
  host: string;
  port: number;
  fingerprint: string;
}

export interface KeyPassphrasePrompt {
  sessionId: string;
}

export default function TerminalView({
  sessionId,
  host,
  port,
  username,
  keyId,
  vaultPassword,
  commandOnConnect,
  bastion,
  connectTimeoutSeconds,
  keepAliveSeconds,
  onBack,
  onConnected,
  onDisconnected,
  onFailed,
  onRetry,
  onHostKeyPrompt,
  onKeyPassphrasePrompt,
  onSplitToggle,
  onSftpOpen,
  onForwardOpen,
  splitMode = false,
  status = "connecting",
}: Props) {
  const statusLabel = status === "connected"
    ? "Connected"
    : status === "connecting"
      ? "Connecting"
      : status === "failed"
        ? "Connection failed"
        : "Disconnected";
  const [retryCount, setRetryCount] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const terminalContainer =
    useRef<HTMLDivElement>(null);
  const lifecycleCallbacks = useRef({
    onConnected,
    onDisconnected,
    onFailed,
  });
  useEffect(() => {
    lifecycleCallbacks.current = { onConnected, onDisconnected, onFailed };
  }, [onConnected, onDisconnected, onFailed]);

  useEffect(() => {
    if (!terminalContainer.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        'Consolas, "Courier New", monospace',
      fontSize: 14,
      scrollback: 5000,
      convertEol: false,

      theme: {
        background: "#050805",
        foreground: "#98f5a2",
        cursor: "#5cff72",
        cursorAccent: "#050805",
        selectionBackground: "#174d2a",
        black: "#050805",
        red: "#ff5f56",
        green: "#5cff72",
        yellow: "#f3f99d",
        blue: "#57c7ff",
        magenta: "#ff6ac1",
        cyan: "#9aedfe",
        white: "#d7fbdc",
        brightBlack: "#5c6b5f",
        brightRed: "#ff7b72",
        brightGreen: "#8aff9b",
        brightYellow: "#fff7a8",
        brightBlue: "#82d2ff",
        brightMagenta: "#ff92d0",
        brightCyan: "#b8f6ff",
        brightWhite: "#f0fff2",
      },
    });

    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);

    terminal.open(
      terminalContainer.current
    );

    fitAddon.fit();

    terminal.focus();

    let disposed = false;

    let unlistenOutput:
      | (() => void)
      | undefined;

    let unlistenClosed:
      | (() => void)
      | undefined;

    let unlistenHostKey:
      | (() => void)
      | undefined;

    let unlistenKeyPassphrase:
      | (() => void)
      | undefined;

    async function start() {
      /*
       * Listen BEFORE connecting so that we
       * don't miss the initial shell prompt.
       */
      unlistenOutput =
        await listen<number[]>(
          `ssh-output:${sessionId}`,
          (event) => {
            terminal.write(
              new Uint8Array(
                event.payload
              )
            );
          }
        );
      if (disposed) {
        unlistenOutput();
        return;
      }

      unlistenClosed =
        await listen(
          `ssh-closed:${sessionId}`,
          () => {
            lifecycleCallbacks.current.onDisconnected?.();

            terminal.write(
              "\r\n\x1b[31mConnection closed.\x1b[0m\r\n"
            );
          }
        );
      if (disposed) {
        unlistenClosed();
        return;
      }

      unlistenHostKey = await listen<HostKeyPrompt>(
        "ssh-host-key",
        (event) => {
          if (event.payload.sessionId === sessionId) {
            onHostKeyPrompt?.(event.payload);
          }
        }
      );
      if (disposed) {
        unlistenHostKey();
        return;
      }

      unlistenKeyPassphrase = await listen<KeyPassphrasePrompt>(
        "ssh-key-passphrase",
        (event) => {
          if (event.payload.sessionId === sessionId) {
            onKeyPassphrasePrompt?.(event.payload);
          }
        }
      );
      if (disposed) {
        unlistenKeyPassphrase();
        return;
      }

      try {
        if (!disposed) {
          setConnectionError("");
        }
        const keyContents = await readKey(
          vaultPassword,
          keyId
        );
        const bastionKeyContents = bastion
          ? await readKey(vaultPassword, bastion.keyId)
          : undefined;
        if (disposed) {
          return;
        }

        await invoke(
          "connect_aws_ssh",
          {
            request: {
              sessionId,
              host,
              port,
              username,
              keyContents,
              commandOnConnect,
              cols: terminal.cols,
              rows: terminal.rows,
              bastion: bastion && bastionKeyContents ? {
                host: bastion.host,
                port: bastion.port,
                username: bastion.username,
                keyContents: bastionKeyContents,
              } : null,
              connectTimeoutSeconds,
              keepAliveSeconds,
            },
          }
        );

        if (disposed) {
          return;
        }
        lifecycleCallbacks.current.onConnected?.();
      } catch (error) {
        if (disposed) {
          return;
        }
        lifecycleCallbacks.current.onFailed?.();
        if (!disposed) {
          setConnectionError(String(error));
        }

        terminal.write(
          `\r\n\x1b[31mConnection failed: ${String(
            error
          )}\x1b[0m\r\n`
        );

      }
    }

    start().catch((error) => {
      if (disposed) {
        return;
      }
      lifecycleCallbacks.current.onFailed?.();
      setConnectionError(String(error));
      terminal.write(`\r\n\x1b[31mConnection setup failed: ${String(error)}\x1b[0m\r\n`);
    });

    const dataDisposable =
      terminal.onData(
        async (data) => {
          try {
            await invoke(
              "ssh_input",
              {
                sessionId,
                data,
              }
            );
          } catch (error) {
            console.error(
              "SSH input error:",
              error
            );
          }
        }
      );

    const resizeObserver =
      new ResizeObserver(() => {
        if (disposed) {
          return;
        }

        fitAddon.fit();

        invoke(
          "ssh_resize",
          {
            sessionId,
            cols: terminal.cols,
            rows: terminal.rows,
          }
        ).catch(() => { });
      });

    resizeObserver.observe(
      terminalContainer.current
    );

    return () => {
      disposed = true;

      resizeObserver.disconnect();

      dataDisposable.dispose();

      unlistenOutput?.();
      unlistenClosed?.();
      unlistenHostKey?.();
      unlistenKeyPassphrase?.();

      invoke("ssh_disconnect", { sessionId })
        .catch(() => { });

      terminal.dispose();
    };
  }, [
    sessionId,
    host,
    port,
    username,
    keyId,
    vaultPassword,
    commandOnConnect,
    bastion,
    connectTimeoutSeconds,
    keepAliveSeconds,
    onHostKeyPrompt,
    onKeyPassphrasePrompt,
    retryCount,
  ]);

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div className="terminal-identity">
          <strong>
            {username}@{host}
          </strong>

          <span className={`terminal-status terminal-status-${status}`} data-status={statusLabel} aria-live="polite">
            ● {statusLabel}
          </span>
        </div>

        <div className="terminal-actions">
          {onSplitToggle && (
            <button
              onClick={onSplitToggle}
              className="split-button"
              type="button"
            >
              <span className="terminal-action-icon" aria-hidden="true">⊞</span>
              {splitMode ? "Single" : "Split"}
            </button>
          )}

          {onSftpOpen && (
            <button
              onClick={onSftpOpen}
              className="split-button"
              type="button"
            >
              <span className="terminal-action-icon" aria-hidden="true">▰</span>
              Files
            </button>
          )}

          {onForwardOpen && (
            <button onClick={onForwardOpen} className="split-button" type="button">
              <span className="terminal-action-icon" aria-hidden="true">⇄</span>
              Forward
            </button>
          )}

          {(status === "failed" || status === "disconnected") && (
            <button
              onClick={() => {
                onRetry?.();
                setRetryCount((count) => count + 1);
              }}
              className="split-button"
              type="button"
            >
              <span className="terminal-action-icon" aria-hidden="true">↻</span>
              Reconnect
            </button>
          )}

          <button
            onClick={onBack}
            className="disconnect-button"
            type="button"
          >
            <span className="terminal-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3v9M7.1 5.8a8 8 0 1 0 9.8 0" />
              </svg>
            </span>
            Disconnect
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="terminal-error" role="alert">
          <strong>Connection failed</strong>
          <span>{connectionError}</span>
        </div>
      )}

      <div
        ref={terminalContainer}
        className="xterm-container"
      />
    </div>
  );
}
