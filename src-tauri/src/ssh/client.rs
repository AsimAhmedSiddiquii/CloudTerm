use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use std::fs;

use anyhow::{bail, Context, Result};
use serde::Serialize;

use russh::{
    client,
    keys::{
        decode_secret_key,
        key::PrivateKeyWithHashAlg,
        PublicKeyOrCertificate,
    },
    ChannelMsg, ChannelWriteHalf, Disconnect,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};
use russh_sftp::client::SftpSession;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyPrompt {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPassphrasePrompt {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

struct Client {
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    decision: Option<oneshot::Receiver<bool>>,
}

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let public_key = server_public_key.public_key();

        match russh::keys::known_hosts::check_known_hosts(
            &self.host,
            self.port,
            &public_key,
        ) {
            Ok(true) => return Ok(true),
            Ok(false) => {}
            Err(error) => {
                log::warn!("Unable to check known_hosts: {error}");
                return Ok(false);
            }
        }

        let prompt = HostKeyPrompt {
            session_id: self.session_id.clone(),
            host: self.host.clone(),
            port: self.port,
            fingerprint: public_key
                .fingerprint(russh::keys::HashAlg::Sha256)
                .to_string(),
        };
        let _ = self.app.emit("ssh-host-key", &prompt);

        let accepted = match self.decision.take() {
            Some(receiver) => receiver.await.unwrap_or(false),
            None => false,
        };

        if accepted {
            if let Err(error) = russh::keys::known_hosts::learn_known_hosts(
                &self.host,
                self.port,
                &public_key,
            ) {
                log::warn!("Unable to save known host: {error}");
                return Ok(false);
            }
        }

        Ok(accepted)
    }
}

struct ActiveSession {
    session: client::Handle<Client>,
    writer: ChannelWriteHalf<client::Msg>,
}

#[derive(Default)]
pub struct SshState {
    active: Mutex<HashMap<String, ActiveSession>>,
    pending_host_keys: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    pending_key_passphrases: Mutex<HashMap<String, oneshot::Sender<String>>>,
}

pub async fn connect_interactive(
    app: AppHandle,
    state: &SshState,
    session_id: String,
    host: String,
    port: u16,
    username: String,
    key_contents: String,
    command_on_connect: String,
    cols: u32,
    rows: u32,
) -> Result<()> {
    if session_id.trim().is_empty() {
        bail!("Session id is required");
    }
    if host.trim().is_empty() {
        bail!("Host is required");
    }
    if username.trim().is_empty() {
        bail!("Username is required");
    }

    let key_pair = match decode_secret_key(&key_contents, None) {
        Ok(key) => key,
        Err(russh::keys::Error::KeyIsEncrypted) => {
            let (passphrase_tx, passphrase_rx) = oneshot::channel();
            state
                .pending_key_passphrases
                .lock()
                .await
                .insert(session_id.clone(), passphrase_tx);

            let _ = app.emit(
                "ssh-key-passphrase",
                KeyPassphrasePrompt {
                    session_id: session_id.clone(),
                },
            );

            let passphrase = passphrase_rx
                .await
                .map_err(|_| anyhow::anyhow!("SSH key passphrase prompt was cancelled"))?;
            state.pending_key_passphrases.lock().await.remove(&session_id);

            decode_secret_key(&key_contents, Some(&passphrase))
                .context("Unable to decode the SSH key with that passphrase")?
        }
        Err(error) => {
            return Err(anyhow::anyhow!(
                "Unable to decode the imported SSH key: {error}"
            ));
        }
    };
    let mut client_config = client::Config::default();
    client_config.keepalive_interval = Some(Duration::from_secs(30));
    client_config.keepalive_max = 3;
    let config = Arc::new(client_config);
    let (decision_tx, decision_rx) = oneshot::channel();
    state
        .pending_host_keys
        .lock()
        .await
        .insert(session_id.clone(), decision_tx);

    let mut session = match tokio::time::timeout(
        Duration::from_secs(20),
        client::connect(
        config,
        (host.as_str(), port),
        Client {
            app: app.clone(),
            session_id: session_id.clone(),
            host: host.clone(),
            port,
            decision: Some(decision_rx),
        },
        ),
    )
    .await
    .map_err(|_| anyhow::anyhow!("Connection timed out after 20 seconds"))
    .and_then(|result| {
        result.with_context(|| format!("Unable to connect to {}:{}", host, port))
    })
    {
        Ok(session) => session,
        Err(error) => {
            state.pending_host_keys.lock().await.remove(&session_id);
            return Err(error);
        }
    };

    state.pending_host_keys.lock().await.remove(&session_id);

    let hash_alg = session.best_supported_rsa_hash().await?.flatten();
    let auth = session
        .authenticate_publickey(
            username,
            PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash_alg),
        )
        .await?;
    if !auth.success() {
        bail!("SSH authentication failed");
    }

    let channel = session
        .channel_open_session()
        .await
        .context("Unable to create SSH channel")?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await?;
    channel.request_shell(false).await?;
    let (mut reader, writer) = channel.split();

    if !command_on_connect.trim().is_empty() {
        writer
            .data_bytes(format!("{}\n", command_on_connect.trim()).into_bytes())
            .await?;
    }

    if let Some(old) = state.active.lock().await.insert(
        session_id.clone(),
        ActiveSession { session, writer },
    ) {
        let _ = old.writer.close().await;
        let _ = old
            .session
            .disconnect(Disconnect::ByApplication, "Replacing terminal", "English")
            .await;
    }

    tokio::spawn(async move {
        let output_event = format!("ssh-output:{session_id}");
        let closed_event = format!("ssh-closed:{session_id}");
        while let Some(message) = reader.wait().await {
            match message {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    let _ = app.emit(&output_event, data.to_vec());
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    let _ = app.emit(&format!("ssh-exit:{session_id}"), exit_status);
                }
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        let _ = app.emit(&closed_event, ());
    });

    Ok(())
}

