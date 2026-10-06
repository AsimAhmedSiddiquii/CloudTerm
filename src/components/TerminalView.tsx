import {
  useEffect,
  useRef,
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

import "@xterm/xterm/css/xterm.css";

interface Props {
  host: string;
  port: number;
  username: string;
  keyPath: string;
  onBack: () => void;
}

export default function TerminalView({
  host,
  port,
  username,
  keyPath,
  onBack,
}: Props) {
  const terminalContainer =
    useRef<HTMLDivElement>(null);

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

    async function start() {
      /*
       * Listen BEFORE connecting so that we
       * don't miss the initial shell prompt.
       */
      unlistenOutput =
        await listen<number[]>(
          "ssh-output",
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
          "ssh-closed",
          () => {
            terminal.write(
              "\r\n\x1b[31mConnection closed.\x1b[0m\r\n"
            );
          }
        );

      try {
        await invoke(
          "connect_aws_ssh",
          {
            request: {
              host,
              port,
              username,
              keyPath,
              cols: terminal.cols,
              rows: terminal.rows,
            },
          }
        );
      } catch (error) {
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
            cols: terminal.cols,
            rows: terminal.rows,
          }
        ).catch(() => {});
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

      invoke(
        "ssh_disconnect"
      ).catch(() => {});

      terminal.dispose();
    };
  }, [
    host,
    port,
    username,
    keyPath,
  ]);

  return (
    <div className="terminal-page">
      <div className="terminal-header">
        <div>
          <strong>
            {username}@{host}
          </strong>

          <span className="connected">
            ● Connected
          </span>
        </div>

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