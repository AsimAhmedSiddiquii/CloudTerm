use std::sync::Arc;

use anyhow::{bail, Context, Result};

use russh::{
    client,
    keys::{
        key::PrivateKeyWithHashAlg,
        load_secret_key,
        PublicKeyOrCertificate,
    },
    ChannelMsg,
    ChannelWriteHalf,
    Disconnect,
};

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

struct Client;

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        // TEMPORARY.
        // We'll implement known_hosts / fingerprint verification soon.
        Ok(true)
    }
}

struct ActiveSession {
    session: client::Handle<Client>,
    writer: ChannelWriteHalf<client::Msg>,
}

#[derive(Default)]
pub struct SshState {
    active: Mutex<Option<ActiveSession>>,
}

pub async fn connect_interactive(
    app: AppHandle,
    state: &SshState,
    host: String,
    port: u16,
    username: String,
    key_path: String,
    cols: u32,
    rows: u32,
) -> Result<()> {
    if host.trim().is_empty() {
        bail!("Host is required");
    }

    if username.trim().is_empty() {
        bail!("Username is required");
    }

    let key_pair = load_secret_key(&key_path, None)
        .with_context(|| format!("Unable to load key: {}", key_path))?;

    let config = Arc::new(client::Config::default());

    let mut session = client::connect(
        config,
        (host.as_str(), port),
        Client {},
    )
    .await
    .with_context(|| {
        format!("Unable to connect to {}:{}", host, port)
    })?;

    let hash_alg = session
        .best_supported_rsa_hash()
        .await?
        .flatten();

    let auth = session
        .authenticate_publickey(
            username,
            PrivateKeyWithHashAlg::new(
                Arc::new(key_pair),
                hash_alg,
            ),
        )
        .await?;

    if !auth.success() {
        bail!("SSH authentication failed");
    }

    let channel = session
        .channel_open_session()
        .await
        .context("Unable to create SSH channel")?;

    // Request a real interactive terminal.
    channel
        .request_pty(
            false,
            "xterm-256color",
            cols,
            rows,
            0,
            0,
            &[],
        )
        .await?;

    channel
        .request_shell(false)
        .await?;

    let (mut reader, writer) = channel.split();

    // Close an existing terminal session if present.
    {
        let mut active = state.active.lock().await;

        if let Some(old) = active.take() {
            let _ = old.writer.close().await;

            let _ = old
                .session
                .disconnect(
                    Disconnect::ByApplication,
                    "Opening another connection",
                    "English",
                )
                .await;
        }

        *active = Some(ActiveSession {
            session,
            writer,
        });
    }

    // Continuously forward SSH output to React/xterm.js.
    tokio::spawn(async move {
        while let Some(message) = reader.wait().await {
            match message {
                ChannelMsg::Data { data } => {
                    let _ = app.emit(
                        "ssh-output",
                        data.to_vec(),
                    );
                }

                ChannelMsg::ExtendedData { data, .. } => {
                    let _ = app.emit(
                        "ssh-output",
                        data.to_vec(),
                    );
                }

                ChannelMsg::ExitStatus { exit_status } => {
                    let _ = app.emit(
                        "ssh-exit",
                        exit_status,
                    );
                }

                ChannelMsg::Close => {
                    break;
                }

                _ => {}
            }
        }

        let _ = app.emit("ssh-closed", ());
    });

    Ok(())
}

pub async fn send_input(
    state: &SshState,
    data: String,
) -> Result<()> {
    let active = state.active.lock().await;

    let session = active
        .as_ref()
        .context("No active SSH session")?;

    session
        .writer
        .data_bytes(data.into_bytes())
        .await?;

    Ok(())
}

pub async fn resize_terminal(
    state: &SshState,
    cols: u32,
    rows: u32,
) -> Result<()> {
    let active = state.active.lock().await;

    let session = active
        .as_ref()
        .context("No active SSH session")?;

    session
        .writer
        .window_change(
            cols,
            rows,
            0,
            0,
        )
        .await?;

    Ok(())
}

pub async fn disconnect(
    state: &SshState,
) -> Result<()> {
    let mut active = state.active.lock().await;

    if let Some(session) = active.take() {
        let _ = session.writer.close().await;

        session
            .session
            .disconnect(
                Disconnect::ByApplication,
                "User disconnected",
                "English",
            )
            .await?;
    }

    Ok(())
}