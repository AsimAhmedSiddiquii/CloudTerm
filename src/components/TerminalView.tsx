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

  onBack: () => void;

  onConnected?: () => void;
  onDisconnected?: () => void;
  onFailed?: () => void;
  onRetry?: () => void;
  onHostKeyPrompt?: (prompt: HostKeyPrompt) => void;
  onKeyPassphrasePrompt?: (prompt: KeyPassphrasePrompt) => void;
  onSplitToggle?: () => void;
  onSftpOpen?: () => void;
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
  onBack,
  onConnected,
  onDisconnected,
  onFailed,
  onRetry,
  onHostKeyPrompt,
  onKeyPassphrasePrompt,
  onSplitToggle,
  onSftpOpen,
  splitMode = false,
  status = "connecting",
}: Props) {
  const [retryCount, setRetryCount] = useState(0);
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
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#ffffff",
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

      unlistenHostKey = await listen<HostKeyPrompt>(
        "ssh-host-key",
        (event) => {
          if (event.payload.sessionId === sessionId) {
            onHostKeyPrompt?.(event.payload);
          }
        }
      );

      unlistenKeyPassphrase = await listen<KeyPassphrasePrompt>(
        "ssh-key-passphrase",
        (event) => {
          if (event.payload.sessionId === sessionId) {
            onKeyPassphrasePrompt?.(event.payload);
          }
        }
      );

      try {
        const keyContents = await readKey(
          vaultPassword,
          keyId
        );
        const bastionKeyContents = bastion
          ? await readKey(vaultPassword, bastion.keyId)
          : undefined;

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
            },
          }
        );

        lifecycleCallbacks.current.onConnected?.();
      } catch (error) {
        lifecycleCallbacks.current.onFailed?.();

        terminal.write(
          `\r\n\x1b[31mConnection failed: ${String(
            error
          )}\x1b[0m\r\n`
        );

      }
    }

    start();

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
    onHostKeyPrompt,
    onKeyPassphrasePrompt,
    retryCount,
  ]);

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div>
          <strong>
            {username}@{host}
          </strong>

          <span className={`terminal-status terminal-status-${status}`}>
            ● Connected
          </span>
        </div>

        {onSplitToggle && (
          <button
            onClick={onSplitToggle}
            className="split-button"
            type="button"
          >
            {splitMode ? "Single view" : "Split view"}
          </button>
        )}

        {onSftpOpen && (
          <button
            onClick={onSftpOpen}
            className="split-button"
            type="button"
          >
            Files
          </button>
        )}

        {status === "failed" && (
          <button
            onClick={() => {
              onRetry?.();
              setRetryCount((count) => count + 1);
            }}
            className="split-button"
            type="button"
          >
            Reconnect
          </button>
        )}

        <button
          onClick={onBack}
          className="disconnect-button"
        >
          Disconnect
        </button>
      </div>

      <div
        ref={terminalContainer}
        className="xterm-container"
      />
    </div>
  );
}