pub async fn host_key_decision(
    state: &SshState,
    session_id: String,
    accepted: bool,
) -> Result<()> {
    if let Some(sender) = state.pending_host_keys.lock().await.remove(&session_id) {
        let _ = sender.send(accepted);
    }
    Ok(())
}

pub async fn key_passphrase(
    state: &SshState,
    session_id: String,
    passphrase: String,
) -> Result<()> {
    if let Some(sender) = state
        .pending_key_passphrases
        .lock()
        .await
        .remove(&session_id)
    {
        let _ = sender.send(passphrase);
    }
    Ok(())
}

pub async fn send_input(
    state: &SshState,
    session_id: String,
    data: String,
) -> Result<()> {
    let active = state.active.lock().await;
    active
        .get(&session_id)
        .context("No active SSH session")?
        .writer
        .data_bytes(data.into_bytes())
        .await?;
    Ok(())
}

pub async fn resize_terminal(
    state: &SshState,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<()> {
    let active = state.active.lock().await;
    active
        .get(&session_id)
        .context("No active SSH session")?
        .writer
        .window_change(cols, rows, 0, 0)
        .await?;
    Ok(())
}

pub async fn disconnect(state: &SshState, session_id: String) -> Result<()> {
    if let Some(session) = state.active.lock().await.remove(&session_id) {
        let _ = session.writer.close().await;
        session
            .session
            .disconnect(Disconnect::ByApplication, "User disconnected", "English")
            .await?;
    }
    Ok(())
}

async fn open_sftp(state: &SshState, session_id: &str) -> Result<SftpSession> {
    let active = state.active.lock().await;
    let session = active
        .get(session_id)
        .context("No active SSH session")?;
    let channel = session
        .session
        .channel_open_session()
        .await
        .context("Unable to open the SFTP channel")?;
    drop(active);
    channel
        .request_subsystem(true, "sftp")
        .await
        .context("The server does not support SFTP")?;
    SftpSession::new(channel.into_stream())
        .await
        .context("Unable to initialize SFTP")
}

pub async fn sftp_list(
    state: &SshState,
    session_id: String,
    path: String,
) -> Result<Vec<RemoteEntry>> {
    let sftp = open_sftp(state, &session_id).await?;
    let mut entries = Vec::new();
    for entry in sftp.read_dir(path).await? {
        let metadata = entry.metadata();
        entries.push(RemoteEntry {
            name: entry.file_name(),
            path: entry.path(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    sftp.close().await?;
    entries.sort_by_key(|entry| (!entry.is_dir, entry.name.to_lowercase()));
    Ok(entries)
}

pub async fn sftp_download(
    state: &SshState,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<()> {
    let sftp = open_sftp(state, &session_id).await?;
    let contents = sftp.read(remote_path).await?;
    sftp.close().await?;
    fs::write(&local_path, contents)
        .with_context(|| format!("Unable to write local file: {local_path}"))?;
    Ok(())
}

pub async fn sftp_upload(
    state: &SshState,
    session_id: String,
    local_path: String,
    remote_path: String,
) -> Result<()> {
    let contents = fs::read(&local_path)
        .with_context(|| format!("Unable to read local file: {local_path}"))?;
    let sftp = open_sftp(state, &session_id).await?;
    sftp.write(remote_path, &contents).await?;
    sftp.close().await?;
    Ok(())
}
